/**
 * lib/flow/stage-pieces.ts — EL MAPA ETAPA ↔ PIEZA. PURO (solo type-imports).
 *
 * Esta es la pieza que faltaba para que Nexus se lea como una médula espinal y no como
 * una lista de canvases. Existían por separado el orden de las etapas
 * (lib/lifecycle/stage-engine.ts) y el catálogo de piezas (lib/pieces/registry.ts), pero
 * NADA declaraba cuál pieza corresponde a cuál etapa: esa relación solo vivía en el copy
 * en prosa de los gates, o sea que no se podía consultar ni testear.
 *
 * ── LA REGLA QUE RESUELVE LAS AMBIGÜEDADES ───────────────────────────────────
 * **La pieza PRIMARIA de una etapa es la que mide su salida.** Con eso, "qué me falta
 * para avanzar" y "qué documento abro" son la misma respuesta, y las tres ambigüedades
 * del flujo se resuelven solas:
 *
 *   · PLANIFICACION tiene dos piezas (Cronograma y Planificación) y el gate se llama
 *     CRONOGRAMA_CONSENSUADO → la primaria es el CRONOGRAMA. La pieza "Planificación"
 *     es el documento de apoyo. (El registro ya lo insinuaba: su celda de permiso es la
 *     del cronograma.)
 *   · HAND_OFF cubre DOS piezas —el handoff y el kickoff— y su salida es el kickoff.
 *     No se parte la etapa en dos: renumerar el ciclo cambiaría todos los "Etapa 3/9"
 *     del producto, el mapeo con HubSpot y las opciones del override, a cambio de nada.
 *   · CONFIGURACION_TECNICA tiene pieza pero su gate (DEMO_APROBADA) se cierra con el
 *     cliente fuera de Nexus → `primary: null`, que se lee "tiene documento, pero su
 *     salida no se decide acá".
 *
 * ── QUÉ PIEZAS ENTRAN ────────────────────────────────────────────────────────
 * Solo las de ámbito PROYECTO. La propuesta comercial y la Información del cliente
 * quedan fuera por un dato que el registro ya declara (`scope`), no por una excepción:
 * la primera cuelga de un BusinessCase y la segunda es del CLIENTE (dos proyectos la
 * comparten). Cada una tiene su propia casa en el producto.
 *
 * ── ETAPAS SIN PIEZA ─────────────────────────────────────────────────────────
 * Adopción, Validación de uso y Finalizado son HITOS: se marcan, no se abren.
 * `pieces: []` no es un hueco a llenar — es la decisión de que ahí no hay documento
 * (negocio, 2026-07-25). Lo mismo para OPERACION_CONTINUA del ciclo corto.
 *
 * ⚠ ENMIENDA (negocio, 2026-08-12): ENTREGA deja de ser hito y estrena la pieza `delivery`.
 * La decisión de julio decía «ahí no hay documento» y era cierta MIENTRAS la entrega fuera
 * una casilla que alguien marcaba. Hoy la entrega es un entregable: el cierre que el cliente
 * archiva y cita. La etapa se sigue cerrando con `ENTREGA_REALIZADA` —el documento la
 * acompaña, no la reemplaza—, y `pieces: []` sigue significando lo mismo para las otras tres.
 */
import type { ProjectLifecycleStage, ProjectStageGateKey } from "@prisma/client";
import type { LifecycleCycle } from "@/lib/lifecycle/stage-engine";

export interface StageFlow {
  stage: ProjectLifecycleStage;
  /** Piezas que se trabajan en esta etapa, en orden de trabajo. Vacío = HITO. */
  pieces: string[];
  /** La pieza cuya salida cierra la etapa. null = no se cierra con un documento. */
  primary: string | null;
  /** Gate que cierra la etapa. null = la salida es una señal dura o es terminal. */
  gate: ProjectStageGateKey | null;
  /** En qué ciclos aparece esta etapa. */
  cycles: LifecycleCycle[];
}

const AMBOS: LifecycleCycle[] = ["full", "short"];

export const STAGE_FLOW: StageFlow[] = [
  {
    stage: "HAND_OFF",
    // Dos piezas bajo una etapa: el handoff es la base que arranca el proyecto y el
    // kickoff es lo que se le muestra al cliente. La etapa se cierra publicando (o
    // realizando) el kickoff — por eso `gate: null`: no hay ProjectStageGate, la señal
    // es `kickoffPublishedAt` o una sesión de kickoff (stage-engine.ts).
    pieces: ["handoff", "kickoff"],
    primary: "kickoff",
    gate: null,
    cycles: AMBOS,
  },
  {
    stage: "EXPLORACION",
    pieces: ["exploration"],
    primary: "exploration",
    gate: "ENTENDIMIENTO_CERRADO",
    cycles: ["full"],
  },
  {
    stage: "DIAGNOSTICO",
    pieces: ["diagnosis"],
    primary: "diagnosis",
    gate: "DIAGNOSTICO_COMPARTIDO",
    cycles: ["full"],
  },
  {
    stage: "PLANIFICACION",
    pieces: ["timeline", "planning"],
    primary: "timeline",
    gate: "CRONOGRAMA_CONSENSUADO",
    cycles: ["full"],
  },
  {
    // Dos piezas, y son complementarias: "Requerimientos técnicos" es QUÉ hay que
    // construir a la medida (opcional, solo con alcance técnico) e "Implementación" es
    // QUÉ hay que configurar en HubSpot esta semana según el cronograma.
    stage: "CONFIGURACION_TECNICA",
    pieces: ["tech-requirements", "implementation"],
    primary: null,
    gate: "DEMO_APROBADA",
    cycles: ["full"],
  },
  { stage: "ADOPCION", pieces: [], primary: null, gate: "CLIENTE_OPERANDO", cycles: ["full"] },
  { stage: "OPERACION_CONTINUA", pieces: [], primary: null, gate: null, cycles: ["short"] },
  { stage: "VALIDACION_USO", pieces: [], primary: null, gate: "USO_VALIDADO", cycles: ["full"] },
  { stage: "ENTREGA", pieces: ["delivery"], primary: "delivery", gate: "ENTREGA_REALIZADA", cycles: AMBOS },
  { stage: "FINALIZADO", pieces: [], primary: null, gate: null, cycles: AMBOS },
];

const BY_STAGE = new Map(STAGE_FLOW.map((f) => [f.stage, f]));

export function flowForStage(stage: ProjectLifecycleStage): StageFlow | null {
  return BY_STAGE.get(stage) ?? null;
}

/** Las etapas del ciclo que le toca a este proyecto, en orden. */
export function stagesForCycle(cycle: LifecycleCycle): StageFlow[] {
  return STAGE_FLOW.filter((f) => f.cycles.includes(cycle));
}

/** ¿Esta etapa es un hito (no hay documento que abrir)? */
export function isMilestone(stage: ProjectLifecycleStage): boolean {
  return (BY_STAGE.get(stage)?.pieces.length ?? 0) === 0;
}

/** A qué etapa pertenece una pieza. null si no es una pieza de proyecto. */
export function stageForPiece(slug: string): ProjectLifecycleStage | null {
  return STAGE_FLOW.find((f) => f.pieces.includes(slug))?.stage ?? null;
}

/** Todas las piezas del flujo, en orden narrativo (el orden de la médula). */
export function piecesInFlowOrder(cycle: LifecycleCycle = "full"): string[] {
  return stagesForCycle(cycle).flatMap((f) => f.pieces);
}
