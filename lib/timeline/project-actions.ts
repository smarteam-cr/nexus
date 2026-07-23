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
  /** Qué hacer — label del botón. **`null` = la fila informa y no lleva a ningún lado.**
   *  Preferimos una fila sin botón a un botón que scrollea a cualquier parte: eso último es
   *  exactamente lo que hacía que el panel se sintiera decorativo. */
  cta: string | null;
  tone: ActionTone;
  /** Bloquea al resto: se renderiza ARRIBA de los grupos, bajo "Antes que nada". Es para lo que
   *  vuelve ruido a todo lo demás — hoy solo la falta de fecha de arranque. */
  blocking?: boolean;
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
  /** Repetidas: `filas` es lo que el CSE VE al abrir el grupo, `hechos` lo que tiene que resolver.
   *  Los dos, porque un contador que no coincide con el destino de su propio botón no sirve. */
  duplicados: { hechos: number; filas: number };
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
      title: "Hay avance detectado que no confirmaste",
      why: "Hasta que lo confirmes, vos y el cliente miran un avance más viejo que el real.",
      cta: "Revisar avance",
    });
  }
  if (i.pendingParticularidades > 0) {
    out.push({
      id: "draft-particularidades", group: "decidir", tone: "info",
      title: `${plural(i.pendingParticularidades, "particularidad detectada", "particularidades detectadas")} sin confirmar`,
      why: "Son la explicación de por qué se movió el plan. Sin confirmar no suman al atraso ni le llegan al cliente.",
      cta: "Revisar particularidades",
    });
  }
  if (i.pendingProposal) {
    out.push({
      id: "draft-proposal", group: "decidir", tone: "info",
      title: "La IA sugiere cambios de estructura en el cronograma",
      why: "Salieron del último handoff. Las tareas y sus estados no se tocan: son fases nuevas o ajustes de fase que aceptás o descartás uno por uno en el Gantt.",
      cta: "Revisar sugerencias",
    });
  }
  // Va antes que la higiene de datos: acá hay trabajo que nadie está haciendo, no una fila mal cargada.
  if (i.compromisosSinTarea > 0) {
    out.push({
      id: "compromisos-sin-tarea", group: "decidir", tone: "warn",
      title: `${plural(i.compromisosSinTarea, "compromiso que nadie está persiguiendo", "compromisos que nadie está persiguiendo")}`,
      why: "Quedaron anotados pero sin dueño ni fecha: no vencen, no avisan, y aparecen cuando el cliente los reclama.",
      cta: "Convertir en tareas",
    });
  }
  if (i.duplicados.hechos > 0) {
    const { filas, hechos } = i.duplicados;
    out.push({
      id: "duplicados", group: "decidir", tone: "warn",
      // Los dos números: `filas` es lo que va a ver, `hechos` lo que tiene que resolver.
      title: `${plural(filas, "fila repite", "filas repiten")} ${plural(hechos, "hecho ya cargado", "hechos ya cargados")}`,
      why: "Cada repetición vuelve a sumar sus semanas: el atraso que ves —y el que ve el cliente— está inflado.",
      // "Fusionar" todavía no existe como gesto; no lo prometemos en el botón.
      cta: "Revisar repetidas",
    });
  }
  if (i.sinCuantificar > 0) {
    out.push({
      id: "sin-cuantificar", group: "decidir", tone: "warn",
      // El verbo va DENTRO del plural: con el sufijo afuera, el singular quedaba "1 atraso no dice
      // cuánto movieron el plan".
      title: plural(
        i.sinCuantificar,
        "atraso no dice cuánto movió el plan",
        "atrasos no dicen cuánto movieron el plan",
      ),
      why: "Un atraso sin semanas no entra en el total: el atraso que estás mostrando queda corto.",
      cta: "Poner las semanas",
    });
  }

  // ── PUBLICAR ───────────────────────────────────────────────────────────────
  if (!i.anchorStartDate) {
    out.push({
      id: "sin-anchor", group: "publicar", tone: "warn",
      title: "El cronograma no tiene fecha de arranque",
      why: "Sin fecha no hay calendario: no se calcula ningún atraso, no se puede publicar, y nadie sabe en qué semana está el proyecto.",
      cta: "Fijar el arranque",
      // Sin arranque, buena parte del resto del panel es ruido: se muestra arriba de los grupos.
      blocking: true,
    });
  } else if (i.hasTasks && !i.detailConfirmedAt) {
    out.push({
      id: "detalle-sin-confirmar", group: "publicar", tone: "info",
      title: "El detalle de tareas no está confirmado",
      why: "El cliente ve las fases pero no las tareas: no puede saber qué le toca hacer a él.",
      cta: "Confirmar detalle",
    });
  }
  if (i.anchorStartDate && !i.timelinePublishedAt) {
    out.push({
      id: "sin-publicar", group: "publicar", tone: "warn",
      title: "El cronograma no está publicado",
      why: "El cliente todavía no lo puede ver: para él, este proyecto no tiene plan.",
      cta: "Subir al cliente",
    });
  } else if (i.cambiosSinPublicar) {
    out.push({
      id: "cambios-sin-publicar", group: "publicar", tone: "info",
      title: "Hay cambios guardados que el cliente no vio",
      why: "Lo que él lee sigue siendo la foto de la última publicación.",
      cta: "Subir al cliente",
    });
  }

  // ── ATENDER ────────────────────────────────────────────────────────────────
  if (i.pendientesDelClienteVencidos > 0) {
    out.push({
      id: "blockers-cliente", group: "atender", tone: "risk",
      title: `${plural(i.pendientesDelClienteVencidos, "entrega del cliente está vencida", "entregas del cliente están vencidas")}`,
      why: "Es lo que frena el avance, y el cliente ya lo ve vencido. Si no se lo reclamás, el atraso queda a tu nombre.",
      cta: "Ver las entregas",
    });
  }
  if (i.compromisosVencidos > 0) {
    out.push({
      id: "compromisos-vencidos", group: "atender", tone: "risk",
      title: `${plural(i.compromisosVencidos, "compromiso vencido sin cumplir", "compromisos vencidos sin cumplir")}`,
      why: "La fecha pasó y la tarea sigue abierta. Si eso movió el plan, hoy ese atraso no está registrado en ningún lado.",
      cta: "Ver los vencidos",
    });
  }
  if (i.tareasVencidas > 0) {
    out.push({
      id: "tareas-vencidas", group: "atender", tone: "warn",
      title: `${plural(i.tareasVencidas, "tarea del plan está vencida", "tareas del plan están vencidas")}`,
      why: "O se hicieron y falta marcarlas, o el plan ya no refleja la realidad: en los dos casos el avance que ve el cliente está mal.",
      cta: "Revisar el plan",
    });
  }
  // Las alarmas de etapa eran la ÚNICA familia que emitía N filas por dato, violando la regla que
  // este mismo archivo declara arriba ("un ítem por CLASE, nunca uno por fila"). Con más de una se
  // colapsan: el detalle está a un click, en el panel de ciclo de vida al que lleva el botón.
  if (i.alarmasDeEtapa.length === 1) {
    const a = i.alarmasDeEtapa[0];
    out.push({
      id: `etapa-${a.key}`, group: "atender", tone: "warn",
      title: `${a.label} hace ${plural(a.days, "día", "días")}`,
      why: "La etapa no avanza hasta que esto se cierre.",
      cta: "Ir a la etapa",
    });
  } else if (i.alarmasDeEtapa.length > 1) {
    const peor = [...i.alarmasDeEtapa].sort((a, b) => b.days - a.days)[0];
    out.push({
      id: `etapa-${peor.key}`, group: "atender", tone: "warn",
      title: `${i.alarmasDeEtapa.length} validaciones de etapa sin cerrar`,
      why: `La más vieja es «${peor.label}», hace ${plural(peor.days, "día", "días")}. La etapa no avanza hasta que se cierren.`,
      cta: "Ir a la etapa",
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
      why: "Trabajo que nadie cotizó. Si el cliente lo pidió, registralo ahora — después no vas a tener con qué respaldarlo.",
      // Sin destino en esta pantalla: el alcance se calcula en la cartera. Una fila informativa es
      // más honesta que un botón que scrollea a cualquier lado.
      cta: null,
    });
  }
  if (i.estancadoDias !== null && i.estancadoDias > 0) {
    out.push({
      id: "estancado", group: "atender", tone: "warn",
      title: `Sin movimiento hace ${plural(i.estancadoDias, "día", "días")}`,
      why: "Ni avance confirmado ni cambios en el plan. Si el proyecto sigue activo, el cronograma está mintiendo.",
      cta: "Buscar avance",
    });
  }

  return out;
}

/** Las bloqueantes salen de los grupos y se muestran arriba de todo. */
export function splitBlocking(actions: ProjectAction[]): {
  blocking: ProjectAction[];
  rest: ProjectAction[];
} {
  return {
    blocking: actions.filter((a) => a.blocking),
    rest: actions.filter((a) => !a.blocking),
  };
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
