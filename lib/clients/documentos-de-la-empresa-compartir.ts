/**
 * lib/clients/documentos-de-la-empresa-compartir.ts — crear, compartir y dejar de compartir un documento de la EMPRESA
 * (R3 etapas 2 y 3 del roadmap, 2026-10-27, docs/arquitectura-empresa-plan.md). SERVIDOR.
 *
 * Etapa 2 · Un diagnóstico de la empresa sin proyecto: para un prospecto, por ejemplo. Nace con las secciones de su
 * plantilla (la esencial por defecto) y se escribe a mano: la generación con IA lee el handoff y las reuniones de un
 * proyecto, y un prospecto no los tiene (queda como pendiente, ver DECISIONS). El documento de resultados de la preventa
 * (C5) espera el formato que define Ventas.
 *
 * Etapa 3 · La vista de la empresa: un ENLACE propio (`AccesoAlDocumento`, la URL es el secreto, como la propuesta) que
 * sirve la FOTO publicada (`publishedSnapshot`) del documento, con lo oculto filtrado contra el documento vivo. Publicar
 * de nuevo actualiza la foto y conserva el enlace; dejar de compartir lo revoca; volver a compartir crea uno nuevo.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DIAGNOSTICO_CANVAS, diagnosticoSectionSequence, type CanvasDefinition } from "@/lib/canvas/canvas-defs";
import { reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { conPlantillaAnotada, plantillaDe, seccionesDeLaPlantilla } from "@/lib/entregables/registro";
import { DIAGNOSTICO_DEF_BY_KEY } from "@/components/landing/configs/diagnostico.defs";
import { documentoDeLaEmpresa } from "./documentos-de-la-empresa-server";

/** Las piezas que hoy se pueden armar como documento de la empresa. Una sola: el diagnóstico. */
export const PIEZAS_DE_LA_EMPRESA = {
  diagnosis: { nombre: "Diagnóstico", canvas: DIAGNOSTICO_CANVAS, secuencia: diagnosticoSectionSequence, defs: DIAGNOSTICO_DEF_BY_KEY },
} as const;
export type PiezaDeLaEmpresa = keyof typeof PIEZAS_DE_LA_EMPRESA;
export const esPiezaDeLaEmpresa = (s: unknown): s is PiezaDeLaEmpresa => typeof s === "string" && s in PIEZAS_DE_LA_EMPRESA;

export class ErrorDelDocumento extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * El documento de esa pieza de la empresa, con las secciones de la plantilla y la plantilla anotada. Si ya existe, lo
 * devuelve como está (una pieza por empresa: el índice único parcial lo sostiene).
 */
export async function crearDocumentoDeLaEmpresa(
  clientId: string,
  pieza: PiezaDeLaEmpresa,
  plantillaId: string | null,
  porEmail: string | null,
): Promise<{ canvasId: string; creado: boolean }> {
  const p = PIEZAS_DE_LA_EMPRESA[pieza];
  // La esencial por defecto: es la recomendada para un diagnóstico, y la que se lee en cinco minutos.
  const plantilla = plantillaDe(pieza, plantillaId ?? "diagnostico-esencial");
  if (!plantilla) throw new ErrorDelDocumento(400, `${p.nombre} no tiene la plantilla «${plantillaId}».`);
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!cliente) throw new ErrorDelDocumento(404, "La empresa no existe.");

  const { id, creado } = await documentoDeLaEmpresa(clientId, pieza, p.nombre);
  if (creado) {
    const def: CanvasDefinition = { ...p.canvas, sections: seccionesDeLaPlantilla(plantilla, p.canvas.sections) };
    await reconcileOnDemandCanvasSections(id, def, p.secuencia);
    const c = await prisma.projectCanvas.findUnique({ where: { id }, select: { sections: true } });
    const conLabels = def.sections.map((s) => ({ key: s.key, label: s.label }));
    const base = Array.isArray(c?.sections) && (c!.sections as unknown[]).length ? c!.sections : conLabels;
    await prisma.projectCanvas.update({
      where: { id },
      data: { sections: conPlantillaAnotada(base, plantilla, porEmail, new Date().toISOString()) as unknown as Prisma.InputJsonValue },
    });
  }
  return { canvasId: id, creado };
}

