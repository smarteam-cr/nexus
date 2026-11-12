/**
 * lib/canvas/secciones-del-documento-server.ts — AGREGAR UNA SECCIÓN DEL CATÁLOGO Y DUPLICAR UNA SECCIÓN, en un documento
 * del proyecto (2026-11-12, Elías). SERVIDOR. Las reglas puras viven en ./secciones-agregadas.ts y en
 * lib/landing/custom-sections.ts (la key de una copia); las rutas solo ponen el guard.
 *
 * Las dos escrituras van en UNA transacción que toma el documento (FOR UPDATE: el Json de secciones lo escriben también
 * el ojo, los briefs y la plantilla anotada) y hacen lo que todo el motor espera de una sección: la FILA (con su orden:
 * las de abajo bajan un lugar) y la ENTRY del Json, de donde salen `hidden`, el índice del panel y la marca de agregada.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseSectionEntries, patchSectionEntry } from "@/lib/business-cases/section-briefs";
import { canvasDefForSlug } from "@/lib/canvas/canvas-defs";
import { catalogoDelTipo, defsDelTipo } from "@/lib/artefactos/catalogo";
import { tipoDelDocumento } from "@/lib/artefactos/copias";
import { tipoDeArtefacto } from "@/lib/artefactos/tipos";
import { CUSTOM_PREFIX, keyParaDuplicar, MAX_CUSTOM_SECTIONS, nombreDeLaCopia } from "@/lib/landing/custom-sections";
import { documentoAprobado, MENSAJE_APROBADO } from "@/lib/canvas/estado-del-documento-servidor";
import { lugarDeLaNueva, motivoParaNoDuplicar, seccionesAgregables, type SeccionAgregable } from "./secciones-agregadas";

export class ErrorDeSeccion extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const SIN_DOCUMENTO = "Ese documento no es de este proyecto.";

async function documento(projectId: string, canvasId: string) {
  const c = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { id: true, projectId: true, slug: true, tipoArtefacto: true, name: true, businessCaseId: true, sections: true },
  });
  if (!c || c.projectId !== projectId) throw new ErrorDeSeccion(404, SIN_DOCUMENTO);
  const tipo = tipoDelDocumento(c);
  return { canvas: c, tipo };
}

/** Las secciones del catálogo que el documento puede agregar (vacío si su tipo no tiene catálogo). */
export async function seccionesQueSePuedenAgregar(projectId: string, canvasId: string): Promise<SeccionAgregable[]> {
  const { canvas, tipo } = await documento(projectId, canvasId);
  if (!tipo) return [];
  const filas = await prisma.canvasSection.findMany({ where: { canvasId }, select: { key: true } });
  return seccionesAgregables(catalogoDelTipo(tipo), filas, canvas.sections);
}

/** El nombre visible de una sección del documento: el que le puso una persona, o el de su fila. */
function tituloDe(s: { titleOverride: string | null; label: string }): string {
  return (s.titleOverride ?? "").trim() || s.label;
}

/**
 * Agrega una sección del CATÁLOGO del tipo al documento, con la marca `agregadaPorPersona`: la plantilla la respeta al
 * generar (la IA la escribe) y al ajustarse (no la oculta ni la borra). Si la plantilla la tenía oculta, la vuelve a
 * mostrar con lo que tenía. Si no existe, la crea en su lugar del canon (antes del cierre), con la semilla de su canvas
 * si es de las que se llenan a mano.
 */
