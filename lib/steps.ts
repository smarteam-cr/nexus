// ─── Definición de pasos por etapa (compartida entre page y ServiceMap) ──────

export type StepKind = "note" | "context-only" | "audit" | "documents" | "portal" | "implementation";

export type StepType =
  | { kind: "note"; placeholder?: string }
  | { kind: "context-only" }
  | { kind: "audit" }
  | { kind: "documents" }
  | { kind: "portal" }
  | { kind: "implementation" };

export interface StepDef {
  label: string;
  shortLabel: string;
  type: StepType;
  keywords?: string[];
  preselectRole?: string;
}

export type ServiceStageSteps = Record<number, StepDef[]>;

// ─── Subetapas por tipo de servicio ──────────────────────────────────────────

export const STEPS_LOOP_MARKETING: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",                   shortLabel: "Análisis inicial",   type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Kickoff",                            shortLabel: "Kickoff",            type: { kind: "context-only" }, keywords: ["kickoff", "kick off"] },
    { label: "Entrevistas y focus groups",         shortLabel: "Entrevistas",        type: { kind: "documents" },     keywords: ["entrevista", "focus group"] },
    { label: "Entregable de diagnóstico",          shortLabel: "Entregable",         type: { kind: "context-only" },  keywords: ["diagnóstico", "entregable", "mapeo", "datos", "funnel", "informe"] },
  ],
  2: [
    { label: "Rediseño del proceso (Inbound Marketing)", shortLabel: "Proceso",      type: { kind: "note", placeholder: "Proceso de marketing rediseñado con Inbound Marketing. Incluye arquitectura base del CRM necesaria para ejecutarlo..." }, keywords: ["proceso", "inbound", "marketing"] },
    { label: "Rediseño de la rutina (Loop Marketing)",   shortLabel: "Rutina",       type: { kind: "note", placeholder: "Rutina de los ejecutivos de marketing basada en Loop Marketing. Incluye arquitectura base del CRM..." }, keywords: ["rutina", "loop"] },
    { label: "Políticas y ciclo de vida",                shortLabel: "Políticas",    type: { kind: "note", placeholder: "Definición de etapas del ciclo de vida y políticas de uso del CRM acordadas con el cliente..." }, keywords: ["políticas", "ciclo de vida"] },
    { label: "Diseño completo (entrega y aprobación)",   shortLabel: "Diseño",       type: { kind: "documents" },     keywords: ["diseño", "aprobación"] },
    { label: "Plan de piloto y escalamiento",             shortLabel: "Plan piloto", type: { kind: "note", placeholder: "Plan y cronograma de piloto y escalamiento: Champions, features habilitados, duración de olas, campaña de marketing..." }, keywords: ["plan", "piloto", "escalamiento"] },
    { label: "Habilitación de CRM",                      shortLabel: "CRM",         type: { kind: "implementation" }, keywords: ["crm", "habilitación"] },
    { label: "Entrenamiento del grupo piloto",            shortLabel: "Entrenamiento", type: { kind: "documents" },   keywords: ["entrenamiento", "onboarding", "capacitación"] },
  ],
  3: [
    { label: "Piloto",             shortLabel: "Piloto",      type: { kind: "note", placeholder: "Seguimiento del piloto: kick off, stand ups, informe de adopción semanal, ajustes de CRM y sesiones con liderazgo..." }, keywords: ["piloto", "kick off", "stand up"] },
    { label: "Escalamiento",       shortLabel: "Escalamiento", type: { kind: "note", placeholder: "Escalamiento en olas: entrenamiento por ola, kick off de ola, adopción semanal, ajustes e informe de cierre de ola..." }, keywords: ["escalamiento", "ola"] },
    { label: "Evolución continua", shortLabel: "Evolución",   type: { kind: "note", placeholder: "Evolución continua: sesiones semanales, informe semanal y mensual de rendimiento en las 3 dimensiones (ordenamiento / velocidad / efectividad)..." }, keywords: ["evolución", "rendimiento", "continua"] },
  ],
};

