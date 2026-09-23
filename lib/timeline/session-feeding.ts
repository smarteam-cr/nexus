/**
 * lib/timeline/session-feeding.ts — QUÉ REUNIONES ALIMENTAN AL CRONOGRAMA. UNA SOLA REGLA.
 *
 * ── POR QUÉ NO ES LA DEL HANDOFF ─────────────────────────────────────────────
 * El handoff descarta A PROPÓSITO las reuniones de implementación, las semanales y las de revisión
 * (`lib/handoff/session-relevance.ts:6-10`): cuentan la entrega del servicio, no la venta. Para el
 * cronograma es exactamente al revés — esas son las reuniones que dicen qué fases hay y qué tareas
 * se hicieron. Clonar la regla del handoff habría dejado al cronograma sin su material.
 *
 * ── LA REGLA (decisión 2026-09-23) ───────────────────────────────────────────
 * Por defecto entra TODA reunión miembro del proyecto (`included=true`, del cliente). El CSE saca
 * con la X (`timelineOverride=false`) y suma con «Agregar» (`true`). Con NULL en todas las filas de
 * hoy, nada cambia para los ~100 proyectos existentes: el agente de avance sigue viendo la reunión
 * nueva que entra después de cada sesión, sin que nadie tenga que elegirla.
 *
 * La X del cronograma NO toca `included` ni `handoffOverride`: la reunión sigue siendo del proyecto
 * para el handoff, la Entrega y las minutas. Solo la IA del cronograma deja de leerla.
 *
 * ── LAS DOS FORMAS, PEGADAS ──────────────────────────────────────────────────
 * `linkFeedsTimeline` decide en memoria; `whereAlimentaCronograma` es la MISMA regla como `where` de
 * Prisma. Viven juntas —como `belongsToClient`/`whereBelongsToClient`— porque son una sola regla.
 *
 * ⛔ El gemelo NO se puede escribir `NOT: { timelineOverride: false }` ni `{ not: false }`: en SQL,
 * `NOT (NULL = false)` es NULL, y la fila se descarta. Hoy TODAS las filas tienen NULL, así que esa
 * forma dejaría al cronograma sin una sola reunión — sin error y sin aviso.
 */

/** Lo mínimo del vínculo sesión↔proyecto para decidir. */
export interface VinculoParaCronograma {
  included: boolean;
  timelineOverride: boolean | null;
}

/** ¿Este vínculo alimenta al cronograma? */
export function linkFeedsTimeline(l: VinculoParaCronograma): boolean {
  // El tombstone manda sobre todo: una reunión que un humano sacó DEL PROYECTO no alimenta nada.
  if (!l.included) return false;
  // La X del CSE, solo para el cronograma.
  if (l.timelineOverride === false) return false;
  // null (la regla) o true (agregada a mano).
  return true;
}

/** La misma regla, como `where` de `SessionProject`. */
export function whereAlimentaCronograma() {
  return {
    included: true,
    OR: [{ timelineOverride: null }, { timelineOverride: true }],
  };
}
