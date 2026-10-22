/**
 * lib/ventas/tipo-de-negocio.ts — qué es un negocio ganado y con quién se compartió, leído de HubSpot (2026-10-21). PURO.
 *
 * El modelo de comisiones (DECISIONS «El modelo de comisiones cerrado con Marco») necesita saber de cada negocio si es
 * cliente nuevo, expansión o renovación, y si se compartió entre Ventas y Customer Success. Las dos cosas viven en
 * propiedades del trato en HubSpot; la copia de negocios ganados (./sync-ganadas.ts) las trae con esto.
 *
 *  · El tipo es la propiedad `motion_comercial`, con el valor de HOY: se puede corregir después de la firma.
 *    «Recuperación» cuenta como nuevo (un cliente que vuelve es trabajo de Ventas).
 *  · La compartida es `venta_compartida_con` (un usuario de HubSpot) con el valor que tenía AL ENTRAR A GANADO: la
 *    marca la pone quien crea el negocio, antes de la firma.
 */

export const PROPIEDAD_TIPO_DE_NEGOCIO = "motion_comercial";
export const PROPIEDAD_COMPARTIDA = "venta_compartida_con";
export const VALOR_RENOVACION = "renovacion";

export type TipoDeNegocioDeHubspot = "NUEVO" | "EXPANSION" | "RENOVACION";

/** El valor interno de `motion_comercial` como tipo de negocio. Vacío o desconocido: null. */
export function tipoDeNegocioDe(valor: string | null | undefined): TipoDeNegocioDeHubspot | null {
  switch ((valor ?? "").trim()) {
    case "nuevo_negocio":
    case "recuperacion":
      return "NUEVO";
    case "expansion":
      return "EXPANSION";
    case VALOR_RENOVACION:
      return "RENOVACION";
    default:
      return null;
  }
}

/** Un cambio de una propiedad en la historia de HubSpot. */
export interface ValorEnLaHistoria {
  value: string;
  timestamp: string;
}

export interface CompartidaAlFirmar {
  /** El dueño de HubSpot con quien se compartió al entrar a ganado, o null. */
  ownerId: string | null;
  /** El valor de hoy es distinto del que tenía al firmar: se puso o cambió después. */
  despuesDeLaFirma: boolean;
}

/**
 * Con quién se compartió una venta al firmarse: el último valor de la historia con fecha hasta `ganadaEn`. Sin
 * `ganadaEn` (un trato viejo sin la fecha) vale el de hoy. `hoy` es el valor actual de la propiedad.
 */
export function compartidaAlFirmar(hoy: string | null | undefined, historia: readonly ValorEnLaHistoria[], ganadaEn: Date | null): CompartidaAlFirmar {
  const actual = (hoy ?? "").trim() || null;
  if (!ganadaEn) return { ownerId: actual, despuesDeLaFirma: false };
  const limite = ganadaEn.getTime();
  let alFirmar: string | null = null;
  let masNueva = -Infinity;
  for (const h of historia) {
    const t = Date.parse(h.timestamp);
    if (!Number.isFinite(t) || t > limite || t < masNueva) continue;
    masNueva = t;
    alFirmar = (h.value ?? "").trim() || null;
  }
  return { ownerId: alFirmar, despuesDeLaFirma: alFirmar !== actual };
}
