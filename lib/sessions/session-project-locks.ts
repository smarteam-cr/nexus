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
 *   - timelineOverride === true  → el CSE eligió la reunión en el Contexto del CRONOGRAMA (2026-09-23)
 *   - diagnosisOverride === true → el CSE la agregó en el Contexto del DIAGNÓSTICO (2026-09-28). La X
 *                                  (`false`) no lockea, por la misma razón que la del cronograma.
 *   - planningOverride / implementationOverride === true → lo mismo en la PLANIFICACIÓN y la
 *                                  EJECUCIÓN (2026-09-29).
 *   - kickoffOverride / explorationOverride / techRequirementsOverride / deliveryOverride === true →
 *                                  lo mismo en el KICKOFF, la EXPLORACIÓN, INTEGRACIONES y la ENTREGA
 *                                  (2026-10-07).
 *
 * Desde la segunda versión (2026-09-23, entra solo lo elegido) la X escribe `null`; un `false` solo
 * queda de la primera. Ninguno de los dos lockea, y el motivo sigue siendo el de abajo.
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
  diagnosisOverride: boolean | null;
  planningOverride: boolean | null;
  implementationOverride: boolean | null;
  kickoffOverride: boolean | null;
  explorationOverride: boolean | null;
  techRequirementsOverride: boolean | null;
  deliveryOverride: boolean | null;
}

/** ¿Un humano tocó este link? Entonces el clasificador no lo modifica ni lo borra. */
export function isLockedLink(l: SessionProjectLockFields): boolean {
  return (
    l.source === "manual" ||
    l.reviewedAt !== null ||
    !l.included ||
    l.handoffOverride !== null ||
    l.timelineOverride === true ||
    l.diagnosisOverride === true ||
    l.planningOverride === true ||
    l.implementationOverride === true ||
    l.kickoffOverride === true ||
    l.explorationOverride === true ||
    l.techRequirementsOverride === true ||
    l.deliveryOverride === true
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
  // Dos OR con la misma regla (null o false) y un AND que los junta: un segundo `OR:` suelto en el
  // mismo objeto pisaría al primero, y el vínculo elegido para el cronograma volvería a borrarse.
  AND: [
    { OR: [{ timelineOverride: null }, { timelineOverride: false }] },
    { OR: [{ diagnosisOverride: null }, { diagnosisOverride: false }] },
    { OR: [{ planningOverride: null }, { planningOverride: false }] },
    { OR: [{ implementationOverride: null }, { implementationOverride: false }] },
    { OR: [{ kickoffOverride: null }, { kickoffOverride: false }] },
    { OR: [{ explorationOverride: null }, { explorationOverride: false }] },
    { OR: [{ techRequirementsOverride: null }, { techRequirementsOverride: false }] },
    { OR: [{ deliveryOverride: null }, { deliveryOverride: false }] },
  ],
};
