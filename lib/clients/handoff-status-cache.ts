/**
 * lib/clients/handoff-status-cache.ts
 *
 * Cache en memoria (a nivel módulo) del status del handoff por proyecto — mismo
 * patrón que gps-cache.ts. Cambiar de tab remonta ProjectHandoffSection, que volvía
 * al skeleton mientras re-fetcheaba /api/projects/[id]/handoff; con el cache, la
 * sección pinta su estado real AL INSTANTE con la altura correcta (el skeleton solo
 * aparece en la primera visita al proyecto). Se invalida al generar/regenerar.
 * Vive por sesión del browser (se pierde al recargar, que es lo correcto).
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function readHandoffStatusCache<T>(projectId: string): T | null {
  const e = cache.get(projectId);
  return e ? (e.data as T) : null;
}

export function writeHandoffStatusCache(projectId: string, data: unknown): void {
  cache.set(projectId, { data, fetchedAt: Date.now() });
}

/** Limpia el cache de un proyecto (o todo si no se pasa id). */
export function invalidateHandoffStatus(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
