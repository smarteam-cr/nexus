/**
 * lib/ai/precios.ts — CUÁNTO CUESTA UNA LLAMADA A CLAUDE.
 *
 * Puro y sin dependencias a propósito: es la única aritmética de plata de todo el frente de IA,
 * y tiene que poder probarse entera sin base ni red.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ──────────────────────────────────────────────
 * Hasta el 2026-08-17 Nexus no medía un solo token. Había conciencia del problema escrita en
 * comentarios sueltos («unas 35.000 fichas de entrada por diagnóstico», «para no quemar tokens»)
 * pero ningún instrumento: nadie leía `response.usage`, no había tabla, ni tope, ni forma de
 * enterarse de un descontrol antes de la factura.
 *
 * ── LA TRAMPA QUE ESTE ARCHIVO EVITA ─────────────────────────────────────────
 * ⛔ El costo NO es `(entrada + salida) × un precio`. Un token de entrada y uno de salida cuestan
 * distinto —hasta 5× de diferencia—, y encima hay dos precios más que solo aparecen con caching:
 * escribir la caché cuesta MÁS que leer normal, y leerla cuesta 10× MENOS. Una fórmula que sume
 * todo junto se equivoca por múltiplos, no por centavos, y se equivoca en la dirección cómoda
 * (subestima). Por eso las cuatro clases de token se cobran por separado.
 *
 * ⚠ LOS PRECIOS ENVEJECEN. Cada entrada lleva la fecha en que se verificó. Si mañana Anthropic
 * cambia una tarifa, esto miente en silencio: nada falla, el número simplemente deja de ser cierto.
 * Verificarlos contra la consola de facturación cuando el total no cuadre es parte del trabajo.
 */

/** Las cuatro clases de token que factura la API, tal como vienen en `response.usage`. */
export interface UsoDeTokens {
  inputTokens: number;
  outputTokens: number;
  /** Tokens leídos de una caché ya escrita — la clase más barata (~10× menos que entrada). */
  cacheReadTokens?: number;
  /** Tokens escritos a la caché — cuesta MÁS que entrada normal (~1,25× a 5 min). */
  cacheCreationTokens?: number;
}

export interface PrecioDeModelo {
  /** USD por millón de tokens de entrada. */
  entrada: number;
  /** USD por millón de tokens de salida. */
  salida: number;
  /** Multiplicador sobre `entrada` al escribir caché. 1,25 con TTL de 5 min. */
  factorEscrituraCache: number;
  /** Multiplicador sobre `entrada` al leer de caché. */
  factorLecturaCache: number;
  /** Cuándo se verificó contra la tarifa publicada. */
  verificado: string;
}

const FACTOR_ESCRITURA_CACHE = 1.25;
const FACTOR_LECTURA_CACHE = 0.1;

/**
 * Precios en USD por millón de tokens, verificados contra la tarifa oficial el 2026-08-17.
 *
 * Solo están los modelos que Nexus usa hoy. Un modelo que no figure NO rompe nada: se mide igual
 * y el costo sale `null` — es preferible saber cuántos tokens gastó algo a fingir un precio.
 */
export const PRECIOS: Record<string, PrecioDeModelo> = {
  "claude-sonnet-4-6": {
    entrada: 3.0,
    salida: 15.0,
    factorEscrituraCache: FACTOR_ESCRITURA_CACHE,
    factorLecturaCache: FACTOR_LECTURA_CACHE,
    verificado: "2026-08-17",
  },
  "claude-haiku-4-5-20251001": {
    entrada: 1.0,
    salida: 5.0,
    factorEscrituraCache: FACTOR_ESCRITURA_CACHE,
    factorLecturaCache: FACTOR_LECTURA_CACHE,
    verificado: "2026-08-17",
  },
};

/** Alias sin fecha → id con fecha, para que las dos formas de nombrar un modelo cobren igual. */
const ALIAS: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
};

export function precioDe(model: string): PrecioDeModelo | null {
  return PRECIOS[model] ?? PRECIOS[ALIAS[model] ?? ""] ?? null;
}

/**
 * Costo en USD de una llamada.
 *
 * Devuelve `null` —no 0— cuando el modelo no está tarifado. La diferencia importa: 0 se suma sin
 * ruido a un total y lo deja mintiendo; `null` obliga a que quien agregue decida qué hacer con lo
 * que no sabe cuánto costó.
 */
export function costoDeLlamada(model: string, uso: UsoDeTokens): number | null {
  const p = precioDe(model);
  if (!p) return null;

  const porMillon = (tokens: number, usdPorMillon: number) => (tokens / 1_000_000) * usdPorMillon;

  return (
    porMillon(uso.inputTokens, p.entrada) +
    porMillon(uso.outputTokens, p.salida) +
    porMillon(uso.cacheReadTokens ?? 0, p.entrada * p.factorLecturaCache) +
    porMillon(uso.cacheCreationTokens ?? 0, p.entrada * p.factorEscrituraCache)
  );
}

/**
 * Formato para pantalla. Sub-centavo se muestra con 4 decimales: una corrida barata que dijera
 * «$0,00» se leería como gratis, y el punto de medir es justamente que nada es gratis.
 */
export function formatearUsd(usd: number | null): string {
  if (usd === null) return "—";
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
