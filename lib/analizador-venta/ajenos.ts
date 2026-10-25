/**
 * lib/analizador-venta/ajenos.ts — suelta los análisis de venta que quedaron de una empresa que ya no es la dueña de su
 * reunión (S3, 2026-10-25; invariante 1). SERVIDOR (sin `server-only`: lo llama la re-atribución de reuniones, que
 * también corre en scripts de consola).
 *
 * Un análisis habla de UNA empresa. Si la reunión pasa a otra (alguien eligió otra empresa, se fusionaron dos fichas, la
 * re-atribución la movió), el análisis viejo ya no vale para la nueva y no se puede «volver a analizar» si la reunión
 * dejó de ser de venta. Por eso se borra: lo llaman `reResolveSession` y `resolveAllSessions` cuando una reunión cambia
 * de dueña, y scripts/limpiar-analisis-de-venta-ajenos.ts para lo que haya quedado. INV57 vigila que no quede ninguno.
 */
import { prisma } from "@/lib/db/prisma";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";

/** Los análisis (de esas reuniones, o de todas) cuya empresa ya no es la dueña de la reunión. */
export async function analisisDeVentaAjenos(sessionIds?: readonly string[]): Promise<{ sessionId: string; titulo: string }[]> {
  if (sessionIds && !sessionIds.length) return [];
  const filas = await prisma.analisisDeVenta.findMany({
    where: sessionIds ? { sessionId: { in: [...sessionIds] } } : {},
    select: { sessionId: true, clientId: true, session: { select: { title: true, resolvedClientId: true, manualClientId: true } } },
  });
  return filas.filter((f) => duenoDeLaSesion(f.session) !== f.clientId).map((f) => ({ sessionId: f.sessionId, titulo: f.session.title }));
}

/** Borra los análisis ajenos de esas reuniones. Devuelve cuántos. Sin la tabla, 0. Nunca lanza. */
export async function soltarAnalisisDeVentaAjenos(sessionIds: readonly string[]): Promise<number> {
  try {
    const ajenos = await analisisDeVentaAjenos(sessionIds);
    if (!ajenos.length) return 0;
    const { count } = await prisma.analisisDeVenta.deleteMany({ where: { sessionId: { in: ajenos.map((a) => a.sessionId) } } });
    return count;
  } catch {
    return 0;
  }
}
