/**
 * lib/timeline/project-actions.ts
 *
 * "QUÉ HACER ACÁ" — motor puro (sin Prisma, client-safe) que convierte las señales que Nexus YA
 * calcula en una lista corta de acciones para el CSE.
 *
 * Por qué existe: el canvas del cronograma era una pantalla larga sin un "arriba". Las señales
 * estaban todas —borradores del agente sin confirmar, pendientes del cliente vencidos, alcance por
 * encima de lo vendido, alarmas de etapa, cambios que el cliente no vio— pero repartidas en otras
 * pantallas o escondidas entre bloques. El CSE armaba el estado del proyecto en su cabeza cada vez.
 *
 * Regla: **Nexus propone, el CSE decide.** Cada acción dice qué pasa, por qué importa y qué hacer;
 * ninguna se ejecuta sola.
 *
 * Se agrupa por ACCIÓN (qué tiene que hacer), no por tipo de objeto:
 *   - decidir  → hay algo esperando su criterio
 *   - publicar → hay algo listo que el cliente todavía no ve
 *   - atender  → hay algo que se está deteriorando
 *
 * CRITERIO DE ADMISIÓN (lo que evita que el panel crezca sin control): entra acá lo que
 *   (a) tiene una acción concreta y única, (b) empeora si nadie lo hace, y (c) no se ve solo al
 *   bajar la pantalla. **Un ítem por CLASE de problema, con el número adentro — nunca uno por fila.**
 * El panel es un índice, no una lista de tareas: crece con las clases (finitas, las define el
 * código), no con los datos.
 */

export type ActionGroup = "decidir" | "publicar" | "atender";
export type ActionTone = "info" | "warn" | "risk";

export interface ProjectAction {
  /** Clave estable (para React y para tests). */
  id: string;
  group: ActionGroup;
  /** Qué pasa — en una línea, con el número adelante cuando aplica. */
  title: string;
  /** Por qué importa — la consecuencia de no hacerlo. */
  why: string;
  /** Qué hacer — label del botón. */
  cta: string;
  tone: ActionTone;
}

