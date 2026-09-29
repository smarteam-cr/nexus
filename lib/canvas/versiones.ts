/**
 * lib/canvas/versiones.ts — las VERSIONES de un documento (2026-09-28).
 *
 * ── LO QUE PASABA ────────────────────────────────────────────────────────────────────────────
 * Regenerar un documento con IA pisaba sus bloques EN EL LUGAR, sin dejar rastro. Con la estructura
 * nueva del diagnóstico eso dejó de ser teórico: regenerar un diagnóstico viejo se llevaba su Escala
 * —el punto de partida que lee la Entrega—, sus causas y sus recomendaciones. Nexus no tenía cómo
 * volver: los bloques guardan un solo nivel de «deshacer», y ese nivel también lo pisa la corrida.
 *
 * ── LO QUE HACE ──────────────────────────────────────────────────────────────────────────────
 * Antes de que algo reescriba un documento entero, se toma una FOTO: todas sus secciones con sus
 * bloques tal cual. Con la foto se puede:
 *   · consultar cómo estaba (la pantalla «Versiones anteriores»),
 *   · TRAER UNA SECCIÓN al documento actual (lo que pidió Elías: «enviar una sección de esos al
 *     actual») — aunque la sección ya no exista en la estructura nueva,
 *   · RESTAURAR la versión entera.
 * Traer y restaurar también toman una foto antes: ninguna de las dos operaciones pierde lo que había.
 *
 * ⚠ Guardar la foto NUNCA tumba una corrida: si falla (la tabla todavía no existe, la base tarda),
 * se registra y la corrida sigue. Perder una foto es malo; dejar al CSE sin su documento es peor.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";

export interface BloqueDeVersion {
  blockType: string;
  content: string | null;
  data: unknown;
  order: number;
  colSpan: number;
  colStart: number | null;
  rowSpan: number;
  source: string;
  status: string;
}

export interface SeccionDeVersion {
  key: string;
  label: string;
  order: number;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  blocks: BloqueDeVersion[];
}

/** Cuántas fotos se guardan por documento: las más viejas se van. */
export const VERSIONES_POR_DOCUMENTO = 30;

export async function fotoDelDocumento(canvasId: string): Promise<SeccionDeVersion[]> {
  const secciones = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    select: {
      key: true,
      label: true,
      order: true,
      titleOverride: true,
      eyebrowOverride: true,
      blocks: {
        orderBy: { order: "asc" },
        select: {
          blockType: true, content: true, data: true, order: true,
          colSpan: true, colStart: true, rowSpan: true, source: true, status: true,
        },
      },
    },
  });
  return secciones as SeccionDeVersion[];
}

/** La huella del CONTENIDO (no de cuándo se tomó): dos fotos iguales dan la misma. */
export function huellaDe(secciones: readonly SeccionDeVersion[]): string {
  return createHash("sha256").update(JSON.stringify(secciones)).digest("hex").slice(0, 32);
}

export function tieneContenido(secciones: readonly SeccionDeVersion[]): boolean {
  return secciones.some((s) => s.blocks.length > 0);
}

/**
 * Toma la foto del documento. No lanza nunca. No guarda nada si el documento está vacío (no hay nada
 * que perder) ni si es idéntico a la última foto (regenerar dos veces seguidas sin tocar nada no llena
 * la lista de copias iguales).
 */
export async function guardarVersionDelDocumento(
  canvasId: string,
  opts: { origen: string; creadaPor?: string | null },
): Promise<{ guardada: boolean; id?: string; motivo?: string }> {
  try {
    if (!modeloDisponible(prisma.versionDeDocumento)) return { guardada: false, motivo: "falta la tabla" };
    const [canvas, secciones] = await Promise.all([
      prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { slug: true } }),
      fotoDelDocumento(canvasId),
    ]);
    if (!canvas) return { guardada: false, motivo: "el documento no existe" };
    if (!tieneContenido(secciones)) return { guardada: false, motivo: "vacío" };
    const huella = huellaDe(secciones);
    const ultima = await prisma.versionDeDocumento.findFirst({
      where: { canvasId },
      orderBy: { createdAt: "desc" },
      select: { huella: true },
    });
    if (ultima?.huella === huella) return { guardada: false, motivo: "igual a la última" };

    const v = await prisma.versionDeDocumento.create({
      data: {
        canvasId,
        pieza: canvas.slug,
        origen: opts.origen,
        creadaPor: opts.creadaPor ?? null,
        huella,
        secciones: secciones as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    // Tope por documento: se borran las más viejas. Una foto es el documento entero.
    const sobrantes = await prisma.versionDeDocumento.findMany({
      where: { canvasId },
      orderBy: { createdAt: "desc" },
      skip: VERSIONES_POR_DOCUMENTO,
      select: { id: true },
    });
    if (sobrantes.length) await prisma.versionDeDocumento.deleteMany({ where: { id: { in: sobrantes.map((s) => s.id) } } });
    return { guardada: true, id: v.id };
  } catch (e) {
    console.error(`[versiones] no se pudo guardar la foto de ${canvasId} (${opts.origen}):`, e instanceof Error ? e.message : e);
    return { guardada: false, motivo: "error" };
  }
}

export function leerSecciones(bruto: unknown): SeccionDeVersion[] {
  return Array.isArray(bruto) ? (bruto as SeccionDeVersion[]) : [];
}

/** Reemplaza los bloques de una sección por los de la foto, en una transacción. */
async function reemplazarBloques(sectionId: string, bloques: readonly BloqueDeVersion[]) {
  await prisma.$transaction([
    prisma.canvasBlock.deleteMany({ where: { sectionId } }),
    ...bloques.map((b) =>
      prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: b.blockType as Prisma.CanvasBlockCreateInput["blockType"],
          content: b.content,
          data: (b.data ?? undefined) as Prisma.InputJsonValue | undefined,
          order: b.order,
          colSpan: b.colSpan,
          colStart: b.colStart,
          rowSpan: b.rowSpan,
          source: b.source as Prisma.CanvasBlockCreateInput["source"],
          status: b.status as Prisma.CanvasBlockCreateInput["status"],
        },
      }),
    ),
  ]);
}

