/**
 * lib/lifecycle/stage-engine.ts
 *
 * Motor PURO del ciclo de vida del proyecto (sin Prisma ni red — testeable en el
 * proyecto vitest "unit", espejo del patrón lib/portfolio/summary.ts).
 *
 * Modelo (definido por negocio, 2026-07-10): 8 etapas de implementación con
 * VALIDACIÓN DE SALIDA cada una ("lo que mueve la tarjeta") + ciclo corto para
 * continuidad/soporte/bolsas. La etapa NO se materializa: se INFIERE al vuelo por
 * cascada de gates cumplidos (ProjectStageGate + señales duras existentes) y el
 * CSE puede pisarla con Project.lifecycleStageOverride (patrón healthStatusOverride).
 *
 * La consume todo Nexus vía lib/lifecycle/index.ts (Cobranza incluida, v1 lectura).
 */
import type { ProjectLifecycleStage, ProjectStageGateKey } from "@prisma/client";
// Módulo hoja PURO (solo type-import de Prisma) — no rompe el aislamiento unit del motor.
import { RECURRENTE_TAG } from "@/lib/tags/catalog";

// ── Órdenes de ciclo ──────────────────────────────────────────────────────────

export const FULL_CYCLE_ORDER: ProjectLifecycleStage[] = [
  "HAND_OFF",
  "EXPLORACION",
  "DIAGNOSTICO",
  "PLANIFICACION",
  "CONFIGURACION_TECNICA",
  "ADOPCION",
  "VALIDACION_USO",
  "ENTREGA",
  "FINALIZADO",
];

export const SHORT_CYCLE_ORDER: ProjectLifecycleStage[] = [
  "HAND_OFF",
  "OPERACION_CONTINUA",
  "ENTREGA",
  "FINALIZADO",
];

export type LifecycleCycle = "full" | "short";

/**
 * Rango GLOBAL de cada etapa para comparar madurez entre ciclos distintos
 * (`stageAtOrAfter`). OPERACION_CONTINUA rankea como ADOPCION: un proyecto de
 * continuidad operando YA pasó la configuración → sus alarmas de cronograma
 * vencido APLICAN (mismo tier post-construcción).
 */
const STAGE_RANK: Record<ProjectLifecycleStage, number> = {
  HAND_OFF: 0,
  EXPLORACION: 1,
  DIAGNOSTICO: 2,
  PLANIFICACION: 3,
  CONFIGURACION_TECNICA: 4,
  ADOPCION: 5,
  OPERACION_CONTINUA: 5,
  VALIDACION_USO: 6,
  ENTREGA: 7,
  FINALIZADO: 8,
};

/** ¿`stage` está en (o después de) `floor` en madurez? Compara rangos globales. */
export function stageAtOrAfter(
  stage: ProjectLifecycleStage,
  floor: ProjectLifecycleStage,
): boolean {
  return STAGE_RANK[stage] >= STAGE_RANK[floor];
}

// ── Labels y mapeo HubSpot ────────────────────────────────────────────────────

export const STAGE_LABEL_ES: Record<ProjectLifecycleStage, string> = {
  HAND_OFF: "Hand Off",
  EXPLORACION: "Exploración",
  DIAGNOSTICO: "Diagnóstico",
  PLANIFICACION: "Planificación",
  CONFIGURACION_TECNICA: "Configuración técnica",
  ADOPCION: "Adopción",
  VALIDACION_USO: "Validación de uso",
  ENTREGA: "Entrega",
  OPERACION_CONTINUA: "Operación continua",
  FINALIZADO: "Finalizado",
};

/**
 * Internal value de la futura propiedad de HubSpot (sync bidireccional). Identidad
 * HOY a propósito: el enum de Prisma se diseñó con slugs estables; el mapeo queda
 * DECLARADO para que el write a HubSpot de mañana no dependa de nombres de enum.
 */
export const HUBSPOT_STAGE_VALUE: Record<ProjectLifecycleStage, string> = {
  HAND_OFF: "HAND_OFF",
  EXPLORACION: "EXPLORACION",
  DIAGNOSTICO: "DIAGNOSTICO",
  PLANIFICACION: "PLANIFICACION",
  CONFIGURACION_TECNICA: "CONFIGURACION_TECNICA",
  ADOPCION: "ADOPCION",
  VALIDACION_USO: "VALIDACION_USO",
  ENTREGA: "ENTREGA",
  OPERACION_CONTINUA: "OPERACION_CONTINUA",
  FINALIZADO: "FINALIZADO",
};

