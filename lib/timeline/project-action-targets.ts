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
  /** A la lista de particularidades, enfocando UN grupo concreto de la lista.
   *  El grupo va acá y no en el canvas: antes lo decidía un if-chain
   *  (`id === "compromisos-sin-tarea" ? "compromisos" : "arreglar"`), que es exactamente el
   *  fallback silencioso que este archivo existe para matar — una acción nueva caía en
   *  "arreglar" sin que nada avisara. Con el grupo en la tabla, el test lo cubre. */
  | { kind: "particularidades"; group: "compromisos" | "arreglar" | "sugerencias" }
  /** Abre el cajón de borradores del agente (avance + particularidades propuestas). */
  | { kind: "drawer"; drawer: "borradores" }
  /** Ejecuta algo en vez de navegar: el click ES la decisión. */
  | { kind: "run"; intent: "confirm-detail" }
  /** Sin destino: la fila se muestra sin botón. Mejor que un botón que no cumple. */
  | { kind: "none" };

/** Anclas de la página. Cada una tiene que existir en el DOM con `scroll-mt-24`. */
export const ANCHORS = {
  arranque: "cronograma-arranque",
  gantt: "cronograma-gantt",
  particularidades: "cronograma-particularidades",
  pendientesCliente: "cronograma-pendientes-cliente",
  etapa: "proyecto-etapa",
} as const;

const A = (anchor: string): ActionTarget => ({ kind: "anchor", anchor });
const PARTS = (group: "compromisos" | "arreglar" | "sugerencias"): ActionTarget => ({
  kind: "particularidades",
  group,
});
const BORRADORES: ActionTarget = { kind: "drawer", drawer: "borradores" };

/**
 * Destino por id de acción. Los `etapa-*` se resuelven aparte porque son dinámicos (uno por alarma).
 *
 * Si agregás una acción al motor y no la agregás acá, `project-action-targets.test.ts` falla
 * nombrándola. Ese test es lo que impide que vuelva a haber acciones huérfanas.
 */
export const ACTION_TARGETS: Record<string, ActionTarget> = {
  // ── Borradores del agente ────────────────────────────────────────────────────
  // Los dos banners dejaron de vivir arriba del Gantt y ahora comparten un cajón, así que
  // no hay ancla a la que scrollear: se abre.
  "draft-progress": BORRADORES,
  "draft-particularidades": BORRADORES,
  // La propuesta de estructura se resuelve DENTRO del Gantt (badges azules + filas fantasma
  // por fase), así que el destino es el Gantt, no un banner que ya no existe.
  "draft-proposal": A(ANCHORS.gantt),

  // ── Filas de la lista: el CTA enfoca su grupo ────────────────────────────────
  "compromisos-sin-tarea": PARTS("compromisos"),
  duplicados: PARTS("arreglar"),
  "sin-cuantificar": PARTS("arreglar"),
  "compromisos-vencidos": PARTS("arreglar"),
  "sugerencias-equipo": PARTS("sugerencias"),

  // ── Condiciones del plan ─────────────────────────────────────────────────────
  "sin-anchor": A(ANCHORS.arranque),
  // No scrollea: confirma. Mandarte a un botón que dice lo mismo que acabás de clickear es
  // fricción sin propósito — el click ES la decisión (con su confirmación de por medio).
  "detalle-sin-confirmar": { kind: "run", intent: "confirm-detail" },

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
