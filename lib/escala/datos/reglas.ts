/**
 * lib/escala/datos/reglas.ts — los valores fijos de la escala como datos. PURO.
 *
 * Van como TEXT en la base (no enum, INV4): los fija este archivo y los valida quien escribe.
 */

/** `borrador`: la que se está editando (una sola a la vez). `publicada`: congelada, no cambia nunca. */
export const ESTADOS_DE_LA_VERSION = ["borrador", "publicada"] as const;
export type EstadoDeLaVersion = (typeof ESTADOS_DE_LA_VERSION)[number];

/** A qué está anclado un cambio de la bitácora. */
export const TIPOS_DE_ANCLA = ["encabezado", "texto", "area", "dimension", "nivel", "criterio", "edicion"] as const;
export type TipoDeAncla = (typeof TIPOS_DE_ANCLA)[number];

export const ACCIONES_DEL_CAMBIO = ["agregado", "cambiado", "quitado"] as const;
export type AccionDelCambio = (typeof ACCIONES_DEL_CAMBIO)[number];

/** Por dónde entró el cambio: un `.md` importado en bloque, o el editor de la pantalla. */
export const ORIGENES_DEL_CAMBIO = ["importacion", "editor"] as const;
export type OrigenDelCambio = (typeof ORIGENES_DEL_CAMBIO)[number];

/** «8.8.0»: tres números. */
export const FORMA_DE_VERSION = /^\d+\.\d+\.\d+$/;

/** 7.0.10 > 7.0.9: por números, no por texto. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
