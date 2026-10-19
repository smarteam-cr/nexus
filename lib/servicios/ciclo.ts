/**
 * lib/servicios/ciclo.ts — el CICLO de un servicio recurrente. PURO y CLIENT-SAFE.
 *
 * Un ciclo es un tramo con fechas en el que un proyecto pasa por las cinco etapas del método
 * (documento de proceso de SmartLoop, sección 5). La etapa del proyecto es la etapa del ciclo abierto.
 * Las etapas son del MÉTODO, no de un servicio: cualquier servicio recurrente que se sume usa las mismas
 * y solo cambia su guía (lib/servicios/<servicio>.ts).
 */

/**
 * Los ARTEFACTOS del ciclo (2026-10-12, pedido de Elías): los mismos documentos de una implementación —Exploración,
 * Diagnóstico, Planificación, Integraciones y Entrega—, más Adopción y Aprendizaje, que son propios del ciclo y no
 * viven en un canvas. El Cronograma va afuera del ciclo, junto al Resumen: se abre todos los días. Los Cuestionarios
 * van con la Exploración, como en una implementación (aparecen cuando el proyecto tiene la Exploración).
 *
 * ⚠ Reemplaza a «Diagnóstico del ciclo» y «Plan del ciclo» (2026-10-11): el plan responde al Diagnóstico y a la
 * Planificación, y los casos de uso son una sección de la cuenta.
 */
export const PIEZA_ADOPCION_DEL_CICLO = "cycle-adoption";
export const PIEZA_APRENDIZAJE_DEL_CICLO = "cycle-learning";
export const PIEZAS_DEL_CICLO = [
  "questionnaires",
  "exploration",
  "diagnosis",
  "planning",
  "tech-requirements",
  PIEZA_ADOPCION_DEL_CICLO,
  PIEZA_APRENDIZAJE_DEL_CICLO,
  "delivery",
] as const;

/** Los artefactos propios del ciclo: no viven en un canvas y su estado sale del ciclo. */
export const PIEZAS_PROPIAS_DEL_CICLO = [PIEZA_ADOPCION_DEL_CICLO, PIEZA_APRENDIZAJE_DEL_CICLO] as const;

/** Las piezas de un proyecto de servicio recurrente, en el orden del riel (el Resumen va aparte, arriba). */
export const PIEZAS_DE_UN_SERVICIO_RECURRENTE = ["timeline", ...PIEZAS_DEL_CICLO] as const;

/** El artefacto donde se trabaja cada etapa del ciclo. */
export const PIEZA_DE_LA_ETAPA: Record<EtapaDelCiclo, string> = {
  diagnostico: "diagnosis",
  planificacion: "planning",
  implementacion: "timeline",
  adopcion: PIEZA_ADOPCION_DEL_CICLO,
  aprendizaje: PIEZA_APRENDIZAJE_DEL_CICLO,
};

/** Las etapas que se trabajan en un artefacto. */
export function etapasDeLaPieza(slug: string): EtapaDelCiclo[] {
  return ETAPAS_DEL_CICLO.filter((e) => PIEZA_DE_LA_ETAPA[e] === slug);
}

/**
 * La etapa que muestran los documentos del proyecto (2026-10-12): con el Diagnóstico escrito, el ciclo ya está en
 * Planificación; con la Planificación escrita, en Implementación. null = los documentos no dicen más que eso.
 * Es una SUGERENCIA: la etapa la cambia una persona, hacia adelante o hacia atrás.
 */
export function etapaQueMuestranLasPiezas(conContenido: ReadonlySet<string> | readonly string[]): EtapaDelCiclo | null {
  const tiene = (s: string) => (conContenido instanceof Set ? conContenido.has(s) : (conContenido as readonly string[]).includes(s));
  if (tiene("planning")) return "implementacion";
  if (tiene("diagnosis")) return "planificacion";
  return null;
}

/** ¿`a` va después de `b` en el ciclo? */
export function etapaPosterior(a: EtapaDelCiclo, b: EtapaDelCiclo): boolean {
  return ETAPAS_DEL_CICLO.indexOf(a) > ETAPAS_DEL_CICLO.indexOf(b);
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

/**
 * La etapa que muestra el ciclo (el riel, el «Qué sigue»): en un proyecto que existe en HubSpot, la de allá, por
 * nombre; si no (la prueba) o si HubSpot dice una etapa que no es del ciclo, la guardada en el ciclo abierto; sin ciclo
 * abierto, Diagnóstico. Antes, sin ciclo abierto, era siempre Diagnóstico aunque HubSpot dijera otra («PLAN DE
 * CONTINUIDAD | HONDA FACO» en Implementación; auditoría del 19 oct, prueba 30).
 */
export function etapaQueMuestraElCiclo(o: {
  enHubspot: boolean;
  rotuloDeHubspot: string | null | undefined;
  /** La etapa guardada en el ciclo abierto; null sin ciclo abierto. */
  etapaGuardada: string | null;
}): EtapaDelCiclo {
  const deHubspot = o.enHubspot ? etapaPorNombre(o.rotuloDeHubspot) : null;
  if (deHubspot) return deHubspot;
  return esEtapaDelCiclo(o.etapaGuardada) ? o.etapaGuardada : "diagnostico";
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
