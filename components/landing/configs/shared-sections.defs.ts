/**
 * components/landing/configs/shared-sections.defs.ts
 *
 * Defs (server-safe) de las secciones COMPARTIDAS entre templates: arquitectura
 * tecnológica/de conexión y mapeo de procesos. Se exportan como BUILDERS porque
 * cada template las instancia con su propia key/label/brief (el renderer se
 * comparte vía `sectionType`). Schemas SOLO con hojas string (coerceToSchema
 * aplana booleans/números a "").
 */
import type { BCSectionDef } from "./business-case.defs";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

export const TECH_ARCHITECTURE_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    cadena: arrayOf({ actor: str, titulo: str, detalle: str }, ["actor", "titulo"]),
    fueraDeAlcance: strArray,
    opcionales: arrayOf({ nombre: str, detalle: str }, ["nombre"]),
  },
  required: ["cadena"],
} as const;

export const TECH_ARCHITECTURE_EMPTY = {
  intro: "",
  cadena: [],
  fueraDeAlcance: [],
  opcionales: [],
};

export function makeTechArchitectureDef(
  overrides: Pick<BCSectionDef, "key" | "label"> & Partial<BCSectionDef>,
): BCSectionDef {
  return {
    eyebrow: "Arquitectura",
    theme: "light",
    sectionType: "tech_architecture",
    schema: TECH_ARCHITECTURE_SCHEMA as unknown as Record<string, unknown>,
    empty: TECH_ARCHITECTURE_EMPTY,
    agentHint: "Cadena del flujo de datos (3-5 pasos con actor + qué pasa) + fuera de alcance + opcionales. Escueto.",
    brief:
      "Arquitectura de conexión como CADENA de 3 a 5 pasos (se presenta como cards con flechas): cada paso con `actor` (quién/qué sistema: 'Visitante', 'Sitio', 'HubSpot CRM', 'Equipo comercial', 'ERP'…), `titulo` de 3 a 6 palabras (qué pasa: 'Lead registrado al instante') y `detalle` de UNA línea corta. `intro`: máximo 2 frases con la idea central. `fueraDeAlcance`: qué NO incluye esta fase (frases cortas). `opcionales`: integraciones a futuro. Fuente: SOLO sistemas mencionados en el contexto — no inventes integraciones.",
    ...overrides,
  };
}

// ── Casos de uso del catálogo (sección DETERMINÍSTICA) ──────────────────────
// `agentGenerated:false`: el agente la SALTEA — la escribe el generate con los
// seleccionados del checklist (títulos/precios EXACTOS del catálogo; cero
// alucinación). Vacía → blank → invisible interna (read) y externamente.
export const USE_CASES_DEF: BCSectionDef = {
  key: "casos_de_uso",
  canvasLabel: "Casos de uso",
  label: "Casos de uso incluidos",
  eyebrow: "Casos de uso",
  theme: "light",
  sectionType: "use_cases",
  agentGenerated: false,
  empty: { items: [] },
  schema: {
    type: "object",
    properties: { items: arrayOf({ title: str, detail: str, price: str }, ["title"]) },
    required: ["items"],
  },
  agentHint: "(No la genera el agente: se llena con el checklist del catálogo.)",
  brief:
    "Casos de uso del catálogo seleccionados por el vendedor. Esta sección NO la escribe el agente: se llena automáticamente con los casos marcados en el checklist (con sus precios exactos) y se puede retocar a mano.",
};

export const PROCESS_MAPPING_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    procesos: arrayOf({ nombre: str, comoEsHoy: str, comoSera: str, sistemas: str }, ["nombre"]),
  },
  required: ["procesos"],
} as const;

export const PROCESS_MAPPING_EMPTY = { intro: "", procesos: [] };

// ── Schemas compartidos por sectionType (evitan que un nuevo template re-declare
// el mismo shape a mano) ─────────────────────────────────────────────────────
// NOTA: business-case.defs.ts y website.defs.ts todavía inlinean sus propias copias
// de `web_diagnosis`/`roi`/`pain` (no se tocan acá para no arriesgar código ya
// shippeado) — estos exports son para que templates NUEVOS (ej. Desarrollo) reusen
// en vez de agregar una tercera copia hand-rolled.
export const WEB_DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    retos: arrayOf({ title: str, detail: str }, ["title"]),
    plataforma: str,
    porQueBullets: arrayOf({ title: str, detail: str }, ["title"]),
    objetivo: str,
  },
  required: ["retos", "porQueBullets", "objetivo"],
} as const;
export const WEB_DIAGNOSIS_EMPTY = { intro: "", retos: [], plataforma: "", porQueBullets: [], objetivo: "" };

export const ROI_SCHEMA = {
  type: "object",
  properties: { metrics: arrayOf({ value: str, label: str }, ["value", "label"]) },
  required: ["metrics"],
} as const;
export const ROI_EMPTY = { metrics: [] };

export const PAIN_SCHEMA = {
  type: "object",
  properties: { items: arrayOf({ title: str, detail: str }, ["title", "detail"]) },
  required: ["items"],
} as const;
export const PAIN_EMPTY = { items: [] };

export function makeProcessMappingDef(
  overrides: Pick<BCSectionDef, "key" | "label"> & Partial<BCSectionDef>,
): BCSectionDef {
  return {
    eyebrow: "Procesos",
    theme: "soft",
    sectionType: "process_mapping",
    schema: PROCESS_MAPPING_SCHEMA as unknown as Record<string, unknown>,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "Procesos del cliente que cambian: cómo son hoy vs cómo quedarán, y con qué sistemas.",
    brief:
      "Mapeo de procesos (opcional): los procesos operativos del cliente que cambian con la implementación (ventas, seguimiento, cobranza, onboarding…). Por proceso: `comoEsHoy` (con la fricción real mencionada), `comoSera` (qué queda automatizado/conectado) y `sistemas` involucrados. Fuente: SOLO procesos descritos con sustancia en el contexto.",
    ...overrides,
  };
}
