/**
 * lib/escala/datos/mini.fixture.ts — la escala de juguete del lector, en la forma ÚNICA del `.md`
 * que se genera desde los datos.
 *
 * La de `lib/escala/documento/mini-escala.fixture.ts` trae a propósito párrafos partidos en dos
 * líneas (el lector los tolera). El importador no: cada párrafo es una línea, para que ida y vuelta
 * dé el mismo texto. Esta es la misma escala con esos párrafos unidos.
 */
import { MINI_ESCALA_CON_EDICION } from "@/lib/escala/documento/mini-escala.fixture";

export const PARRAFOS_PARTIDOS = [
  "el pedido.\nY el vendedor",
  "La persona\n  valida.",
  "un negocio\ndeja de",
  "una tienda,\nsin vendedores.",
  "no terminó\nde comprar?",
] as const;

export const MINI_EN_UNA_FORMA = PARRAFOS_PARTIDOS.reduce((t, partido) => {
  if (!t.includes(partido)) throw new Error(`La escala de juguete ya no trae «${partido}»: actualiza este fixture.`);
  return t.replace(partido, partido.replace(/\n\s*/, " "));
}, MINI_ESCALA_CON_EDICION);
