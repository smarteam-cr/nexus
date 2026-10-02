/**
 * lib/cobranza/mercury/pestanas.ts — las pestañas de Cobranza › Mercury, en un módulo neutral: las lee la página (servidor)
 * para decidir con cuál abre y el cliente para dibujarlas.
 */
export type PestanaMercury = "que-es" | "emparejar" | "no-cuadra";

export const PESTANAS_MERCURY: readonly PestanaMercury[] = ["que-es", "emparejar", "no-cuadra"];

/** La pestaña que pide un enlace (`?pestana=no-cuadra`), o undefined si no es una de estas. */
export function pestanaMercuryDe(valor: string | undefined): PestanaMercury | undefined {
  return PESTANAS_MERCURY.find((p) => p === valor);
}
