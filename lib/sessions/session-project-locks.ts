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
}

/** ¿Un humano tocó este link? Entonces el clasificador no lo modifica ni lo borra. */
export function isLockedLink(l: SessionProjectLockFields): boolean {
  return l.source === "manual" || l.reviewedAt !== null || !l.included || l.handoffOverride !== null;
}
