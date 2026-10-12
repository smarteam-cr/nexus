/**
 * lib/servicios/ciclo.ts — el CICLO de un servicio recurrente. PURO y CLIENT-SAFE.
 *
 * Un ciclo es un tramo con fechas en el que un proyecto pasa por las cinco etapas del método
 * (documento de proceso de SmartLoop, sección 5). La etapa del proyecto es la etapa del ciclo abierto.
 * Las etapas son del MÉTODO, no de un servicio: cualquier servicio recurrente que se sume usa las mismas
 * y solo cambia su guía (lib/servicios/<servicio>.ts).
 */

/**
 * Los ARTEFACTOS del ciclo (2026-10-11, pedido de Elías): uno por cada etapa que produce algo. Implementación y
 * Adopción no son artefactos —son trabajo que se sigue en el cronograma—, así que su etapa la lleva el Cronograma.
 */
export const PIEZA_DIAGNOSTICO_DEL_CICLO = "cycle-diagnosis";
export const PIEZA_PLAN_DEL_CICLO = "cycle-plan";
export const PIEZA_APRENDIZAJE_DEL_CICLO = "cycle-learning";
export const PIEZAS_DEL_CICLO = [PIEZA_DIAGNOSTICO_DEL_CICLO, PIEZA_PLAN_DEL_CICLO, "timeline", PIEZA_APRENDIZAJE_DEL_CICLO] as const;

/**
 * Las piezas de un proyecto de servicio recurrente, en el orden del riel: los artefactos del ciclo y, después, los
 * insumos del diagnóstico (Cuestionarios y Exploración), que se reusan tal cual. No lleva kickoff, diagnóstico,
 * planificación ni entrega de una implementación: el ciclo los reemplaza.
 */
export const PIEZAS_DE_UN_SERVICIO_RECURRENTE = [...PIEZAS_DEL_CICLO, "questionnaires", "exploration"] as const;

/** El artefacto donde se trabaja cada etapa del ciclo. */
export const PIEZA_DE_LA_ETAPA: Record<EtapaDelCiclo, string> = {
  diagnostico: PIEZA_DIAGNOSTICO_DEL_CICLO,
  planificacion: PIEZA_PLAN_DEL_CICLO,
  implementacion: "timeline",
  adopcion: "timeline",
  aprendizaje: PIEZA_APRENDIZAJE_DEL_CICLO,
};

/** Las etapas que se trabajan en un artefacto (el Cronograma lleva dos). */
export function etapasDeLaPieza(slug: string): EtapaDelCiclo[] {
  return ETAPAS_DEL_CICLO.filter((e) => PIEZA_DE_LA_ETAPA[e] === slug);
}

export const ETAPAS_DEL_CICLO = ["diagnostico", "planificacion", "implementacion", "adopcion", "aprendizaje"] as const;
export type EtapaDelCiclo = (typeof ETAPAS_DEL_CICLO)[number];

export const ETIQUETA_DE_ETAPA: Record<EtapaDelCiclo, string> = {
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
  implementacion: "Implementación",
  adopcion: "Adopción",
  aprendizaje: "Aprendizaje",
};

export function esEtapaDelCiclo(v: unknown): v is EtapaDelCiclo {
  return typeof v === "string" && (ETAPAS_DEL_CICLO as readonly string[]).includes(v);
}

/** La etapa que sigue, o null en Aprendizaje (de ahí el ciclo se cierra, no avanza). */
export function etapaSiguiente(e: EtapaDelCiclo): EtapaDelCiclo | null {
  const i = ETAPAS_DEL_CICLO.indexOf(e);
  return i >= 0 && i < ETAPAS_DEL_CICLO.length - 1 ? ETAPAS_DEL_CICLO[i + 1] : null;
}

/**
 * La etapa del ciclo que corresponde a un rótulo de etapa de HubSpot («Implementación» → implementacion).
 * Por NOMBRE, sin tildes ni mayúsculas, como `etapaDeNexusPorNombre`: el pipeline de SmartLoop espeja el
 * método. null si no es una etapa del ciclo (Cancelado).
 */
export function etapaPorNombre(label: string | null | undefined): EtapaDelCiclo | null {
  if (!label) return null;
  const n = label.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return ETAPAS_DEL_CICLO.find((e) => e === n) ?? null;
}

export const COMPROMISOS = ["mensual", "semestral", "anual"] as const;
export type Compromiso = (typeof COMPROMISOS)[number];
export const ETIQUETA_DE_COMPROMISO: Record<Compromiso, string> = {
  mensual: "Mes a mes",
  semestral: "Seis meses",
  anual: "Un año",
};
export function esCompromiso(v: unknown): v is Compromiso {
  return typeof v === "string" && (COMPROMISOS as readonly string[]).includes(v);
}

/** Cómo se llama un ciclo en pantalla: «Ciclo 1 · Corregir y adoptar», o «Ciclo 1» sin tramo. */
export function nombreDelCiclo(c: { numero: number; nombre: string | null }): string {
  return c.nombre?.trim() ? `Ciclo ${c.numero} · ${c.nombre.trim()}` : `Ciclo ${c.numero}`;
}

/** La etapa del proyecto en una línea: «Ciclo 1 · Implementación». */
export function etapaDelProyecto(c: { numero: number; etapa: string }): string {
  return `Ciclo ${c.numero} · ${esEtapaDelCiclo(c.etapa) ? ETIQUETA_DE_ETAPA[c.etapa] : c.etapa}`;
}

// ── Casos de uso ─────────────────────────────────────────────────────────────

export const ESTADOS_DE_CASO = ["sugerido", "en_plan", "en_ciclo", "cumplido", "no_cumplido", "descartado"] as const;
export type EstadoDeCaso = (typeof ESTADOS_DE_CASO)[number];
export const ORIGENES_DE_CASO = ["escala", "pedido", "propuesta", "entrega", "manual"] as const;
export type OrigenDeCaso = (typeof ORIGENES_DE_CASO)[number];
export const ETIQUETA_DE_ORIGEN: Record<OrigenDeCaso, string> = {
  escala: "De la escala",
  pedido: "Lo pidió el cliente",
  propuesta: "De la propuesta vendida",
  entrega: "De la entrega",
  manual: "Lo agregó el CSE",
};

/** Lo que un caso de uso mueve en la escala: una dimensión de un área, hasta un nivel. */
export interface MovimientoEnLaEscala {
  area: string;
  dimension: string;
  nivel: string;
}

export function leerMueve(v: unknown): MovimientoEnLaEscala[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({ area: String(m.area ?? ""), dimension: String(m.dimension ?? ""), nivel: String(m.nivel ?? "") }))
    .filter((m) => m.dimension.trim() !== "");
}
