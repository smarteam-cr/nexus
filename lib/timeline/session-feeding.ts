/**
 * lib/timeline/session-feeding.ts — QUÉ REUNIONES ALIMENTAN AL CRONOGRAMA. UNA SOLA REGLA.
 *
 * ── POR QUÉ NO ES LA DEL HANDOFF ─────────────────────────────────────────────
 * El handoff descarta A PROPÓSITO las reuniones de implementación, las semanales y las de revisión
 * (`lib/handoff/session-relevance.ts:6-10`): cuentan la entrega del servicio, no la venta. Para el
 * cronograma es exactamente al revés — esas son las reuniones que dicen qué fases hay y qué tareas
 * se hicieron. Clonar la regla del handoff habría dejado al cronograma sin su material.
 *
 * ── LA REGLA: ENTRA SOLO LO QUE EL CSE ELIGIÓ (decisión de Elías, 2026-09-23) ──
 * La primera versión dejaba entrar por defecto TODA reunión del proyecto y el CSE sacaba con la X.
 * En pantalla eso eran 61 reuniones de golpe, casi todas ruido para armar tareas. Ahora el CSE ELIGE
 * (`timelineOverride=true`), buscándolas entre las del proyecto o en su propio calendario, y la X
 * deja de elegirla (`null`). Un `false` que haya quedado de la primera versión vale lo mismo que
 * `null`: no elegida.
 *
 * El tombstone manda sobre todo: una reunión que un humano sacó DEL PROYECTO no alimenta nada
 * aunque esté elegida (elegirla de nuevo la vuelve a hacer del proyecto — ver timeline/sessions).
 *
 * Elegirla o sacarla NO toca `handoffOverride`: la reunión sigue siendo del proyecto para el
 * handoff, la Entrega y las minutas. Tampoco la mira el agente de AVANCE, que lee solo las reuniones
 * recientes del proyecto (`lib/sessions/project-sessions.ts`): detectar lo que ya pasó no puede
 * depender de que alguien se acuerde de elegir la reunión de ayer.
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
  // Solo la que el CSE eligió. `null` (nunca elegida) y `false` (la X de la primera versión) no.
  return l.timelineOverride === true;
}