export async function agregarDelCatalogo(projectId: string, canvasId: string, key: string): Promise<{ id: string }> {
  const { canvas, tipo } = await documento(projectId, canvasId);
  if (!tipo) throw new ErrorDeSeccion(400, "Este documento no tiene secciones para agregar.");
  if (await documentoAprobado(canvasId).catch(() => false)) throw new ErrorDeSeccion(409, MENSAJE_APROBADO);
  const filas = await prisma.canvasSection.findMany({ where: { canvasId }, orderBy: { order: "asc" }, select: { id: true, key: true, order: true } });
  const agregable = seccionesAgregables(catalogoDelTipo(tipo), filas, canvas.sections).find((s) => s.key === key);
  if (!agregable) throw new ErrorDeSeccion(400, "Esa sección no se puede agregar a este documento (ya la tiene, o no es de su tipo).");

  const existente = filas.find((f) => f.key === key);
  const def = defsDelTipo(tipo)?.find((d) => d.key === key);
  const semilla = canvasDefForSlug(tipo)?.sections.find((s) => s.key === key)?.defaultData;
  const canon = (defsDelTipo(tipo) ?? []).map((d) => d.key);
  const cierre = tipoDeArtefacto(tipo)?.estructurales[1] ?? null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} FOR UPDATE`;
    const c = await tx.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
    let id = existente?.id;
    if (!id) {
      const lugar = lugarDeLaNueva(canon, filas.map((f) => f.key), key, cierre);
      const orden = lugar < filas.length ? filas[lugar].order : (filas.at(-1)?.order ?? -1) + 1;
      await tx.canvasSection.updateMany({ where: { canvasId, order: { gte: orden } }, data: { order: { increment: 1 } } });
      const creada = await tx.canvasSection.create({ data: { canvasId, key, label: def?.label ?? agregable.nombre, order: orden } });
      id = creada.id;
      if (semilla) {
        await tx.canvasBlock.create({
          data: { sectionId: id, blockType: "CARD", data: semilla as Prisma.InputJsonValue, order: 0, source: "HUMAN", status: "CONFIRMED" },
        });
      }
    }
    const patch = existente
      ? { hidden: false, ocultaPorLaPlantilla: false, agregadaPorPersona: true }
      : { label: def?.label ?? agregable.nombre, agregadaPorPersona: true };
    await tx.projectCanvas.update({
      where: { id: canvasId },
      data: { sections: patchSectionEntry(c?.sections, key, patch) as unknown as Prisma.InputJsonValue, contentUpdatedAt: new Date() },
    });
    return { id };
  });
}

/**
 * Duplica una sección justo debajo: una sección PROPIA (`custom:*`) con el mismo contenido, que se pinta igual que la
 * original y se edita a mano. Regenerar no la toca (el agente escribe solo las keys de su plantilla). Se llama como la
 * original con «(copia)» (`nombreDeLaCopia`). Hereda el ojo de la original: la copia de una sección oculta nace oculta
 * (si no, salía al enlace, al PDF y a lo publicado). En el kickoff, cuyo ojo vive en otro lado, lo hace su editor.
 */
export async function duplicarSeccion(projectId: string, sectionId: string): Promise<{ id: string; key: string; oculta: boolean }> {
  const s = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      canvasId: true,
      key: true,
      label: true,
      titleOverride: true,
      eyebrowOverride: true,
      order: true,
      blocks: { orderBy: { order: "asc" }, select: { blockType: true, content: true, data: true, order: true, colSpan: true, colStart: true, rowSpan: true } },
    },
  });
  if (!s) throw new ErrorDeSeccion(404, "Esa sección ya no existe.");
  const { tipo } = await documento(projectId, s.canvasId);
  const motivo = motivoParaNoDuplicar(s.key, tipo ? catalogoDelTipo(tipo) : []);
  if (motivo) throw new ErrorDeSeccion(400, motivo);
  if (await documentoAprobado(s.canvasId).catch(() => false)) throw new ErrorDeSeccion(409, MENSAJE_APROBADO);
  const propias = await prisma.canvasSection.count({ where: { canvasId: s.canvasId, key: { startsWith: CUSTOM_PREFIX } } });
  if (propias >= MAX_CUSTOM_SECTIONS) {
    throw new ErrorDeSeccion(400, `Máximo ${MAX_CUSTOM_SECTIONS} secciones propias por documento (las copias cuentan). Borra una que ya no uses.`);
  }

  const key = keyParaDuplicar(s.key);
  const nombre = nombreDeLaCopia(tituloDe(s));
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${s.canvasId} FOR UPDATE`;
    const c = await tx.projectCanvas.findUnique({ where: { id: s.canvasId }, select: { sections: true } });
    const oculta = parseSectionEntries(c?.sections).some((e) => e.key === s.key && e.hidden === true);
    await tx.canvasSection.updateMany({ where: { canvasId: s.canvasId, order: { gt: s.order } }, data: { order: { increment: 1 } } });
    const copia = await tx.canvasSection.create({
      data: { canvasId: s.canvasId, key, label: nombre, titleOverride: nombre, eyebrowOverride: s.eyebrowOverride, order: s.order + 1 },
    });
    if (s.blocks.length) {
      await tx.canvasBlock.createMany({
        data: s.blocks.map((b) => ({
          sectionId: copia.id,
          blockType: b.blockType,
          content: b.content,
          data: b.data === null ? Prisma.JsonNull : (b.data as Prisma.InputJsonValue),
          order: b.order,
          colSpan: b.colSpan,
          colStart: b.colStart,
          rowSpan: b.rowSpan,
          // De la persona: la IA no la escribe, y su contenido ya no es «lo que propuso la IA».
          source: "HUMAN" as const,
          status: "CONFIRMED" as const,
        })),
      });
    }
    await tx.projectCanvas.update({
      where: { id: s.canvasId },
      data: {
        sections: patchSectionEntry(c?.sections, key, { label: nombre, ...(oculta ? { hidden: true } : {}) }) as unknown as Prisma.InputJsonValue,
        contentUpdatedAt: new Date(),
      },
    });
    return { id: copia.id, key, oculta };
  });
}

