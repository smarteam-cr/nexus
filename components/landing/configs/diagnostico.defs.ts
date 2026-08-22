/**
 * components/landing/configs/diagnostico.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Diagnóstico" — el INFORME PARA EL CLIENTE que explica sus
 * resultados actuales: cómo opera hoy por hub, dónde está en la escala de rendimiento,
 * qué factores explican ese nivel, qué lo separa del siguiente, y qué hacemos. Corre
 * sobre el mismo motor `LandingView` que el Kickoff.
 *
 * ES DE CARA AL CLIENTE (paleta de marca, voz de marca): se presenta en la sesión de
 * diagnóstico y se puede exportar a PDF. La publicación con link propio llega en su
 * propia tanda — hasta entonces no existe `/external/diagnostico` a propósito.
 *
 * ── LA DECISIÓN DE LAS KEYS (leer antes de tocar) ─────────────────────────────
 * Este canvas EXISTÍA con 8 secciones legacy en prosa markdown. Para que el contenido ya
 * escrito (Teamnet) siga visible, las keys nuevas REUSAN las legacy donde la semántica
 * coincide (`contexto_alcance`, `estado_actual`, `causa_raiz`, `gap_analysis`,
 * `recomendaciones` — el markdown viejo se rinde vía `__legacyMd`). Tres legacy quedan
 * como defs SOLO-LECTURA (`agentGenerated: false` y el agente nuevo no las escribe):
 *   · `estado_deseado` — absorbida por el "cómo vas a operar" de estado_actual,
 *   · `impacto_gap`   — absorbida por el panel de consecuencias de gap_analysis,
 *   · `proximos_pasos`— reemplazada por recomendaciones + cierre.
 * Con contenido viejo se ven; vacías son blank y el modo lectura las omite solo.
 *
 * LA ESCALA: la única vara es la ESCALA 1-5 canónica (Deficiente · Inicial · Funcional ·
 * Eficiente · Óptimo) que vive en la base de conocimiento. La vieja 0-4 del código NO
 * entra acá — el runner ni la lee.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  PAIN_SCHEMA,
  PAIN_EMPTY,
  WEB_DIAGNOSIS_SCHEMA,
  WEB_DIAGNOSIS_EMPTY,
  ROI_SCHEMA,
  ROI_EMPTY,
  PROCESS_MAPPING_SCHEMA,
  PROCESS_MAPPING_EMPTY,
} from "./shared-sections.defs";
import { DIAGNOSTICO_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
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

export const DIAGNOSTICO_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "diagnostico",
    label: "Diagnóstico de rendimiento",
    eyebrow: "Diagnóstico",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "hero",
    /* Se rotula con su titular, que en pantalla es lo correcto y para conversar es pésimo:
       el chip decía «kickoff Wherex». Ver `nombreParaElChat`. */
    chatLabel: "Portada",
    agentGenerated: true,
    empty: { titulo: "", headline: "", subhead: "", tags: [] },
    agentHint: "Portada del informe: el hallazgo principal en una frase + los hubs diagnosticados como chips.",
    brief:
      heroTitleBrief("Diagnóstico de rendimiento") +
      "Portada del informe. `headline`: el HALLAZGO principal en una línea, dicho al cliente ('Tu proceso comercial pierde los leads que marketing ya pagó'). No pongas 'Diagnóstico de X' — el título de la página ya lo dice. " +
      "`subhead`: 1-2 frases con el resumen honesto: dónde está hoy (nivel de la escala con su nombre) y qué es lo primero que cambia con este proyecto. " +
      "`tags`: los hubs/áreas diagnosticadas ('Ventas', 'Marketing', 'Servicio').",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
  },
  {
    key: "contexto_alcance",
    label: "Qué miramos y con qué fuentes",
    eyebrow: "Contexto y alcance",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Qué se diagnosticó, con qué fuentes y qué hubs cubre. 3-5 items.",
    brief:
      "El encuadre, para que el informe sea auditable. `intro`: 1 frase con qué se diagnosticó. `items` (3-5): cada fuente usada — `title` = la fuente ('Sesiones de exploración', 'Su portal de HubSpot', 'Sus procesos mapeados'); `detail` = UNA línea con qué aportó. Solo fuentes que de verdad se usaron.",
    schema: asSchema(proseSchema),
  },
  {
    key: "estado_actual",
    label: "Cómo operás hoy — y cómo vas a operar",
    eyebrow: "Estado actual",
    theme: "light",
    sectionType: "process_mapping",
    agentGenerated: true,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint:
      "UN proceso por hub del proyecto: cómo vende / hace marketing / entrega servicio HOY (con la fricción real) vs cómo va a operar.",
    brief:
      "El corazón del informe. `procesos`: UNO por hub del proyecto — 'Cómo vendés hoy' (sales), 'Cómo hacés marketing hoy' (marketing), 'Cómo entregás servicio hoy' (service). Por proceso: " +
      "`nombre` = en lenguaje del cliente; `comoEsHoy` = 2-4 frases con la operación REAL, incluyendo la fricción que aparece en sus procesos mapeados (los dolores marcados ⚠) — sin suavizar, pero sin burlarse; " +
      "`comoSera` = 2-3 frases de cómo opera con el sistema implementado, respaldado por el alcance contratado (nada que el proyecto no incluya); `sistemas` = las herramientas de hoy → las de mañana. " +
      "SOLO los hubs que el proyecto cubre: no diagnostiques servicio si el proyecto es de ventas.",
    schema: asSchema(PROCESS_MAPPING_SCHEMA),
  },
  {
    // SOLO-LECTURA legacy: absorbida por el `comoSera` de estado_actual. Con markdown
    // viejo se ve (__legacyMd); vacía es blank y el modo lectura la omite.
    key: "estado_deseado",
    label: "Estado deseado",
    eyebrow: "A dónde vamos",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy (los diagnósticos viejos la traen en prosa). El agente nuevo no la escribe: su contenido vive en el 'cómo vas a operar' de Estado actual.",
    schema: asSchema(proseSchema),
  },
  {
    key: "escala",
    label: "Dónde estás en la escala",
    eyebrow: "Escala de rendimiento",
    theme: "dark",
    sectionType: "roi",
    agentGenerated: true,
    empty: ROI_EMPTY,
    agentHint: "Nivel 1-5 global y por área + el nivel alcanzable con este proyecto. Máx 6 métricas.",
    brief:
      "La ubicación en la ESCALA 1-5 (Deficiente · Inicial · Funcional · Eficiente · Óptimo — la única escala válida; nunca uses la 0-4). `metrics` (máx 6): " +
      "`value` = 'N/5' y `label` = el área + el nombre del nivel ('Ventas — Inicial'). Incluí el nivel GENERAL primero, después por área diagnosticada, y cerrá con `value` = el nivel alcanzable y `label` = 'Alcanzable con este proyecto — <nombre>'. " +
      "El número sale de aplicar los criterios de la escala a la evidencia — si la evidencia no alcanza para ubicar un área, no la puntúes.",
    schema: asSchema(ROI_SCHEMA),
  },
  {
    key: "causa_raiz",
    label: "Qué explica estos resultados",
    eyebrow: "Causas, no síntomas",
    theme: "light",
    sectionType: "pain",
    agentGenerated: true,
    empty: PAIN_EMPTY,
    agentHint: "Los factores DETRÁS del número, cada uno trazable a una fuente.",
    brief:
      "Los factores que explican el nivel actual — causas, no síntomas ('Nadie es dueño del dato' explica; 'el CRM está desordenado' describe). Cada `item`: `title` = el factor en 5-10 palabras; `detail` = UNA línea con cómo se manifiesta Y de dónde salió ('En la sesión con gerencia: cada vendedor registra distinto, y el reporte mensual se arma a mano'). " +
      "Trazable o no va: un factor que ninguna fuente respalda es una opinión.",
    schema: asSchema(PAIN_SCHEMA),
  },
  {
    key: "gap_analysis",
    label: "Qué te separa del siguiente nivel",
    eyebrow: "La brecha",
    theme: "light",
    sectionType: "web_diagnosis",
    agentGenerated: true,
    empty: WEB_DIAGNOSIS_EMPTY,
    agentHint: "Los retos (izq) + qué cuesta hoy la brecha (panel oscuro) + cuál se cierra primero.",
    /* Rótulos de las dos columnas (antes se colaban por `plataforma`, ver exploracion.defs.ts). */
    chips: { retos: "Qué falta", panel: "Qué te cuesta hoy" },
    brief:
      "La brecha entre el nivel actual y el siguiente — concreta, no aspiracional. `intro`: 1 frase de encuadre. " +
      "`retos`: qué falta para subir de nivel — 4 a 6, cada uno `title` corto + `detail` de máximo 20 PALABRAS. " +
      "`porQueBullets`: el IMPACTO de la brecha en resultados — 3 a 5, tiempo perdido, ventas caídas, clientes sin respuesta — con números SOLO si alguna fuente los trae, `detail` de máximo 20 PALABRAS. " +
      "`objetivo`: cuál brecha se cierra primero y por qué esa ('Primero la captura del lead: todo lo demás depende de que el dato exista').",
    schema: asSchema(WEB_DIAGNOSIS_SCHEMA),
  },
  {
    // SOLO-LECTURA legacy: absorbida por `porQueBullets` de gap_analysis.
    key: "impacto_gap",
    label: "Impacto del gap",
    eyebrow: "Qué cuesta",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. El agente nuevo no la escribe: el impacto vive en el panel oscuro de 'Qué te separa del siguiente nivel'.",
    schema: asSchema(proseSchema),
  },
  {
    key: "recomendaciones",
    label: "Qué hacemos con esto",
    eyebrow: "Recomendaciones",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Priorizadas, cada una conectada a una causa; quick wins marcados en el title.",
    brief:
      "Las recomendaciones EN ORDEN de prioridad, cada una conectada a una causa de arriba (una recomendación que no ataca ninguna causa, sobra). `items` (3-6): `title` = la acción en 5-10 palabras — antepon 'Quick win: ' a las que dan resultado en semanas; `detail` = UNA línea con qué causa ataca y qué destraba. " +
      "Dentro del alcance del proyecto: no recomiendes lo que el proyecto no incluye (eso va como conversación de siguiente etapa, no acá).",
    schema: asSchema(proseSchema),
  },
  {
    // SOLO-LECTURA legacy: reemplazada por recomendaciones + cierre.
    key: "proximos_pasos",
    label: "Próximos pasos",
    eyebrow: "Siguiente",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. El agente nuevo no la escribe: el siguiente paso vive en el cierre.",
    schema: asSchema(proseSchema),
  },
  {
    key: "cierre",
    label: "El siguiente paso",
    eyebrow: "El siguiente paso",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true, // banda oscura propia que además lee `data` (CTA), como el kickoff
    sectionType: "kickoff_cta",
    agentGenerated: false, // CURADA: la escribe el equipo, el agente no la toca
    empty: DIAGNOSTICO_CIERRE_DEFAULT,
    agentHint: "",
    brief:
      "Cierre curado por el equipo: el siguiente paso con el cliente (presentar el plan, agendar la sesión de planificación) + botón opcional. El agente no la toca.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del canvas Diagnóstico para el agente tipado (`generateSectionsForTemplate`). */
export const DIAGNOSTICO_TEMPLATE: BcTemplateDef = {
  id: "diagnostico_v1",
  caseLabel: "Diagnóstico",
  // process_mapping + web_diagnosis + roi son secciones densas; el generador ABORTA sin
  // persistir si el stop_reason es max_tokens — mejor sobrar que abortar.
  maxTokens: 16000,
  brandVoice: true, // informe DE CARA AL CLIENTE: voz de marca, tuteo
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor senior de Smarteam que escribe el DIAGNÓSTICO DE RENDIMIENTO de un cliente: el informe que el cliente VA A LEER para entender sus resultados actuales y por qué son los que son. Se presenta en una sesión y queda en manos del cliente — cada frase tiene que sostenerse sola frente a su gerencia.\n\n" +
    "TU MÉTODO: partí de la evidencia (exploración, procesos mapeados, su portal, el handoff), ubicá al cliente en la ESCALA DE RENDIMIENTO, y explicá el número con causas — no con síntomas. El cliente no compra un número: compra entender POR QUÉ está donde está y qué lo mueve.\n\n" +
    "LA ESCALA (única vara): la Escala de Rendimiento 1-5 de Smarteam — 1 Deficiente · 2 Inicial · 3 Funcional · 4 Eficiente · 5 Óptimo — cuyos criterios recibís en el contexto. NUNCA uses la escala 0-4 vieja ni sus nombres (Básico/Estructurado/Optimizado/Inteligente). Al proyectar el nivel alcanzable, apuntá al SIGUIENTE nivel, no dos arriba: proponer soluciones de nivel 5 a un cliente en nivel 2 lo abruma y no lo mueve.\n\n" +
    "REGISTRO CLIENTE-FACING: tuteo, claro, sin jerga interna de Smarteam ('handoff', 'CSE', 'exploración' no existen para el cliente — decí 'las sesiones que tuvimos', 'el análisis de tu portal'). Honesto sin ser cruel: la fricción se nombra con precisión, no con burla ni eufemismo.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN (dura): NUNCA inventes datos, cifras, procesos ni personas del cliente. Todo lo que afirmes tiene que rastrearse a una fuente del contexto. Lo que la exploración marcó como 'sin verificar' NO se afirma como hecho en este informe — o se omite, o se presenta como pregunta abierta. Un número inventado en un informe que el cliente guarda es el peor error posible.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape (su `schema` y su guía) — NO es prosa libre. Los `detail` van en UNA línea. Español, tuteo. Si una sección no tiene respaldo en las fuentes, dejá sus arrays vacíos — vacío es correcto, inventado no.",
  sections: DIAGNOSTICO_SECTION_DEFS,
};

/** Lookup key → def (seed, agente, SectionTools). */
export const DIAGNOSTICO_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  DIAGNOSTICO_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST de secciones del Handoff que ve el agente del diagnóstico. RESTRICTIVA como
 * la del kickoff — el informe es de cara al cliente, así que las secciones internas
 * (riesgos, motivación de la decisión, acuerdos, estado en vuelo) NO entran: un dato de
 * esas secciones citado en el informe sería una filtración.
 */
export const DIAGNOSTICO_HANDOFF_KEYS = [
  "alcance_contratado",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
  "desarrollo",
] as const;