export const STEPS_LOOP_SALES: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",                     shortLabel: "Análisis inicial", type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Kickoff",                              shortLabel: "Kickoff",          type: { kind: "context-only" }, keywords: ["kickoff", "kick off"] },
    { label: "Entrevistas y focus groups",           shortLabel: "Entrevistas",      type: { kind: "documents" },     keywords: ["entrevista", "focus group"] },
    { label: "Entregable de diagnóstico",            shortLabel: "Entregable",       type: { kind: "context-only" },  keywords: ["diagnóstico", "entregable", "mapeo", "datos", "funnel", "informe"] },
  ],
  2: [
    { label: "Rediseño del proceso (Inbound Sales)", shortLabel: "Proceso",          type: { kind: "note", placeholder: "Proceso comercial rediseñado con Inbound Sales. Incluye arquitectura base del CRM necesaria..." }, keywords: ["proceso", "inbound", "sales"] },
    { label: "Rediseño de la rutina (Loop Sales)",   shortLabel: "Rutina",           type: { kind: "note", placeholder: "Rutina de los ejecutivos de ventas basada en Loop Sales. Incluye arquitectura base del CRM..." }, keywords: ["rutina", "loop"] },
    { label: "Políticas y ciclo de vida",            shortLabel: "Políticas",        type: { kind: "note", placeholder: "Etapas del ciclo de vida, políticas de uso del CRM, protocolos de uso y reglas del juego del equipo comercial..." }, keywords: ["políticas", "ciclo de vida", "reglas"] },
    { label: "Diseño completo (entrega y aprobación)", shortLabel: "Diseño",         type: { kind: "documents" },     keywords: ["diseño", "aprobación"] },
    { label: "Plan de piloto y escalamiento",        shortLabel: "Plan piloto",      type: { kind: "note", placeholder: "Plan de piloto con protocolos, reglas del juego, indicadores de éxito, mecanismos de feedback y plan de escalamiento en olas..." }, keywords: ["plan", "piloto", "escalamiento"] },
    { label: "Habilitación de CRM",                  shortLabel: "CRM",             type: { kind: "implementation" }, keywords: ["crm", "habilitación"] },
    { label: "Entrenamiento del grupo piloto",        shortLabel: "Entrenamiento",   type: { kind: "documents" },     keywords: ["entrenamiento", "onboarding"] },
  ],
  3: [
    { label: "Piloto",                          shortLabel: "Piloto",        type: { kind: "note", placeholder: "Piloto de ventas: kick off, stand ups, informe de adopción semanal, sesión con liderazgo y ajustes de CRM..." }, keywords: ["piloto", "kick off"] },
    { label: "Escalamiento",                    shortLabel: "Escalamiento",  type: { kind: "note", placeholder: "Escalamiento en olas (mín. 6 semanas): entrenamiento por ola, kick off, adopción semanal e informe de cierre de ola..." }, keywords: ["escalamiento", "ola"] },
    { label: "Habilitación de liderazgo",       shortLabel: "Liderazgo",     type: { kind: "note", placeholder: "Mapeo y rediseño de rutina de liderazgo, habilitación del CRM para líderes, Sales Leadership Breeze Assistant y observación semanal de desempeño..." }, keywords: ["liderazgo", "líderes"] },
    { label: "Alineación (Acelerar)",           shortLabel: "Alineación",    type: { kind: "note", placeholder: "Acelerar: mapeo de hand offs, rediseño con Smarketing, habilitación CRM interdepartamental, agente de feedback para marketing y Sales & Service Hand Off..." }, keywords: ["alineación", "acelerar", "hand off", "smarketing"] },
    { label: "Evolución continua",              shortLabel: "Evolución",     type: { kind: "note", placeholder: "Evolución continua: sesiones semanales, informe semanal y mensual de rendimiento (ordenamiento / velocidad / efectividad)..." }, keywords: ["evolución", "rendimiento"] },
  ],
};

