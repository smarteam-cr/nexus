/**
 * components/landing/configs/planificacion.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Planificación" — el documento que el cliente APRUEBA
 * antes de habilitar el CRM: procesos rediseñados + arquitectura base + etapas del
 * ciclo de vida + rutinas de adopción (+ despliegue por olas cuando el equipo lo
 * amerita). Documento INTERNO de trabajo (paleta `stl-internal`): se presenta y se
 * discute con el cliente en sesión, pero no tiene superficie externa propia.
 *
 * KEYS: las 4 legacy se conservan (`arquitectura_solucion`, `roadmap`,
 * `definicion_procesos`, `metricas_exito` — el markdown viejo se ve vía `__legacyMd`)
 * y se suman hero, `ciclo_vida_crm`, `rutinas_adopcion`, `plan_despliegue` y `cierre`.
 *
 * `plan_despliegue` es CONDICIONAL por diseño: el agente la deja VACÍA cuando la
 * adopción es directa (equipo chico) — vacía → blank → el modo lectura la omite solo.
 * El motor ya hace el trabajo condicional; no hace falta lógica.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  PROCESS_MAPPING_SCHEMA,
  PROCESS_MAPPING_EMPTY,
  ROI_SCHEMA,
  ROI_EMPTY,
  makeDiagramArchitectureDef,
} from "./shared-sections.defs";
import { PLANIFICACION_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
import { heroTitleBrief } from "@/lib/landing/hero-title";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;

const proseSchema = {
  type: "object",
  properties: {
    intro: str,
    items: { type: "array", items: { type: "object", properties: { title: str, detail: str }, required: ["title"] } },
  },
  required: ["items"],
} as const;
const proseEmpty = { intro: "", items: [] };

export const PLANIFICACION_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "planificacion",
    label: "Plan de implementación",
    eyebrow: "Planificación",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "planificacion_hero",
    agentGenerated: true,
    empty: { titulo: "", headline: "", subhead: "", tags: [] },
    agentHint: "Qué se construye + la decisión de arquitectura clave + la modalidad de adopción usada.",
    brief:
      heroTitleBrief("Plan de implementación") +
      "Portada del plan. `headline`: QUÉ se construye, en una línea de negocio ('Un solo pipeline de ventas con seguimiento automático'). " +
      "`subhead`: 1-2 frases con la decisión de arquitectura más importante Y la modalidad de adopción que este plan asume (directa o por pilotos) — declarada para que el CSE la corrija si no es la acordada. " +
      "`tags`: 2-5 chips de los frentes del plan ('Pipeline', 'Ciclo de vida', 'Adopción').",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
  },
  makeDiagramArchitectureDef({
    key: "arquitectura_solucion",
    label: "Arquitectura de la solución",
    eyebrow: "Sistemas y conexiones",
    agentGenerated: true,
  }),
  {
    key: "roadmap",
    label: "Hoja de ruta",
    eyebrow: "En qué orden",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Fases CONCEPTUALES ordenadas por dependencia. SIN fechas ni semanas.",
    brief:
      "Las fases del trabajo, ordenadas por DEPENDENCIA — qué desbloquea qué. `items` (3-6): `title` = '1. Fundaciones de datos', '2. Pipeline y propiedades'…; `detail` = UNA línea con el entregable y de qué fase depende. " +
      "REGLA DURA: SIN fechas, semanas ni duraciones — el calendario vive en el Cronograma, que es otra pieza. Este roadmap dice el ORDEN y el porqué del orden.",
    schema: asSchema(proseSchema),
  },
  {
    key: "definicion_procesos",
    label: "Procesos rediseñados",
    eyebrow: "Cómo va a operar",
    theme: "light",
    sectionType: "process_mapping",
    agentGenerated: true,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "Los procesos del cliente como van a operar, anclados a los diagramas reales (la fricción marcada ⚠ → el comoEsHoy).",
    brief:
      "El rediseño, proceso por proceso. `procesos`: por cada proceso del cliente que el proyecto toca — `nombre` en lenguaje del cliente; `comoEsHoy` = la operación REAL según sus diagramas mapeados (usá la fricción marcada ⚠ — no la suavices); `comoSera` = cómo opera con el CRM configurado, concreto y dentro del alcance; `sistemas` = herramientas de hoy → de mañana. " +
      "Partí de los procesos MAPEADOS del cliente: si un proceso no está mapeado ni mencionado, no lo inventes.",
    schema: asSchema(PROCESS_MAPPING_SCHEMA),
  },
  {
    key: "ciclo_vida_crm",
    label: "Etapas del ciclo de vida",
    eyebrow: "Del lead al cliente",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Una etapa por item: criterio de entrada/salida + quién o qué la mueve. Partir de las etapas REALES del portal.",
    brief:
      "Las etapas del ciclo de vida del CRM del CLIENTE (suscriptor → lead → MQL → … → cliente), como van a quedar definidas. `intro`: de dónde parte ('Hoy tu portal usa N etapas; proponemos M'). " +
      "`items`: UNA por etapa — `title` = la etapa; `detail` = UNA línea con el criterio de entrada/salida y quién o qué workflow la mueve ('Pasa a MQL cuando descarga una guía; lo mueve el workflow de scoring'). " +
      "REGLA: partí de las etapas REALES que el portal usa hoy (vienen en el contexto si hay cuenta conectada) y proponé SOLO cambios justificados por el rediseño de procesos. No renombres por gusto.",
    schema: asSchema(proseSchema),
  },
  {
    key: "rutinas_adopcion",
    label: "Rutinas de adopción",
    eyebrow: "Quién, con qué cadencia",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Una rutina por item: quién + cadencia + qué mira. La modalidad (directa/pilotos) se declara en la intro.",
    brief:
      "Las rutinas que hacen que el CRM se USE — sin esto, la configuración es un mueble. `intro`: 1 frase que declara la modalidad de adopción del plan (directa o por pilotos) y por qué. " +
      "`items` (3-6): `title` = la rutina ('Revisión semanal de pipeline'); `detail` = UNA línea con QUIÉN la hace + CADENCIA + QUÉ mira ('Gerente comercial, lunes: negocios sin actividad hace 7 días y etapas estancadas'). " +
      "Rutinas para los roles que el proyecto involucra — no inventes cargos que la fuente no menciona.",
    schema: asSchema(proseSchema),
  },
  {
    key: "plan_despliegue",
    label: "Plan de despliegue por olas",
    eyebrow: "Piloto escalonado",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "SOLO si la adopción es por pilotos. Adopción directa → dejala VACÍA (vacía = no se muestra).",
    brief:
      "SOLO para adopción POR PILOTOS (equipos grandes). Si la modalidad es DIRECTA, dejá `items` VACÍO — una sección vacía no se muestra, y eso es lo correcto. " +
      "`intro`: el criterio de la ola inicial. `items`: una OLA por item — `title` = 'Ola 1 — Equipo comercial de CR'; `detail` = UNA línea con quiénes entran + qué módulos usan + el indicador de éxito para pasar a la siguiente ola ('5 vendedores, pipeline + tareas; pasan cuando el 80% registra su actividad sin recordatorios').",
    schema: asSchema(proseSchema),
  },
  {
    key: "metricas_exito",
    label: "Métricas de éxito",
    eyebrow: "Cómo sabremos que funcionó",
    theme: "dark",
    sectionType: "roi",
    agentGenerated: true,
    empty: ROI_EMPTY,
    agentHint: "Hasta 4 métricas medibles ligadas a cerrar los gaps del diagnóstico. Como propuesta si no están acordadas.",
    brief:
      "Hasta 4 métricas MEDIBLES que conectan el plan con los gaps del diagnóstico. `value` = el objetivo ('100%', '-30%', '48h'); `label` = qué mide y desde dónde ('Negocios con actividad registrada — hoy se pierde el historial'). " +
      "Si el cliente no las acordó todavía, escribilas como propuesta (el CSE las ajusta en la sesión). Nada que no se pueda medir en el CRM.",
    schema: asSchema(ROI_SCHEMA),
  },
  {
    key: "cierre",
    label: "Aprobación",
    eyebrow: "Aprobación",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true,
    sectionType: "planificacion_cta",
    agentGenerated: false, // CURADA: la escribe el equipo
    empty: PLANIFICACION_CIERRE_DEFAULT,
    agentHint: "",
    brief:
      "Cierre curado: el plan se aprueba con el cliente antes de habilitar el CRM. Botón opcional a la sesión de aprobación o al documento firmado.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del canvas Planificación para el agente tipado. */
