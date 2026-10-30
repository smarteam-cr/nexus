/**
 * lib/artefactos/enlaces.ts — DÓNDE SE ABRE CADA COSA DE UN ARTEFACTO (etapa V4 de docs/artefactos-plan.md). PURO.
 *
 * El PDF de una copia sale por el camino genérico de impresión (app/print/doc/[type]/[id]) con `canvasId`: el tipo de
 * impresión es el id del tipo del artefacto (lib/print/doc-types.ts) y el id es el del PROYECTO, como el del documento de
 * siempre; `canvasId` elige la copia (el cargador verifica que sea de ese proyecto y de ese tipo). Sin `canvasId`, el
 * camino de siempre: el PDF del documento de siempre no cambia.
 */
import { printDocType } from "@/lib/print/doc-types";

/** La hoja que se imprime (para mirarla antes de exportar). null si el tipo no imprime por el camino genérico. */
export function urlDelPdfDelArtefacto(o: { projectId: string; canvasId: string; tipo: string }): string | null {
  const t = printDocType(o.tipo);
  if (!t || t.scope !== "project-piece") return null;
  return `/print/doc/${t.id}/${encodeURIComponent(o.projectId)}?canvasId=${encodeURIComponent(o.canvasId)}`;
}

/**
 * Exportar el PDF: `POST` a esta ruta con el cuerpo `{ canvasId }` (el mismo endpoint de todos los documentos; el
 * `canvasId` viaja en el token de un solo uso hasta la hoja que captura el navegador).
 */
export function rutaParaExportarElPdf(o: { projectId: string; tipo: string }): string | null {
  const t = printDocType(o.tipo);
  if (!t || t.scope !== "project-piece") return null;
  return `/api/print/${t.id}/${encodeURIComponent(o.projectId)}/export`;
}

/** La ruta del enlace propio de un artefacto (GET estado · POST compartir · DELETE dejar de compartir). */
export function rutaDelEnlace(o: { projectId: string; canvasId: string }): string {
  return `/api/projects/${encodeURIComponent(o.projectId)}/artefactos/${encodeURIComponent(o.canvasId)}/enlace`;
}
