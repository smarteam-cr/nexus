/**
 * lib/servicios/ciclo.ts — el CICLO de un servicio recurrente. PURO y CLIENT-SAFE.
 *
 * Las cinco etapas del método (documento de proceso de SmartLoop, sección 5). Nexus muestra la etapa que trae HubSpot y
 * no cuenta vueltas (Elías, 31 oct). Las etapas son del MÉTODO, no de un servicio: cualquier servicio recurrente que se sume usa las mismas
 * y solo cambia su guía (lib/servicios/<servicio>.ts).
 */

/**
 * El artefacto que SUELE servir en cada etapa (Elías, 31 oct: SmartLoop se lleva como cualquier proyecto). Es solo una
 * sugerencia del «Qué sigue»: no se exige, no se crea sola y no se cuenta como pendiente. `tipo` es un tipo del catálogo de
 * artefactos (lib/artefactos/tipos.ts). `nuevo` = se crea en «Nuevo artefacto», porque no es el documento de siempre; con
 * `plantilla`, ya marcada ahí.
 */
export const ARTEFACTO_DE_LA_ETAPA: Record<EtapaDelCiclo, { tipo: string; texto: string; nuevo?: true; plantilla?: string }> = {
  diagnostico: { tipo: "diagnosis", texto: "un diagnóstico" },
  planificacion: { tipo: "planning", texto: "una planificación" },
  implementacion: { tipo: "timeline", texto: "el cronograma" },
  adopcion: { tipo: "adoption-plan", texto: "un plan de adopción", nuevo: true },
  aprendizaje: { tipo: "delivery", texto: "una entrega de aprendizaje", nuevo: true, plantilla: "aprendizaje" },
};

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
