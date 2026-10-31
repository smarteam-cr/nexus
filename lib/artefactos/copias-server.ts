/**
 * lib/artefactos/copias-server.ts — CREAR, NOMBRAR, ORDENAR, TERMINAR Y ARCHIVAR los documentos de un tipo en un proyecto
 * (etapa V3 de docs/artefactos-plan.md). SERVIDOR.
 *
 * Lo que vale para todos:
 *   · todo va POR ID y con el proyecto en el `where`: un id de otro proyecto es «no encontrado», nunca un documento ajeno;
 *   · el documento de siempre (el que tiene `slug`) es uno más para el nombre, el orden y el estado, pero NO se archiva
 *     desde acá (lo leen 105 lugares: apagarlo es una decisión de la pieza, no de una copia);
 *   · una copia nace con `slug = NULL` y `tipoArtefacto`, y sin las secciones que leen el proyecto (`ctxDriven`): pintarían
 *     lo mismo en cada copia (lib/artefactos/catalogo.ts › seccionesDeUnaCopia).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { conPlantillaAnotada } from "@/lib/entregables/registro";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { CLAVE_OCULTAS_DEL_EDITOR, ocultasDelBorrador, ocultasEnElEditor } from "@/lib/kickoff/ocultas-del-editor";
import { kickoffHiddenKey } from "@/components/canvas/kickoff-landing-adapter";
import { admiteCopias, plantillaDelTipo, plantillaGuardadaDelTipo, tipoDeArtefacto } from "./tipos";
import {
  esCopia,
  nombreGuardableDeUnaCopia,
  nombreParaUnaCopiaNueva,
  nombreDelArtefacto,
  ordenarArtefactos,
  tipoDelDocumento,
  tituloLimpio,
} from "./copias";
import { canvasDefDeUnaCopia, seccionesQuePasanAlDuplicar } from "./catalogo";
import { piezaDeLasNotas } from "./contexto-de-la-copia";

export class ErrorDelArtefacto extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Lo que el riel y el editor necesitan de cada documento de un tipo. */
const SELECT_DEL_ARTEFACTO = {
  id: true,
  slug: true,
  tipoArtefacto: true,
  name: true,
  titulo: true,
  order: true,
  createdAt: true,
  terminadoEn: true,
  terminadoPor: true,
  disabledAt: true,
} as const satisfies Prisma.ProjectCanvasSelect;

type FilaDelArtefacto = Prisma.ProjectCanvasGetPayload<{ select: typeof SELECT_DEL_ARTEFACTO }>;

/** Los documentos de un tipo en el proyecto, vivos (sin los archivados), en el orden de la persona. */
export async function documentosDelTipo(projectId: string, tipo: string): Promise<FilaDelArtefacto[]> {
  const filas = await prisma.projectCanvas.findMany({
    where: {
      projectId,
      disabledAt: null,
      OR: [canvasOf(tipo), { slug: null, tipoArtefacto: tipo }],
    },
    select: SELECT_DEL_ARTEFACTO,
  });
  return ordenarArtefactos(filas);
}

/** Un documento del proyecto, por id, con su tipo. 404 si no es de ese proyecto. */
async function documentoDelProyecto(projectId: string, canvasId: string): Promise<FilaDelArtefacto & { tipo: string | null }> {
  const c = await prisma.projectCanvas.findFirst({ where: { id: canvasId, projectId }, select: SELECT_DEL_ARTEFACTO });
  if (!c) throw new ErrorDelArtefacto(404, "Ese documento no es de este proyecto.");
  return { ...c, tipo: tipoDelDocumento(c) };
}

export interface CopiaCreada {
  canvasId: string;
  nombre: string;
}

/**
 * Crea una copia de un tipo en el proyecto: EN BLANCO con las secciones de una plantilla, o DUPLICANDO otro documento del
 * mismo tipo (lo escrito, lo oculto, los títulos editados, las instrucciones y la plantilla anotada). La copia queda
 * última en el orden del tipo y en construcción.
 */