export interface ProjectActionsInput {
  // ── Borradores del agente esperando confirmación ──
  pendingProgress: boolean;
  pendingParticularidades: number;
  pendingProposal: boolean;
  // ── Estado de publicación ──
  anchorStartDate: string | null;
  detailConfirmedAt: string | null;
  timelinePublishedAt: string | null;
  hasTasks: boolean;
  /** Hay cambios guardados que el cliente todavía no vio (del publish-diff). */
  cambiosSinPublicar: boolean;
  // ── Particularidades ──
  /** ATRASO sin semanas: no suma al corrimiento y no sirve para nada hasta cuantificarlo. */
  sinCuantificar: number;
  /** Posibles duplicados del mismo hecho detectados en la lista. */
  duplicados: number;
  /** Compromisos/insumos anotados que todavía no tienen una tarea persiguiéndolos. */
  compromisosSinTarea: number;
  /** Compromisos convertidos en tarea cuya fecha ya pasó y siguen sin hacerse. */
  compromisosVencidos: number;
  // ── Riesgo (del summary y del cronograma) ──
  pendientesDelClienteVencidos: number;
  tareasVencidas: number;
  /** Alarmas de etapa ya calculadas (kickoff sin publicar, cronograma sin consensuar, sin baseline). */
  alarmasDeEtapa: Array<{ key: string; label: string; days: number }>;
  /** Alcance por encima de lo vendido (y que no sea ruido de baseline flojo). */
  alcanceExcedido: { addedTasks: number; weeksDelta: number } | null;
  /** Sin señales de actividad hace mucho. */
  estancadoDias: number | null;
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/**
 * Devuelve las acciones ordenadas: primero lo que espera una decisión (destraba el resto), después
 * lo que hay que publicar, al final lo que se está deteriorando. Lista vacía = todo al día.
 */
export function buildProjectActions(i: ProjectActionsInput): ProjectAction[] {
  const out: ProjectAction[] = [];

  // ── DECIDIR ────────────────────────────────────────────────────────────────
  if (i.pendingProgress) {
    out.push({
      id: "draft-progress", group: "decidir", tone: "info",
      title: "El agente detectó avance sin confirmar",
      why: "Hasta que lo confirmes, el cronograma muestra un avance más viejo del real.",
      cta: "Revisar avance",
    });
  }
  if (i.pendingParticularidades > 0) {
    out.push({
      id: "draft-particularidades", group: "decidir", tone: "info",
      title: `${plural(i.pendingParticularidades, "desviación detectada", "desviaciones detectadas")} sin confirmar`,
      why: "Son los cambios de plan que podrías explicarle al cliente.",
      cta: "Revisar desviaciones",
    });
  }
  if (i.pendingProposal) {
    out.push({
      id: "draft-proposal", group: "decidir", tone: "info",
      title: "Hay una propuesta de cronograma sin aplicar",
      why: "El cronograma vivo sigue con la versión anterior.",
      cta: "Ver propuesta",
    });
  }
  // Va antes que la higiene de datos: acá hay trabajo que nadie está haciendo, no una fila mal cargada.
  if (i.compromisosSinTarea > 0) {
    out.push({
      id: "compromisos-sin-tarea", group: "decidir", tone: "warn",
      title: `${plural(i.compromisosSinTarea, "compromiso sin tarea", "compromisos sin tarea")}`,
      why: "Quedaron anotados, pero nadie los tiene asignados ni tienen fecha: no vencen y no avisan.",
      cta: "Convertir en tareas",
    });
  }
  if (i.duplicados > 0) {
    out.push({
      id: "duplicados", group: "decidir", tone: "warn",
      title: `${plural(i.duplicados, "desviación repetida", "desviaciones repetidas")}`,
      why: "El mismo hecho cargado dos veces cuenta el atraso doble e infla el total.",
      cta: "Revisar y fusionar",
    });
  }
  if (i.sinCuantificar > 0) {
    out.push({
      id: "sin-cuantificar", group: "decidir", tone: "warn",
      title: `${plural(i.sinCuantificar, "atraso sin semanas", "atrasos sin semanas")}`,
      why: "Sin semanas no suman al total de atraso: el número que ves queda corto.",
      cta: "Cuantificar",
    });
  }

  // ── PUBLICAR ───────────────────────────────────────────────────────────────
  if (!i.anchorStartDate) {
    out.push({
      id: "sin-anchor", group: "publicar", tone: "warn",
      title: "El cronograma no tiene fecha de arranque",
      why: "Sin fecha no hay calendario: no se calculan atrasos ni se puede compartir.",
      cta: "Fijar arranque",
    });
  } else if (i.hasTasks && !i.detailConfirmedAt) {
    out.push({
      id: "detalle-sin-confirmar", group: "publicar", tone: "info",
      title: "El detalle de tareas no está confirmado",
      why: "El cliente ve las fases pero no las tareas.",
      cta: "Confirmar detalle",
    });
  }
  if (i.anchorStartDate && !i.timelinePublishedAt) {
    out.push({
      id: "sin-publicar", group: "publicar", tone: "warn",
      title: "El cronograma no está publicado",
      why: "El cliente todavía no puede verlo.",
      cta: "Subir al cliente",
    });
  } else if (i.cambiosSinPublicar) {
    out.push({
      id: "cambios-sin-publicar", group: "publicar", tone: "info",
      title: "Hay cambios que el cliente todavía no vio",
      why: "Lo que ve sigue siendo la versión de la última publicación.",
      cta: "Subir al cliente",
    });
  }

  // ── ATENDER ────────────────────────────────────────────────────────────────
  if (i.pendientesDelClienteVencidos > 0) {
    out.push({
      id: "blockers-cliente", group: "atender", tone: "risk",
      title: `${plural(i.pendientesDelClienteVencidos, "entrega del cliente vencida", "entregas del cliente vencidas")}`,
      why: "Es lo que está frenando el avance; el cliente ya lo ve en su cronograma.",
      cta: "Ver pendientes",
    });
  }
  if (i.compromisosVencidos > 0) {
    out.push({
      id: "compromisos-vencidos", group: "atender", tone: "risk",
      title: `${plural(i.compromisosVencidos, "compromiso vencido sin cumplir", "compromisos vencidos sin cumplir")}`,
      why: "La fecha pasó y la tarea sigue pendiente. Si eso movió el plan, conviene registrarlo como atraso.",
      cta: "Ver compromisos",
    });
  }
  if (i.tareasVencidas > 0) {
    out.push({
      id: "tareas-vencidas", group: "atender", tone: "warn",
      title: `${plural(i.tareasVencidas, "tarea vencida", "tareas vencidas")} en el plan`,
      why: "O se hicieron y falta marcarlas, o el plan ya no refleja la realidad.",
      cta: "Revisar el plan",
    });
  }
  for (const a of i.alarmasDeEtapa) {
    out.push({
      id: `etapa-${a.key}`, group: "atender", tone: "warn",
      title: a.label,
      why: `Lleva ${plural(a.days, "día", "días")} así.`,
      cta: "Resolver",
    });
  }
  if (i.alcanceExcedido) {
    const { addedTasks, weeksDelta } = i.alcanceExcedido;
    const bits = [
      addedTasks > 0 ? `+${plural(addedTasks, "tarea", "tareas")}` : null,
      weeksDelta > 0 ? `+${plural(weeksDelta, "semana", "semanas")}` : null,
    ].filter(Boolean).join(" · ");
    out.push({
      id: "alcance", group: "atender", tone: "risk",
      title: `Estás entregando de más: ${bits} vs lo vendido`,
      why: "Trabajo que no se cotizó. Si el cliente lo pidió, conviene registrarlo antes de seguir.",
      cta: "Ver alcance",
    });
  }
  if (i.estancadoDias !== null && i.estancadoDias > 0) {
    out.push({
      id: "estancado", group: "atender", tone: "warn",
      title: `Sin movimiento hace ${plural(i.estancadoDias, "día", "días")}`,
      why: "Ni avance confirmado ni cambios en el plan.",
      cta: "Revisar",
    });
  }

  return out;
}

/** Agrupa para el render, preservando el orden de `buildProjectActions`. */
export function groupActions(actions: ProjectAction[]): Array<{ group: ActionGroup; label: string; items: ProjectAction[] }> {
  const LABEL: Record<ActionGroup, string> = {
    decidir: "Decidir",
    publicar: "Publicar",
    atender: "Atender",
  };
  const order: ActionGroup[] = ["decidir", "publicar", "atender"];
  return order
    .map((g) => ({ group: g, label: LABEL[g], items: actions.filter((a) => a.group === g) }))
    .filter((s) => s.items.length > 0);
}
