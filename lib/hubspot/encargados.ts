/**
 * lib/hubspot/encargados.ts — los dos encargados de una cuenta en HubSpot, como propiedades (2026-10-09). PURO.
 *
 * «CSE Encargado» (`cse_encargado`) es el CSE de la cuenta; «CSL Encargado» (`csl_encargado`), la CSL. Hasta el
 * 2026-10-09 `csl_encargado` guardaba al CSE: el espejo lee primero `cse_encargado` y, si está vacío,
 * `csl_encargado` (`encargadoDelProyecto`). Lo que escribe en HubSpot vive en lib/hubspot/encargados-de-la-cuenta.ts.
 */
export const PROP_CSE_ENCARGADO = "cse_encargado";
export const PROP_CSL_ENCARGADO = "csl_encargado";

export interface Encargados {
  /** Owner id del CSE. */
  cse: string;
  /** Owner id de la CSL; null = no se escribe (no hay CSL con usuario en HubSpot). */
  csl: string | null;
}

export function propiedadesDeEncargados(e: Encargados): Record<string, string> {
  return { [PROP_CSE_ENCARGADO]: e.cse, ...(e.csl ? { [PROP_CSL_ENCARGADO]: e.csl } : {}) };
}

/**
 * El owner que lleva el proyecto: «CSE Encargado» y, si está vacío, «CSL Encargado» (lo que había antes de la
 * migración, y lo que tienen los proyectos de Desarrollo y Sitios web, donde es el encargado técnico).
 */
export function encargadoDelProyecto(props: { cse_encargado?: string | null; csl_encargado?: string | null }): string | null {
  return (props.cse_encargado ?? "").trim() || (props.csl_encargado ?? "").trim() || null;
}
