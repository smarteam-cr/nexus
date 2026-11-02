/**
 * lib/planificacion/brief-importado-server.ts — traer la hoja del Brief de implementación a la Planificación
 * (2026-10-29, pregunta 32 del roadmap). SERVIDOR. La regla y la forma viven en ./brief-importado.ts (puro, con test).
 *
 *  · `leerBriefDeGoogle`: la hoja ENTERA (todas sus pestañas) por Drive, impersonando a quien la pide: solo se lee lo que
 *    esa persona ya puede abrir (lib/google/drive-files.ts). No escribe nada.
 *  · `guardarBriefEnLaPlanificacion`: deja lo leído en la sección SOLO INTERNA `brief_importado` de la Planificación del
 *    proyecto, con la foto del documento antes si la sección ya tenía algo. Si el proyecto no tiene Planificación, la
 *    crea (es activarla, como el «+» del riel). No toca ninguna otra sección.
 *
 * Lo usan la ruta POST …/planificacion/brief (una por una, desde el editor) y scripts/traer-briefs-de-implementacion.ts
 * (el lote, en simulacro primero).
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { exportarHojaDeCalculo, parseGoogleDriveUrl, DriveFileError } from "@/lib/google/drive-files";
import { PLANIFICACION_CANVAS, planificacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { pestanasDelXlsx } from "./brief-xlsx";
import {
  BRIEF_IMPORTADO_KEY,
  briefDesdeLibro,
  briefImportadoVacio,
  type BriefImportado,
} from "./brief-importado";

export class ErrorDelBrief extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Lee la hoja del enlace como la ve `email`. Lanza `ErrorDelBrief` con un mensaje para la pantalla. */
export async function leerBriefDeGoogle(
  email: string,
  url: string,
  meta: { importadoPor: string; ahora?: Date },
): Promise<BriefImportado> {
  const id = parseGoogleDriveUrl(url.trim());
  if (!id || (id.kind !== "spreadsheet" && id.kind !== "drive-file")) {
    throw new ErrorDelBrief(400, "Ese enlace no es una hoja de Google Sheets.");
  }
  let hoja: { title: string; xlsx: Buffer };
  try {
    hoja = await exportarHojaDeCalculo(email, id.fileId);
  } catch (e) {
    if (e instanceof DriveFileError) {
      const porCodigo: Record<string, string> = {
        NOT_FOUND: "La hoja no existe en Drive (o el enlace está incompleto).",
        NO_ACCESS: "Tu cuenta no puede abrir esa hoja: pide acceso y vuelve a intentarlo.",
        TOO_LARGE: "La hoja es demasiado grande para traerla.",
        UNSUPPORTED: e.message,
      };
      throw new ErrorDelBrief(e.code === "NO_ACCESS" ? 403 : 400, porCodigo[e.code] ?? e.message);
    }
    throw e;
  }
  const pestanas = await pestanasDelXlsx(hoja.xlsx);
  const brief = briefDesdeLibro(
    { titulo: hoja.title, url: url.trim(), pestanas },
    { importadoEn: (meta.ahora ?? new Date()).toISOString(), importadoPor: meta.importadoPor },
  );
  if (briefImportadoVacio(brief)) throw new ErrorDelBrief(400, "La hoja está vacía: no hay nada que traer.");
  return brief;
}

/** Lo que hay hoy en la Planificación del proyecto para el Brief: si existe el documento y si ya trae un Brief. */
export async function estadoDelBriefEnLaPlanificacion(projectId: string): Promise<{ hayPlanificacion: boolean; yaTieneBrief: boolean; titulo: string | null }> {
  const canvas = await prisma.projectCanvas.findFirst({ where: canvasOfNested(PLANIFICACION_CANVAS.slug, { projectId }), select: { id: true } });
  if (!canvas) return { hayPlanificacion: false, yaTieneBrief: false, titulo: null };
  const bloque = await prisma.canvasBlock.findFirst({
    where: { blockType: "CARD", section: { canvasId: canvas.id, key: BRIEF_IMPORTADO_KEY } },
    orderBy: { order: "asc" },
    select: { data: true },
  });
  const vacio = briefImportadoVacio(bloque?.data);
  const titulo = !vacio && bloque?.data && typeof bloque.data === "object" ? String((bloque.data as { titulo?: unknown }).titulo ?? "") || null : null;
  return { hayPlanificacion: true, yaTieneBrief: !vacio, titulo };
}

/**
 * Guarda el Brief en la sección `brief_importado` de la Planificación del proyecto (la crea si falta, y la Planificación
 * también). Reemplaza lo que hubiera traído antes, con la foto del documento antes de tocarlo.
 */
export async function guardarBriefEnLaPlanificacion(
  projectId: string,
  brief: BriefImportado,
  opts: { actor?: string | null } = {},
): Promise<{ canvasId: string; creoLaPlanificacion: boolean }> {
  const existente = await prisma.projectCanvas.findFirst({ where: canvasOfNested(PLANIFICACION_CANVAS.slug, { projectId }), select: { id: true } });
  const canvasId = existente?.id ?? (await createOnDemandCanvas(projectId, PLANIFICACION_CANVAS));
  // Solo la sección del Brief: una planificación esencial no gana las secciones de la completa.
  await reconcileOnDemandCanvasSections(
    canvasId,
    { ...PLANIFICACION_CANVAS, sections: PLANIFICACION_CANVAS.sections.filter((s) => s.key === BRIEF_IMPORTADO_KEY) },
    planificacionSectionSequence,
  );
  const seccion = await prisma.canvasSection.findUnique({
    where: { canvasId_key: { canvasId, key: BRIEF_IMPORTADO_KEY } },
    select: { id: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  if (!seccion) throw new Error("La sección del Brief no se pudo crear.");
  if (existente && !briefImportadoVacio(seccion.blocks[0]?.data)) {
    await guardarVersionDelDocumento(canvasId, { origen: "Antes de volver a traer el Brief", creadaPor: opts.actor ?? null });
  }
  await prisma.$transaction([
    prisma.canvasBlock.deleteMany({ where: { sectionId: seccion.id } }),
    prisma.canvasBlock.create({
      data: {
        sectionId: seccion.id,
        blockType: "CARD",
        content: null,
        data: brief as unknown as Prisma.InputJsonValue,
        order: 0,
        source: "HUMAN",
        status: "CONFIRMED",
      },
    }),
  ]);
  return { canvasId, creoLaPlanificacion: !existente };
}