/** La sección del documento con esa key; si ya no existe (salió de la estructura), se crea al final. */
async function seccionDestino(canvasId: string, s: SeccionDeVersion): Promise<string> {
  const existente = await prisma.canvasSection.findUnique({
    where: { canvasId_key: { canvasId, key: s.key } },
    select: { id: true },
  });
  if (existente) return existente.id;
  const ultima = await prisma.canvasSection.findFirst({ where: { canvasId }, orderBy: { order: "desc" }, select: { order: true } });
  const creada = await prisma.canvasSection.create({
    data: {
      canvasId,
      key: s.key,
      label: s.label,
      order: (ultima?.order ?? 0) + 1,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
    },
    select: { id: true },
  });
  return creada.id;
}

export type ResultadoDeVersion = { ok: true; sectionIds: string[] } | { ok: false; error: string; status: number };

/** Trae UNA sección de una foto al documento actual (foto previa incluida). */
export async function traerSeccionDeVersion(opts: {
  canvasId: string;
  versionId: string;
  key: string;
  actor: string | null;
}): Promise<ResultadoDeVersion> {
  const v = await prisma.versionDeDocumento.findFirst({ where: { id: opts.versionId, canvasId: opts.canvasId }, select: { secciones: true } });
  if (!v) return { ok: false, error: "Esa versión no es de este documento.", status: 404 };
  const s = leerSecciones(v.secciones).find((x) => x.key === opts.key);
  if (!s) return { ok: false, error: "Esa sección no está en la versión.", status: 404 };
  await guardarVersionDelDocumento(opts.canvasId, { origen: `Antes de traer «${s.label}» de una versión anterior`, creadaPor: opts.actor });
  const sectionId = await seccionDestino(opts.canvasId, s);
  await reemplazarBloques(sectionId, s.blocks);
  await tocarDocumento(opts.canvasId);
  return { ok: true, sectionIds: [sectionId] };
}

/**
 * Restaura la foto ENTERA (foto previa incluida): cada sección vuelve a sus bloques de entonces, las
 * que no existían quedan vacías y las que ya no existen se vuelven a crear. Las secciones no se
 * borran: vaciarlas alcanza y la estructura del documento no se toca.
 */
export async function restaurarVersion(opts: { canvasId: string; versionId: string; actor: string | null }): Promise<ResultadoDeVersion> {
  const v = await prisma.versionDeDocumento.findFirst({
    where: { id: opts.versionId, canvasId: opts.canvasId },
    select: { secciones: true, createdAt: true },
  });
  if (!v) return { ok: false, error: "Esa versión no es de este documento.", status: 404 };
  await guardarVersionDelDocumento(opts.canvasId, { origen: "Antes de restaurar una versión anterior", creadaPor: opts.actor });

  const deLaFoto = leerSecciones(v.secciones);
  const actuales = await prisma.canvasSection.findMany({ where: { canvasId: opts.canvasId }, select: { id: true, key: true } });
  const ids: string[] = [];
  for (const s of deLaFoto) {
    const id = await seccionDestino(opts.canvasId, s);
    await reemplazarBloques(id, s.blocks);
    ids.push(id);
  }
  const keysDeLaFoto = new Set(deLaFoto.map((s) => s.key));
  const sobrantes = actuales.filter((a) => !keysDeLaFoto.has(a.key)).map((a) => a.id);
  if (sobrantes.length) await prisma.canvasBlock.deleteMany({ where: { sectionId: { in: sobrantes } } });
  await tocarDocumento(opts.canvasId);
  return { ok: true, sectionIds: ids };
}

/** Marca «cambios sin subir» en los documentos publicables, igual que cualquier edición. */
async function tocarDocumento(canvasId: string) {
  await prisma.projectCanvas.update({ where: { id: canvasId }, data: { contentUpdatedAt: new Date() } }).catch(() => {});
}
