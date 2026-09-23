/**
 * lib/sessions/session-project-locks.ts
 *
 * Fuente ÚNICA del criterio de LOCK POR LINK de `SessionProject` (plan "contexto
 * por proyecto"): cualquier señal de que un humano tocó el link lo protege del
 * clasificador IA — no lo modifica, no lo borra, no lo re-propone.
 *
 * Señales (cualquiera lockea):
 *   - source === "manual"        → el link lo creó/ratificó un humano
 *   - reviewedAt !== null        → un humano confirmó/curó este link
 *   - included === false         → tombstone: un humano EXCLUYÓ este proyecto
 *   - handoffOverride !== null   → la "X"/"Agregar" del panel de handoff lo tocó
 *   - timelineOverride === true  → el «Agregar» del Contexto del CRONOGRAMA (2026-09-23)
 *
 * ⚠ La X del cronograma (`timelineOverride === false`) NO lockea, a propósito. La primera versión
 * la contaba como señal humana y eso congelaba la reunión ENTERA: `reclassify` saltea toda sesión
 * con algún vínculo lockeado, así que una reunión semanal que el CSE sacó del cronograma de A nunca
 * llegaba al proyecto B cuando B nacía, y el vínculo con A quedaba fijo como primario. La X dice
 * «no la uses para ESTE cronograma», no «esta reunión es de A»: la pertenencia la sigue decidiendo
 * la clasificación. Si la IA después decide que la reunión no es de A y borra el vínculo, la X
 * sigue cumpliéndose — una reunión que no es del proyecto no alimenta su cronograma. «Agregar»
 * sí es una decisión humana de SUMAR, y por eso sí lockea (igual que el `source=manual` que nace
 * con él cuando el vínculo es nuevo).
 *
 * La IA SÍ puede AGREGAR links nuevos a proyectos sin link bloqueado (una reunión
 * revisada puede ganar membresía en un proyecto que nació después).
 *
 * Módulo PURO (sin prisma) a propósito: lo comparten el clasificador y reclassify,
 * y se unit-testea sin DB (vitest project "unit").
 */
export interface SessionProjectLockFields {
  source: string;
  reviewedAt: Date | null;
  included: boolean;
  handoffOverride: boolean | null;
  timelineOverride: boolean | null;
}

/** ¿Un humano tocó este link? Entonces el clasificador no lo modifica ni lo borra. */
export function isLockedLink(l: SessionProjectLockFields): boolean {
  return (
    l.source === "manual" ||
    l.reviewedAt !== null ||
    !l.included ||
    l.handoffOverride !== null ||
    l.timelineOverride === true
  );
}

/**
 * El vínculo VIRGEN como `where`: el que el clasificador puede borrar cuando deja de proponerlo.
 *
 * Es el negativo exacto de `isLockedLink` (menos `source`, que el llamador acota aparte a
 * «agent»/«legacy»), y vive ACÁ para que las dos no puedan separarse. Antes el `deleteMany` del
 * clasificador escribía estos literales a mano: el día que se suma una señal al candado, un where
 * escrito a mano sigue borrando vínculos que un humano tocó — sin error, porque un campo que FALTA
 * en un `where` no es un error de tipos.
 *
 * ⛔ `timelineOverride` va con OR explícito de null y false, NUNCA como `NOT: { timelineOverride:
 * true }`: en SQL `NOT (NULL = true)` es NULL y la fila no entra — o sea que ningún vínculo con NULL
 * (hoy, todos) se borraría nunca más.
 */
export const WHERE_VINCULO_VIRGEN = {
  reviewedAt: null,
  included: true,
  handoffOverride: null,
  OR: [{ timelineOverride: null }, { timelineOverride: false }],
};
