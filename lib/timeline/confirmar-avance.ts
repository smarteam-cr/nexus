/**
 * lib/timeline/confirmar-avance.ts
 *
 * QUÉ DEL BODY SE PUEDE CONFIRMAR DE VERDAD. Puro, sin Prisma.
 *
 * ── EL AGUJERO QUE CIERRA (2026-08-11) ───────────────────────────────────────
 * `POST .../timeline/progress/apply` es el único lugar donde el avance PROPUESTO por el agente
 * se vuelve status real, y firma lo que escribe como `statusSource = AI_CONFIRMED` — que
 * significa, textual: *"lo detectó la IA y un humano lo confirmó"*.
 *
 * Pero el endpoint nunca leía el borrador. Los ids salían del body y solo se validaba que
 * pertenecieran al proyecto. O sea que se podían marcar DONE tareas que el agente jamás
 * propuso —o sin que existiera borrador alguno— y quedaban firmadas como si la IA las hubiera
 * detectado. Procedencia falsa, y no en un campo decorativo: `statusSource` es lo que leen la
 * fundación D.3 y el watchdog para distinguir el avance detectado del cargado a mano.
 *
 * ── LA ASIMETRÍA QUE HAY QUE RESPETAR ────────────────────────────────────────
 * Las fases y las tareas HECHAS sí se acotan al borrador: son la afirmación de la IA.
 * Las SUSPENDIDAS no, y es a propósito — el borrador nunca propone suspensiones (arranca
 * vacío en el banner) y la regla de cierre exige resolver TODAS las tareas de una fase que
 * se cierra, incluidas las que el agente ni mencionó. Acotarlas rompería el cierre de fases.
 * Lo que sí corresponde es firmarlas como lo que son: decisión HUMANA, no confirmación de IA.
 */

export interface BorradorDeAvance {
  currentPhaseId: string | null;
  phases: Array<{ id: string }>;
  tasks: Array<{ id: string }>;
}

export interface AvancePedido {
  phaseIds: string[];
  taskIds: string[];
  suspendedTaskIds: string[];
  currentPhaseId: string | null;
}

export interface AvanceAcotado extends AvancePedido {
  /** Ids que el body pidió confirmar y NO estaban en el borrador — se ignoran y se reportan. */
  ignorados: string[];
}

/**
 * Recorta lo pedido a lo que el borrador realmente propuso. Lo que queda afuera no se aplica:
 * se devuelve en `ignorados` para que el caller lo informe (mismo criterio `stale` que usa
 * `proposal/apply-items`, donde una clave vieja se reporta en vez de fallar toda la operación).
 */
export function acotarAlBorrador(pedido: AvancePedido, borrador: BorradorDeAvance | null): AvanceAcotado {
  if (!borrador) {
    // Sin borrador no hay nada que la IA haya propuesto: no se confirma NADA como AI_CONFIRMED.
    // Las suspensiones tampoco pasan por acá — este endpoint confirma un borrador, y no hay.
    return {
      phaseIds: [],
      taskIds: [],
      suspendedTaskIds: [],
      currentPhaseId: null,
      ignorados: [...pedido.phaseIds, ...pedido.taskIds, ...pedido.suspendedTaskIds],
    };
  }

  const delBorradorFases = new Set((borrador.phases ?? []).map((p) => p.id));
  const delBorradorTareas = new Set((borrador.tasks ?? []).map((t) => t.id));

  const phaseIds = pedido.phaseIds.filter((id) => delBorradorFases.has(id));
  const taskIds = pedido.taskIds.filter((id) => delBorradorTareas.has(id));
  const currentPhaseId =
    pedido.currentPhaseId && pedido.currentPhaseId === borrador.currentPhaseId ? pedido.currentPhaseId : null;

  const ignorados = [
    ...pedido.phaseIds.filter((id) => !delBorradorFases.has(id)),
    ...pedido.taskIds.filter((id) => !delBorradorTareas.has(id)),
    ...(pedido.currentPhaseId && pedido.currentPhaseId !== borrador.currentPhaseId ? [pedido.currentPhaseId] : []),
  ];

  return {
    phaseIds,
    taskIds,
    // Ver la asimetría del docblock: las suspensiones son del humano, pasan enteras.
    suspendedTaskIds: pedido.suspendedTaskIds,
    currentPhaseId,
    ignorados,
  };
}
