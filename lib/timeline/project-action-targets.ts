/**
 * lib/timeline/project-action-targets.ts
 *
 * A DÓNDE lleva cada acción del panel "Qué hacer acá" — tabla pura, sin DOM ni React.
 *
 * POR QUÉ EXISTE: esto era un if-chain de 6 líneas dentro del canvas, con un `return` final que
 * mandaba todo lo no contemplado al tope del Gantt. Terminaron **8 de 16 acciones** cayendo ahí —
 * un botón que dice "Ver alcance" y te deja mirando la primera fila de un Gantt de 19 semanas. Y una
 * (`draft-proposal`) apuntaba a un ancla que solo existe si hay OTROS banners: con solo una propuesta
 * pendiente, el botón no hacía absolutamente nada.
 *
 * El fallback silencioso es lo que hizo que se pudriera: una acción nueva se agrega al motor, nadie
 * le asigna destino, y nada avisa. Acá el destino es **explícito por id** y el test de al lado exige
 * que toda acción emitida tenga uno.
 */

/** Los destinos posibles. `none` es explícito: "esta acción informa, no lleva a ningún lado". */
export type ActionTarget =
  /** Scroll a un ancla concreta de la página. */
  | { kind: "anchor"; anchor: string }
  /** A la lista de particularidades, enfocando las filas de ESTA acción (el canvas resuelve los ids). */
  | { kind: "particularidades" }
  /** Ejecuta algo en vez de navegar: el click ES la decisión. */
  | { kind: "run"; intent: "publish" | "confirm-detail" }
  /** Sin destino: la fila se muestra sin botón. Mejor que un botón que no cumple. */
  | { kind: "none" };

/** Anclas de la página. Cada una tiene que existir en el DOM con `scroll-mt-24`. */
export const ANCHORS = {
  borradores: "cronograma-borradores",
  propuesta: "cronograma-propuesta",
  arranque: "cronograma-arranque",
  gantt: "cronograma-gantt",
  particularidades: "cronograma-particularidades",
  pendientesCliente: "cronograma-pendientes-cliente",
  etapa: "proyecto-etapa",
} as const;

const A = (anchor: string): ActionTarget => ({ kind: "anchor", anchor });
const PARTS: ActionTarget = { kind: "particularidades" };

/**
 * Destino por id de acción. Los `etapa-*` se resuelven aparte porque son dinámicos (uno por alarma).
 *
 * Si agregás una acción al motor y no la agregás acá, `project-action-targets.test.ts` falla
 * nombrándola. Ese test es lo que impide que vuelva a haber acciones huérfanas.
 */
export const ACTION_TARGETS: Record<string, ActionTarget> = {
  // ── Borradores del agente ────────────────────────────────────────────────────
  "draft-progress": A(ANCHORS.borradores),
  "draft-particularidades": A(ANCHORS.borradores),
  // Ancla PROPIA: `#cronograma-borradores` solo existe si hay banners de avance o particularidades.
  "draft-proposal": A(ANCHORS.propuesta),

  // ── Filas de la lista: el CTA enfoca las suyas ───────────────────────────────
  "compromisos-sin-tarea": PARTS,
  duplicados: PARTS,
  "sin-cuantificar": PARTS,
  "compromisos-vencidos": PARTS,

  // ── Publicación ──────────────────────────────────────────────────────────────
  "sin-anchor": A(ANCHORS.arranque),
  // No scrollea: confirma. Mandarte a un botón que dice lo mismo que acabás de clickear es
  // fricción sin propósito — el click ES la decisión (con su confirmación de por medio).
  "detalle-sin-confirmar": { kind: "run", intent: "confirm-detail" },
  "sin-publicar": { kind: "run", intent: "publish" },
  "cambios-sin-publicar": { kind: "run", intent: "publish" },

  // ── Riesgo ───────────────────────────────────────────────────────────────────
  "blockers-cliente": A(ANCHORS.pendientesCliente),
  "tareas-vencidas": A(ANCHORS.gantt),
  // El alcance vs lo vendido se calcula en el summary y NO tiene superficie en esta pantalla.
  // Preferimos una fila informativa a un botón que scrollea a cualquier lado.
  alcance: { kind: "none" },
  estancado: A(ANCHORS.gantt),
};

/** Prefijo de las acciones de alarma de etapa (`etapa-kickoff_sin_publicar`, etc.). */
export const STAGE_ACTION_PREFIX = "etapa-";

/**
 * El destino de una acción. `null` = no hay destino declarado, que es un BUG (lo caza el test),
 * no un caso válido — para "no lleva a ningún lado" existe `{ kind: "none" }`.
 */
export function targetFor(actionId: string): ActionTarget | null {
  // Las alarmas de etapa son dinámicas (una por alarma) y todas van al panel de ciclo de vida,
  // que vive en la misma página y tiene los gates para cerrarlas.
  if (actionId.startsWith(STAGE_ACTION_PREFIX)) return A(ANCHORS.etapa);
  return ACTION_TARGETS[actionId] ?? null;
}