export const STEPS_LOOP_SERVICE: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",                          shortLabel: "Análisis inicial", type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Kickoff",                                   shortLabel: "Kickoff",          type: { kind: "context-only" }, keywords: ["kickoff", "kick off"] },
    { label: "Entrevistas y focus groups",                shortLabel: "Entrevistas",      type: { kind: "documents" },     keywords: ["entrevista", "focus group"] },
    { label: "Entregable de diagnóstico",                 shortLabel: "Entregable",       type: { kind: "context-only" },  keywords: ["diagnóstico", "entregable", "mapeo", "datos", "funnel", "informe"] },
  ],
  2: [
    { label: "Rediseño del proceso (Inbound Service)", shortLabel: "Proceso",          type: { kind: "note", placeholder: "Proceso de servicio al cliente rediseñado con Inbound Service. Incluye arquitectura base del CRM..." }, keywords: ["proceso", "inbound", "service"] },
    { label: "Rediseño de la rutina (Loop Service)",   shortLabel: "Rutina",           type: { kind: "note", placeholder: "Rutina de los ejecutivos de servicio basada en Loop Service. Incluye arquitectura base del CRM..." }, keywords: ["rutina", "loop"] },
    { label: "Políticas y ciclo de vida",              shortLabel: "Políticas",        type: { kind: "note", placeholder: "Etapas del ciclo de vida (incluye Service Qualified Lead si aplica), políticas de uso del CRM, SLAs y reglas del juego..." }, keywords: ["políticas", "ciclo de vida", "sql", "service qualified"] },
    { label: "Diseño completo (entrega y aprobación)", shortLabel: "Diseño",           type: { kind: "documents" },     keywords: ["diseño", "aprobación"] },
    { label: "Plan de piloto y escalamiento",          shortLabel: "Plan piloto",      type: { kind: "note", placeholder: "Plan de piloto con protocolos, indicadores de éxito, mecanismos de feedback y plan de escalamiento en olas..." }, keywords: ["plan", "piloto", "escalamiento"] },
    { label: "Habilitación de CRM",                    shortLabel: "CRM",             type: { kind: "implementation" }, keywords: ["crm", "habilitación", "ticketing", "sla"] },
    { label: "Entrenamiento del grupo piloto",          shortLabel: "Entrenamiento",   type: { kind: "documents" },     keywords: ["entrenamiento", "onboarding"] },
  ],
  3: [
    { label: "Piloto",                          shortLabel: "Piloto",       type: { kind: "note", placeholder: "Piloto de servicio: kick off, stand ups, informe de adopción semanal, sesión con liderazgo y ajustes de CRM..." }, keywords: ["piloto", "kick off"] },
    { label: "Escalamiento",                    shortLabel: "Escalamiento", type: { kind: "note", placeholder: "Escalamiento en olas (mín. 6 semanas): entrenamiento por ola, kick off, adopción semanal e informe de cierre de ola..." }, keywords: ["escalamiento", "ola"] },
    { label: "Habilitación de liderazgo",       shortLabel: "Liderazgo",    type: { kind: "note", placeholder: "Mapeo y rediseño de rutina de liderazgo, habilitación CRM para líderes, Service Leadership Breeze Assistant y observación semanal de desempeño..." }, keywords: ["liderazgo"] },
    { label: "Alineación (Anticipar)",          shortLabel: "Alineación",   type: { kind: "note", placeholder: "Anticipar: mapeo de hand offs, rediseño con Customer Journey, habilitación CRM interdepartamental, agente de feedback y Sales & Service Hand Off..." }, keywords: ["alineación", "anticipar", "hand off", "customer journey"] },
    { label: "Evolución continua",              shortLabel: "Evolución",    type: { kind: "note", placeholder: "Evolución continua: sesiones semanales, informe semanal y mensual de rendimiento (ordenamiento / velocidad / efectividad)..." }, keywords: ["evolución", "rendimiento"] },
  ],
};

export const STEPS_PROYECTO_TEMPORAL: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",          shortLabel: "Análisis inicial", type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Entrevistas",               shortLabel: "Entrevistas",      type: { kind: "documents" },     keywords: ["entrevista"] },
    { label: "Entregable de diagnóstico", shortLabel: "Entregable",       type: { kind: "context-only" },  keywords: ["diagnóstico", "entregable", "mapeo", "informe"] },
  ],
  2: [
    { label: "Diseño de la solución",  shortLabel: "Diseño",         type: { kind: "note", placeholder: "Diseño técnico y funcional de lo que se va a construir o configurar en HubSpot..." }, keywords: ["diseño", "solución"] },
    { label: "Habilitación en CRM",    shortLabel: "CRM",            type: { kind: "implementation" }, keywords: ["crm", "habilitación"] },
    { label: "Documentación",          shortLabel: "Documentación",  type: { kind: "documents" },     keywords: ["documentación"] },
  ],
  3: [
    { label: "Entrenamiento y entrega",        shortLabel: "Entrega",          type: { kind: "documents" },   keywords: ["entrenamiento", "entrega"] },
    { label: "Acompañamiento post-entrega",    shortLabel: "Post-entrega",     type: { kind: "note", placeholder: "Registro de dudas, ajustes y feedback durante el período de acompañamiento post-entrega..." }, keywords: ["post-entrega", "acompañamiento"] },
  ],
};

export const SERVICE_STAGE_STEPS: Record<string, ServiceStageSteps> = {
  loop_marketing:    STEPS_LOOP_MARKETING,
  loop_sales:        STEPS_LOOP_SALES,
  loop_service:      STEPS_LOOP_SERVICE,
  proyecto_temporal: STEPS_PROYECTO_TEMPORAL,
};

const DEFAULT_STAGE_STEPS = STEPS_LOOP_MARKETING;

export function getStageSteps(serviceType: string | null | undefined): ServiceStageSteps {
  if (serviceType && SERVICE_STAGE_STEPS[serviceType]) {
    return SERVICE_STAGE_STEPS[serviceType];
  }
  return DEFAULT_STAGE_STEPS;
}

export const STAGE_LABELS: Record<number, string> = {
  1: "Diagnóstico",
  2: "MVP",
  3: "Adopción",
};