export const PLANIFICACION_TEMPLATE: BcTemplateDef = {
  id: "planificacion_v1",
  caseLabel: "Planificación",
  // diagram + process_mapping + 4 prosas: denso. El generador aborta sin persistir si
  // se queda corto de tokens.
  maxTokens: 16000,
  brandVoice: false, // documento de TRABAJO interno (se discute con el cliente en sesión)
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor senior de Smarteam que escribe el PLAN DE IMPLEMENTACIÓN de un CRM: el documento que el cliente APRUEBA antes de que se habilite nada. Define qué se construye (arquitectura, pipelines, ciclo de vida), cómo van a operar los procesos rediseñados, y cómo se adopta (rutinas, y despliegue por olas si el equipo es grande).\n\n" +
    "TU MÉTODO: partí del DIAGNÓSTICO (qué explica los resultados actuales y qué brecha se cierra primero) y de los PROCESOS REALES mapeados. Cada decisión del plan tiene que poder rastrearse a algo del diagnóstico o del alcance — un plan que no ataca las causas diagnosticadas es un plan genérico, y el cliente lo nota.\n\n" +
    "LA MODALIDAD DE ADOPCIÓN gobierna dos secciones: la recibís en el contexto (directa o por pilotos, con su porqué). Con adopción DIRECTA, el plan de despliegue por olas queda VACÍO — vacío es correcto, es una sección que no aplica. Con PILOTOS, definí las olas con equipo inicial, módulos e indicador de éxito para avanzar.\n\n" +
    "EL CICLO DE VIDA: partí de las etapas REALES que el portal del cliente usa hoy (vienen en el contexto si hay cuenta conectada). Proponé SOLO los cambios que el rediseño de procesos justifica, con el criterio de movimiento explícito por etapa. Renombrar etapas sin motivo es churn que el equipo del cliente paga después.\n\n" +
    "REGLA DURA DE FECHAS: la hoja de ruta es CONCEPTUAL — orden y dependencias, SIN fechas, semanas ni duraciones. El calendario vive en el Cronograma, que es otra pieza y ya existe.\n\n" +
    "LO INTERNO ES INSUMO, NO CONTENIDO: del handoff te llegan secciones que Smarteam escribió para adentro — riesgos y banderas, la motivación real de la compra, los acuerdos y promesas de la venta, y el estado en vuelo. Las usás para NO planificar contra ellas (no prometas lo que ya se sabe que va a trabarse, no ignores lo que se prometió). PROHIBIDO citarlas, parafrasearlas o dejarlas asomar: este documento se proyecta en pantalla frente al cliente y se exporta a PDF entero. Un riesgo del tipo «el sponsor no responde» o una promesa de la venta escritos acá se leen como que Smarteam habla del cliente a sus espaldas.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN: NUNCA inventes sistemas, integraciones, personas ni procesos. Lo no confirmado va con `⚠️ Por definir` (y `pending: 'si'` donde el schema lo tenga). Si el contexto es delgado, el plan sale más corto — corto y cierto gana a largo e inventado.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape (su `schema` y su guía) — NO es prosa libre. Los `detail` van en UNA línea. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: PLANIFICACION_SECTION_DEFS,
};

