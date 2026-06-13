/**
 * lib/clients/gps-cache.ts
 *
 * Cache en memoria (a nivel módulo) del GPS por proyecto. Cambiar de tab
 * desmonta/remonta ProjectCanvasPanel → ProjectGPS, lo que disparaba una recarga
 * visible del widget. Con este cache, al remontar ProjectGPS lee el dato y
 * renderiza AL INSTANTE (sin skeleton); solo revalida si está stale (>5 min) o
 * cuando se detecta una sesión nueva (invalidateGps + señal de WorkspaceContext).
 * Vive por sesión del browser (se pierde al recargar la página, que es lo correcto).
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const STALE_MS = 5 * 60 * 1000; // 5 min

const cache = new Map<string, CacheEntry>();

export function readGpsCache<T>(projectId: string): { data: T; fetchedAt: number } | null {
  const e = cache.get(projectId);
  return e ? { data: e.data as T, fetchedAt: e.fetchedAt } : null;
}

export function isGpsStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > STALE_MS;
}

export function writeGpsCache(projectId: string, data: unknown): void {
  cache.set(projectId, { data, fetchedAt: Date.now() });
}

/** Limpia el cache de un proyecto (o todo si no se pasa id). */
export function invalidateGps(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
