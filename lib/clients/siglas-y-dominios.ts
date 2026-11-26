/**
 * lib/clients/siglas-y-dominios.ts — cómo queda escrita una sigla o un dominio de una ficha. Lo usan el PATCH de la ficha
 * (app/api/clients/[id]/route.ts) y el mapa de la precarga de interlocutores (scripts/lib/interlocutores-precarga.ts), para
 * que «sas» o «@StratosphereCorp.com» no se escriban tal cual por un camino y limpios por el otro (revisión del 26 nov).
 * Sin imports: lo puede usar la pantalla.
 */

/** La sigla en mayúsculas y sin espacios; null si queda de menos de 2 letras (una letra matchearía cualquier título). */
export function normalizarSigla(s: string): string | null {
  const x = s.trim().toUpperCase().replace(/\s+/g, "");
  return x.length >= 2 ? x : null;
}

/** El dominio en minúsculas, sin espacios alrededor y sin «@» adelante (lo que guarda la ficha). */
export function limpiarDominio(s: string): string {
  return s.trim().toLowerCase().replace(/^@/, "");
}

/** Como `limpiarDominio`, y además tiene que ser un dominio («empresa.com»); null si no lo es. */
export function normalizarDominio(s: string): string | null {
  const x = limpiarDominio(s);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x) ? x : null;
}
