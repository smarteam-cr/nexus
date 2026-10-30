/**
 * lib/artefactos/enlaces.ts — la ruta del enlace propio de un artefacto (etapa V4 de docs/artefactos-plan.md). PURO.
 */

/** La ruta del enlace propio de un artefacto (GET estado · POST compartir · DELETE dejar de compartir). */
export function rutaDelEnlace(o: { projectId: string; canvasId: string }): string {
  return `/api/projects/${encodeURIComponent(o.projectId)}/artefactos/${encodeURIComponent(o.canvasId)}/enlace`;
}