/** Lookup key → def. */
export const PLANIFICACION_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  PLANIFICACION_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST del Handoff para el agente de planificación. AMPLIA a propósito: el plan
 * necesita ver el alcance, los riesgos y los acuerdos para no planificar contra ellos.
 *
 * ⚠ CUATRO DE ESTAS SON INTERNAS y el documento SÍ se le muestra al cliente (se proyecta
 * en sesión y se exporta a PDF completo): `riesgos_banderas`, `motivacion_decision`,
 * `acuerdos_promesas` y `estado_en_flight`. Su hermano el Diagnóstico resolvió lo mismo
 * al revés, sacándolas de la lista (allowlist RESTRICTIVA), y acá NO se hizo eso a
 * propósito: sin los riesgos ni lo prometido, el plan promete cosas que ya se sabe que se
 * van a trabar, que es el defecto que más caro sale.
 *
 * La fuga se corta en el otro extremo: `agentIntro` tiene una regla dura de "lo interno es
 * insumo, no contenido" — se usa para decidir, nunca se cita ni se parafrasea. Si algún
 * día el plan pasa a tener superficie externa propia (un link para el cliente, como el
 * requerimiento técnico), esta lista se recorta a la del Diagnóstico: una instrucción es
 * más débil que una allowlist, y contra un lector de afuera hace falta la allowlist.
 */
export const PLANIFICACION_HANDOFF_KEYS = [
  "alcance_contratado",
  "motivacion_decision",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
  "acuerdos_promesas",
  "estado_en_flight",
  "riesgos_banderas",
  "desarrollo",
] as const;