export async function crearCopia(o: {
  projectId: string;
  tipo: string;
  plantillaId?: string | null;
  nombre?: string | null;
  /** Duplicar este documento (del mismo proyecto y del mismo tipo). */
  desdeCanvasId?: string | null;
  porEmail: string | null;
}): Promise<CopiaCreada> {
  const t = tipoDeArtefacto(o.tipo);
  if (!t || !admiteCopias(o.tipo)) throw new ErrorDelArtefacto(400, `«${o.tipo}» no admite varias copias en un proyecto.`);
  const proyecto = await prisma.project.findUnique({ where: { id: o.projectId }, select: { id: true } });
  if (!proyecto) throw new ErrorDelArtefacto(404, "El proyecto no existe.");

  const existentes = await documentosDelTipo(o.projectId, o.tipo);
  // El nombre que escribió la persona va a `titulo`; `name` es su versión guardable (nunca el de una pieza).
  const titulo = tituloLimpio(o.nombre ?? "") || nombreParaUnaCopiaNueva(o.tipo, existentes.map((e) => nombreDelArtefacto(e)));
  const nombre = nombreGuardableDeUnaCopia(titulo);
  const order = existentes.reduce((m, e) => Math.max(m, e.order), -1) + 1;

  if (o.desdeCanvasId) return duplicar({ ...o, nombre, titulo, order });

  const plantilla = plantillaDelTipo(o.tipo, o.plantillaId ?? null);
  if (!plantilla) throw new ErrorDelArtefacto(400, `${t.nombre} no tiene la plantilla «${o.plantillaId}».`);
  const def = canvasDefDeUnaCopia(o.tipo, plantilla.id);
  const ahora = new Date().toISOString();
  const canvasId = await prisma.$transaction(async (tx) => {
    const c = await tx.projectCanvas.create({
      data: {
        projectId: o.projectId,
        slug: null,
        tipoArtefacto: o.tipo,
        name: nombre,
        titulo,
        isDefault: false,
        order,
        sections: conPlantillaAnotada(
          def.sections.map((s) => ({ key: s.key, label: s.label })),
          plantilla,
          o.porEmail,
          ahora,
        ) as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await tx.canvasSection.createMany({ data: def.sections.map((s, i) => ({ canvasId: c.id, key: s.key, label: s.label, order: i })) });
    const curadas = def.sections.filter((s) => s.defaultData);
    if (curadas.length) {
      const filas = await tx.canvasSection.findMany({ where: { canvasId: c.id, key: { in: curadas.map((s) => s.key) } }, select: { id: true, key: true } });
      const dataPorKey = new Map(curadas.map((s) => [s.key, s.defaultData]));
      await tx.canvasBlock.createMany({
        data: filas.map((s) => ({
          sectionId: s.id,
          blockType: "CARD" as const,
          content: null,
          data: (dataPorKey.get(s.key) ?? {}) as Prisma.InputJsonValue,
          order: 0,
          source: "HUMAN" as const,
          status: "CONFIRMED" as const,
        })),
      });
    }
    return c.id;
  });
  return { canvasId, nombre: titulo };
}

/** Duplicar: lo escrito pasa tal cual, menos las secciones que una copia no lleva. Las fotos y el enlace no pasan. */
async function duplicar(o: {
  projectId: string;
  tipo: string;
  desdeCanvasId?: string | null;
  nombre: string;
  titulo: string;
  order: number;
  porEmail: string | null;
}): Promise<CopiaCreada> {
  const fuente = await prisma.projectCanvas.findFirst({
    where: { id: o.desdeCanvasId!, projectId: o.projectId },
    select: {
      slug: true,
      tipoArtefacto: true,
      name: true,
      businessCaseId: true,
      sections: true,
      project: { select: { hiddenKickoffKeys: true } },
      canvasSections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          key: true,
          label: true,
          titleOverride: true,
          eyebrowOverride: true,
          order: true,
          blocks: { orderBy: { order: "asc" }, select: { blockType: true, content: true, data: true, order: true, source: true, status: true } },
        },
      },
    },
  });
  if (!fuente) throw new ErrorDelArtefacto(404, "El documento que quieres duplicar no es de este proyecto.");
  // La entrega guarda en su Json lo que el cliente no ve, y una copia se puede compartir.
  if (fuente.slug && tipoDeArtefacto(o.tipo)?.sinEnlaceElDeSiempre) throw new ErrorDelArtefacto(400, "Este documento no se duplica: crea uno en blanco.");
  if (tipoDelDocumento(fuente) !== o.tipo) throw new ErrorDelArtefacto(400, "Solo se duplica un documento del mismo tipo.");

  // Todo lo del tipo, de cualquier plantilla (duplicar no recorta), y las que creó una persona.
  const g = plantillaGuardadaDelTipo(o.tipo, fuente.sections);
  const permitidas = seccionesQuePasanAlDuplicar(o.tipo);
  const secciones = fuente.canvasSections.filter((s) => permitidas.has(s.key) || esCustomKey(s.key));
  const keys = new Set(secciones.map((s) => s.key));
  const entradas = (Array.isArray(fuente.sections) ? (fuente.sections as unknown[]) : []).filter((e): e is Record<string, unknown> => {
    if (!e || typeof e !== "object") return false;
    const k = (e as { key?: unknown }).key;
    // Las entries reservadas (`__doc`, `__plantilla`…) pasan: son las instrucciones y la plantilla del documento.
    return typeof k === "string" && k !== CLAVE_OCULTAS_DEL_EDITOR && (k.startsWith("__") || keys.has(k));
  });
  /* Lo oculto del kickoff de siempre vive por ID de sección (en el proyecto y en su borrador), y la copia tiene ids nuevos:
     se traduce a `hidden` en el Json, como lo oculta cualquier otro documento. Sin esto reaparecería por el enlace de la copia. */
  const ocultasDelKickoff =
    o.tipo === "kickoff" && fuente.slug
      ? new Set(ocultasEnElEditor(fuente.project?.hiddenKickoffKeys ?? [], ocultasDelBorrador(fuente.sections)))
      : new Set<string>();
  const anotadas = [...entradas];
  for (const s of secciones.filter((x) => ocultasDelKickoff.has(kickoffHiddenKey(x.key, x.id)))) {
    const i = anotadas.findIndex((e) => e.key === s.key);
    if (i >= 0) anotadas[i] = { ...anotadas[i], hidden: true };
    else anotadas.push({ key: s.key, label: s.label, hidden: true });
  }
  const sectionsJson = g.guardada || !g.plantilla ? anotadas : conPlantillaAnotada(anotadas, g.plantilla, o.porEmail, new Date().toISOString());

  const canvasId = await prisma.$transaction(async (tx) => {
    const c = await tx.projectCanvas.create({
      data: {
        projectId: o.projectId,
        slug: null,
        tipoArtefacto: o.tipo,
        name: o.nombre,
        titulo: o.titulo,
        isDefault: false,
        order: o.order,
        sections: sectionsJson as unknown as Prisma.InputJsonValue,
        contentUpdatedAt: new Date(),
      },
      select: { id: true },
    });
    for (const [i, s] of secciones.entries()) {
      const nueva = await tx.canvasSection.create({
        data: { canvasId: c.id, key: s.key, label: s.label, titleOverride: s.titleOverride, eyebrowOverride: s.eyebrowOverride, order: i },
        select: { id: true },
      });
      if (s.blocks.length) {
        await tx.canvasBlock.createMany({
          data: s.blocks.map((b) => ({
            sectionId: nueva.id,
            blockType: b.blockType,
            content: b.content,
            data: (b.data ?? undefined) as Prisma.InputJsonValue | undefined,
            order: b.order,
            source: b.source,
            status: b.status,
          })),
        });
      }
    }
    // Las notas, transcripciones y archivos de una copia son suyas: pasan con ella. Las del documento de siempre son de su tipo.
    if (!fuente.slug) {
      const notas = await tx.notaDeContexto.findMany({
        where: { projectId: o.projectId, pieza: piezaDeLasNotas(o.desdeCanvasId!), deletedAt: null },
        select: { title: true, content: true, createdByEmail: true },
      });
      if (notas.length) await tx.notaDeContexto.createMany({ data: notas.map((n) => ({ ...n, projectId: o.projectId, pieza: piezaDeLasNotas(c.id) })) });
    }
    return c.id;
  }, { timeout: 20_000 });
  return { canvasId, nombre: o.titulo };
}

/**
 * Cambia el nombre (`titulo`). En una copia, `name` lo acompaña en su versión guardable (nunca el de una pieza). En el
 * documento de siempre `name` no se toca: es el de su fila de siempre.
 */
export async function renombrarArtefacto(projectId: string, canvasId: string, nombre: string): Promise<{ nombre: string }> {
  const c = await documentoDelProyecto(projectId, canvasId);
  // Solo los tipos con barra: el handoff tiene su propia regla de quién lo edita y el cronograma no vive acá.
  if (!admiteCopias(c.tipo)) throw new ErrorDelArtefacto(400, "Ese documento no se renombra desde acá.");
  const titulo = tituloLimpio(nombre);
  if (!titulo) throw new ErrorDelArtefacto(400, "Escribe un nombre.");
  await prisma.projectCanvas.update({
    where: { id: canvasId },
    data: esCopia(c) ? { titulo, name: nombreGuardableDeUnaCopia(titulo) } : { titulo },
  });
  return { nombre: titulo };
}

/** Lo marca terminado (o lo devuelve a en construcción). Vale para cualquier documento del tipo. */
export async function marcarTerminado(projectId: string, canvasId: string, terminado: boolean, porEmail: string | null): Promise<{ terminadoEn: string | null }> {
  const c = await documentoDelProyecto(projectId, canvasId);
  if (!admiteCopias(c.tipo)) throw new ErrorDelArtefacto(400, "Ese documento no tiene estado.");
  const terminadoEn = terminado ? new Date() : null;
  await prisma.projectCanvas.update({ where: { id: canvasId }, data: { terminadoEn, terminadoPor: terminado ? porEmail : null } });
  return { terminadoEn: terminadoEn?.toISOString() ?? null };
}

/**
 * Archiva una COPIA: sale del riel y de lo que leen los agentes, sin borrar nada (`disabledAt`), y su enlace deja de abrir.
 * El documento de siempre no se archiva desde acá.
 */
export async function archivarCopia(projectId: string, canvasId: string, porEmail: string | null): Promise<void> {
  const c = await documentoDelProyecto(projectId, canvasId);
  if (!esCopia(c)) throw new ErrorDelArtefacto(409, "El documento de siempre de un tipo no se archiva desde acá.");
  const ahora = new Date();
  await prisma.$transaction([
    prisma.projectCanvas.update({ where: { id: canvasId }, data: { disabledAt: ahora, disabledBy: porEmail, disabledReason: "archivada" } }),
    prisma.accesoAlDocumento.updateMany({ where: { canvasId, revokedAt: null }, data: { revokedAt: ahora } }),
  ]);
}

/** Deshace archivar: la copia vuelve al riel y a lo que leen los agentes. Su enlace no vuelve: hay que crear uno nuevo. */
export async function reactivarCopia(projectId: string, canvasId: string): Promise<void> {
  const c = await documentoDelProyecto(projectId, canvasId);
  if (!esCopia(c)) throw new ErrorDelArtefacto(409, "Ese documento no se archiva desde acá.");
  await prisma.projectCanvas.update({ where: { id: canvasId }, data: { disabledAt: null, disabledBy: null, disabledReason: null } });
}

/**
 * El ORDEN de los documentos de un tipo (arrastrar). Tienen que venir TODOS los vivos del tipo, cada uno una vez: un orden
 * a medias dejaría dos con el mismo lugar.
 */
export async function ordenarDelTipo(projectId: string, tipo: string, ids: readonly string[]): Promise<void> {
  const vivos = await documentosDelTipo(projectId, tipo);
  const esperados = new Set(vivos.map((v) => v.id));
  if (ids.length !== esperados.size || new Set(ids).size !== ids.length || ids.some((id) => !esperados.has(id))) {
    throw new ErrorDelArtefacto(409, "La lista cambió mientras la ordenabas. Recarga y vuelve a intentarlo.");
  }
  /* Los documentos del tipo se reparten LOS MISMOS lugares que ya ocupaban: `order` es también el orden del listado de
     documentos del proyecto, y arrastrar adentro de un tipo no puede mover a otro tipo de lugar. */
  const lugares = vivos.map((v) => v.order).sort((a, b) => a - b);
  const repetidos = new Set(lugares).size !== lugares.length;
  const slots = repetidos ? lugares.map((_, i) => (lugares[0] ?? 0) + i) : lugares;
  await prisma.$transaction(ids.map((id, i) => prisma.projectCanvas.update({ where: { id }, data: { order: slots[i] } })));
}
