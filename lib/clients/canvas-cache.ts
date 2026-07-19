/**
 * lib/clients/canvas-cache.ts
 *
 * Cache en memoria (a nivel módulo) de la lista de canvases por proyecto — mismo
 * patrón que gps-cache.ts. Cambiar de tab desmonta/remonta ProjectCanvasPanel, que
 * re-fetcheaba /api/projects/[id]/canvases y volvía a pintar el WorkspaceSkeleton
 * entero. Con este cache, volver a un tab ya visitado renderiza AL INSTANTE.
 * El primer paint del proyecto inicial lo cubre `initialCanvases` (sembrado
 * server-side por page.tsx); este cache cubre las revisitas.
 * Vive por sesión del browser (se pierde al recargar, que es lo correcto).
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const STALE_MS = 5 * 60 * 1000; // 5 min

const cache = new Map<string, CacheEntry>();

export function readCanvasCache<T>(projectId: string): { data: T; fetchedAt: number } | null {
  const e = cache.get(projectId);
  return e ? { data: e.data as T, fetchedAt: e.fetchedAt } : null;
}

export function writeCanvasCache(projectId: string, data: unknown): void {
  cache.set(projectId, { data, fetchedAt: Date.now() });
}

/** Limpia el cache de un proyecto (o todo si no se pasa id). */
export function invalidateCanvasCache(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