/** El enlace público de un token (la página la sirve app/external/documento/[token]). */
export function enlaceDelDocumento(token: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/external/documento/${token}`;
}

export interface EstadoDeLoCompartido {
  publicadoEn: string | null;
  enlace: string | null;
  /** Hay cambios en el documento después de la última foto. */
  cambiosSinPublicar: boolean;
}

export async function estadoDeLoCompartido(canvasId: string): Promise<EstadoDeLoCompartido> {
  const c = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { publishedSnapshotAt: true, contentUpdatedAt: true, accesoDeLaEmpresa: { select: { accessToken: true, revokedAt: true } } },
  });
  const acceso = c?.accesoDeLaEmpresa && !c.accesoDeLaEmpresa.revokedAt ? c.accesoDeLaEmpresa : null;
  return {
    publicadoEn: acceso ? (c?.publishedSnapshotAt?.toISOString() ?? null) : null,
    enlace: acceso ? enlaceDelDocumento(acceso.accessToken) : null,
    cambiosSinPublicar: !!(acceso && c?.contentUpdatedAt && c.publishedSnapshotAt && c.contentUpdatedAt > c.publishedSnapshotAt),
  };
}

/**
 * Comparte el documento con la empresa: congela la foto (las secciones con sus bloques confirmados y el encabezado ya
 * resuelto, como `publicarPlanificacion`) y asegura el enlace. Sin nada escrito no se comparte.
 */
export async function compartirDocumentoDeLaEmpresa(clientId: string, canvasId: string, porEmail: string | null): Promise<EstadoDeLoCompartido> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, clientId, projectId: null, businessCaseId: null },
    select: {
      slug: true,
      canvasSections: {
        orderBy: { order: "asc" },
        select: {
          key: true,
          titleOverride: true,
          eyebrowOverride: true,
          blocks: { where: { status: "CONFIRMED" }, orderBy: { order: "asc" }, select: { blockType: true, content: true, data: true } },
        },
      },
    },
  });
  if (!canvas || !esPiezaDeLaEmpresa(canvas.slug)) throw new ErrorDelDocumento(404, "Documento no encontrado.");
  if (!canvas.canvasSections.some((s) => s.blocks.length)) throw new ErrorDelDocumento(409, "Todavía no hay nada escrito para compartir.");
  const defs = PIEZAS_DE_LA_EMPRESA[canvas.slug].defs as Record<string, { label: string; eyebrow?: string } | undefined>;
  const sections = canvas.canvasSections.map((s) => ({
    key: s.key,
    titleOverride: (s.titleOverride ?? "").trim() || defs[s.key]?.label || null,
    eyebrowOverride: s.eyebrowOverride ?? defs[s.key]?.eyebrow ?? null,
    blocks: s.blocks,
  }));
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.projectCanvas.update({
      where: { id: canvasId },
      data: { publishedSnapshot: { sections } as unknown as Prisma.InputJsonValue, publishedSnapshotAt: ahora },
    });
    const acceso = await tx.accesoAlDocumento.findUnique({ where: { canvasId }, select: { id: true, revokedAt: true } });
    if (!acceso) {
      await tx.accesoAlDocumento.create({ data: { canvasId, clientId, accessToken: randomBytes(32).toString("hex"), creadoPor: porEmail } });
    } else if (acceso.revokedAt) {
      // Volver a compartir después de revocar: enlace NUEVO (el viejo pudo circular a quien ya no debía verlo).
      await tx.accesoAlDocumento.update({
        where: { id: acceso.id },
        data: { accessToken: randomBytes(32).toString("hex"), revokedAt: null, enabledAt: ahora, creadoPor: porEmail },
      });
    }
  });
  return estadoDeLoCompartido(canvasId);
}

/** Deja de compartir: el enlace deja de abrir. La foto queda (volver a compartir la rehace). */
export async function dejarDeCompartirDocumentoDeLaEmpresa(canvasId: string): Promise<void> {
  await prisma.accesoAlDocumento.updateMany({ where: { canvasId, revokedAt: null }, data: { revokedAt: new Date() } });
}