// ── Inferencia ────────────────────────────────────────────────────────────────

export interface LifecycleSignals {
  cycle: LifecycleCycle;
  /** Project.status ("active" | "paused" | "completed") — completed ⇒ FINALIZADO. */
  projectStatus: string;
  /** Salida de HAND_OFF (señal dura existente, no necesita gate). */
  kickoffPublishedAt: Date | null;
  /**
   * Señal ALTERNATIVA de salida de HAND_OFF: la sesión de Kick Off YA ocurrió
   * (getKickoffSessionDate). Cubre los proyectos previos al botón "Publicar
   * kickoff" — sin esto, medio catálogo legacy quedaría en HAND_OFF con las
   * alarmas de cronograma calladas. La higiene de publicar sigue visible en
   * el setup/checklist; el ciclo de vida mide el HECHO (el kickoff pasó).
   */
  kickoffSessionAt: Date | null;
  /** Gates cumplidos (ProjectStageGate.markedAt por key). */
  gates: Partial<Record<ProjectStageGateKey, Date>>;
  /** UUS del snapshot Partner (ClientPartnerSnapshot.uusScore), si hay. */
  uusScore: number | null;
  /** CsSettings.uusValidationThreshold. */
  uusThreshold: number;
}

export interface InferredStage {
  stage: ProjectLifecycleStage;
  /** Por qué está acá, en español legible (cumplido + pendiente). */
  reasons: string[];
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Cascada determinista: la etapa actual es la PRIMERA cuya validación de salida
 * NO está cumplida. VALIDACION_USO se cumple también por UUS >= umbral aunque
 * nadie marque el gate (el sistema puede materializarlo con source="system").
 */
export function inferLifecycleStage(s: LifecycleSignals): InferredStage {
  if (s.projectStatus === "completed") {
    return { stage: "FINALIZADO", reasons: ["El proyecto está cerrado (status completed)."] };
  }

  const done: string[] = [];
  const at = (label: string, d: Date | null | undefined) =>
    d ? `${label} (${fmtDay(d)})` : label;

  const now = Date.now();
  const kickoffHeld = s.kickoffSessionAt && s.kickoffSessionAt.getTime() <= now ? s.kickoffSessionAt : null;
  if (!s.kickoffPublishedAt && !kickoffHeld) {
    return {
      stage: "HAND_OFF",
      reasons: ["Pendiente: publicar el kickoff al cliente."],
    };
  }
  done.push(
    s.kickoffPublishedAt
      ? at("Kickoff publicado", s.kickoffPublishedAt)
      : `${at("Kickoff realizado", kickoffHeld)} — página sin publicar`,
  );

  if (s.cycle === "short") {
    if (!s.gates.ENTREGA_REALIZADA) {
      return {
        stage: "OPERACION_CONTINUA",
        reasons: [...done, "Servicio de continuidad en operación (sale con la entrega/renovación)."],
      };
    }
    done.push(at("Entrega realizada", s.gates.ENTREGA_REALIZADA));
    return { stage: "FINALIZADO", reasons: done };
  }

  const steps: Array<{
    stage: ProjectLifecycleStage;
    gate: ProjectStageGateKey;
    doneLabel: string;
    pending: string;
  }> = [
    { stage: "EXPLORACION", gate: "ENTENDIMIENTO_CERRADO", doneLabel: "Entendimiento cerrado", pending: "Pendiente: cerrar el entendimiento del negocio (sesiones + notas confirmadas)." },
    { stage: "DIAGNOSTICO", gate: "DIAGNOSTICO_COMPARTIDO", doneLabel: "Diagnóstico compartido", pending: "Pendiente: presentar y compartir el diagnóstico con el cliente." },
    { stage: "PLANIFICACION", gate: "CRONOGRAMA_CONSENSUADO", doneLabel: "Cronograma consensuado", pending: "Pendiente: que el cliente consensúe el cronograma." },
    { stage: "CONFIGURACION_TECNICA", gate: "DEMO_APROBADA", doneLabel: "Demo aprobada", pending: "Pendiente: demo funcional aprobada por el cliente." },
    { stage: "ADOPCION", gate: "CLIENTE_OPERANDO", doneLabel: "Cliente operando", pending: "Pendiente: sesiones de adopción cumplidas y cliente operando." },
  ];

  for (const step of steps) {
    const markedAt = s.gates[step.gate];
    if (!markedAt) {
      return { stage: step.stage, reasons: [...done, step.pending] };
    }
    done.push(at(step.doneLabel, markedAt));
  }

  const uusPasses = s.uusScore != null && s.uusScore >= s.uusThreshold;
  if (!s.gates.USO_VALIDADO && !uusPasses) {
    return {
      stage: "VALIDACION_USO",
      reasons: [
        ...done,
        s.uusScore == null
          ? `Pendiente: puntaje de usabilidad (UUS) sin datos — umbral ${s.uusThreshold}.`
          : `Pendiente: UUS ${s.uusScore} por debajo del umbral ${s.uusThreshold}.`,
      ],
    };
  }
  done.push(
    s.gates.USO_VALIDADO
      ? at("Uso validado", s.gates.USO_VALIDADO)
      : `Uso validado (UUS ${s.uusScore} ≥ ${s.uusThreshold})`,
  );

  if (!s.gates.ENTREGA_REALIZADA) {
    return {
      stage: "ENTREGA",
      reasons: [...done, "Pendiente: sesión de entrega + sugerencia registrada para Ventas."],
    };
  }
  done.push(at("Entrega realizada", s.gates.ENTREGA_REALIZADA));
  return { stage: "FINALIZADO", reasons: done };
}

/** Etapa EFECTIVA = override del CSE ?? inferida (patrón healthStatusOverride). */
export function resolveLifecycleStage(
  inferred: InferredStage,
  override: ProjectLifecycleStage | null,
): { effective: ProjectLifecycleStage; source: "override" | "inferred" } {
  if (override) return { effective: override, source: "override" };
  return { effective: inferred.stage, source: "inferred" };
}

// ── Ciclo y modalidad de adopción ─────────────────────────────────────────────

/**
 * Ciclo del proyecto. La señal PRIMARIA es el tag `recurrente` (grupo modalidad) que
 * pone el HANDOFF (isRecurrent) — su presencia = ciclo corto de continuidad. Antes se
 * infería del NOMBRE del proyecto (frágil); ahora sale del análisis de ventas.
 * `Project.lifecycleCycle` (curado, raro) sigue siendo un override duro que pisa el tag.
 */
export function resolveLifecycleCycle(input: {
  lifecycleCycle: string | null;
  tags: string[];
}): LifecycleCycle {
  if (input.lifecycleCycle === "short" || input.lifecycleCycle === "full") {
    return input.lifecycleCycle;
  }
  return input.tags.includes(RECURRENTE_TAG) ? "short" : "full";
}

export type AdoptionMode = "directa" | "por_pilotos";

/** Umbrales v1 de "cuenta grande" (adopción por pilotos), desde el snapshot Partner. */
const PILOT_SEATS_THRESHOLD = 25;
const PILOT_MARKETING_CONTACTS_THRESHOLD = 10_000;

/**
 * Modalidad de adopción SUGERIDA por el tamaño de la cuenta (el CSE confirma —
 * Project.adoptionMode). null = sin datos para sugerir.
 */
export function suggestAdoptionMode(input: {
  seatsTotal: number | null;
  marketingContactsLimit: number | null;
}): AdoptionMode | null {
  if (input.seatsTotal == null && input.marketingContactsLimit == null) return null;
  const big =
    (input.seatsTotal ?? 0) >= PILOT_SEATS_THRESHOLD ||
    (input.marketingContactsLimit ?? 0) >= PILOT_MARKETING_CONTACTS_THRESHOLD;
  return big ? "por_pilotos" : "directa";
}

/** Posición 1-based de la etapa en su ciclo (para el chip "Etapa 3/8"). */
export function stagePosition(
  stage: ProjectLifecycleStage,
  cycle: LifecycleCycle,
): { index: number; total: number } {
  const order = cycle === "short" ? SHORT_CYCLE_ORDER : FULL_CYCLE_ORDER;
  const i = order.indexOf(stage);
  // Etapa fuera del ciclo (p.ej. override a OPERACION_CONTINUA en ciclo full):
  // caer al rango global para no mentir la posición.
  if (i < 0) return { index: Math.min(STAGE_RANK[stage] + 1, order.length), total: order.length };
  return { index: i + 1, total: order.length };
}
