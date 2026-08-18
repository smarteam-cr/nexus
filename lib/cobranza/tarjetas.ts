/**
 * lib/cobranza/tarjetas.ts
 *
 * Aritmética PURA de una tarjeta de crédito de la empresa: cero Prisma, cero red,
 * cero env. La consumen la query del server y el panel del cliente, así que hay
 * UNA sola definición de "disponible" y de "cargado mensual".
 *
 * ⚠ LAS DOS REGLAS QUE ESTE ARCHIVO EXISTE PARA SOSTENER:
 *
 *  1. **El saldo NO se deriva de los cargos.** Un saldo es ACUMULADO (lo que
 *     debés hoy) y un cargo es MENSUAL (lo que te van a cobrar el mes que viene):
 *     no son la misma unidad. Por eso `disponible` sale de `límite − saldoUsado`
 *     y nada más, y si falta cualquiera de los dos devuelve `null` en vez de
 *     inventar un número. "Avisar si el saldo no cuadra con lo asignado" sería
 *     inventar una conciliación que nadie pidió y que no significa nada.
 *  2. **Lo que sí se compara, y es sólido**: si el disponible no alcanza para el
 *     PRÓXIMO mes de cargos, el mes que viene algo rebota. Eso sí son dos números
 *     de la misma unidad (plata disponible contra plata que van a cobrar).
 *
 * ⚠ Y una tercera, por la prohibición de FX: un costo en OTRA moneda que la
 * tarjeta NO se suma — se cuenta aparte y se declara. Desde 2026-08-17 el sistema
 * SÍ tiene tipo de cambio (`TipoCambioMes`), pero eso no cambia nada acá: la
 * licencia para convertir es de la capa de PRESENTACIÓN del reporte anual de
 * equilibrio y de nadie más (ver DECISIONS §El reporte anual de equilibrio). Este
 * motor sigue sin convertir jamás, y hay un test estructural que lo verifica.
 *
 * ⚠ CERO `new Date()` acá adentro: la fecha de hoy ENTRA POR PARÁMETRO
 * (`hoyISO`, "YYYY-MM-DD"). Es la misma regla que ya sostiene `comisiones.ts`:
 * un `new Date("2026-07-31")` en UTC-6 se lee como el 30 y correría el ciclo
 * entero un día. La aritmética de calendario se hace sobre strings ISO.
 */

import { diffDays } from "./engine";
import { finDeMesISO, periodoSiguiente } from "./comisiones";

/** Moneda tal como la modela Cobranza (sin importar el enum de Prisma: esto es puro). */
export type MonedaTarjeta = "CRC" | "USD";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Un costo en su equivalente MENSUAL. Un ANUAL se reparte /12: el burn queda
 * bien y el mes puntual no — es la misma aproximación declarada que usa el motor
 * al proyectar, y acá se reusa a propósito para que la tarjeta y la caja neta no
 * puedan contar historias distintas del mismo costo.
 *
 * Vive acá (y `components/cobranza/format.ts` lo reexporta para la UI) por el
 * mismo motivo que `bucketAntiguedad` vive en el engine: que haya UNA definición.
 */
export function mensualizado(monto: number, frecuencia: string): number {
  return frecuencia === "ANUAL" ? round2(monto / 12) : monto;
}

/** Un costo asignado a la tarjeta, en la forma mínima que hace falta para sumar. */
export interface CostoDeTarjeta {
  monto: number;
  moneda: string;
  frecuencia: string;
  /** Un costo pausado o dado de baja ya no se le carga a la tarjeta. */
  activo: boolean;
  finalizadoEl: string | null;
}

export interface CargadoMensual {
  /** Suma mensualizada de los costos que SÍ están en la moneda de la tarjeta. */
  total: number;
  /** Cuántos costos quedaron afuera por estar en otra moneda (no se convierten). */
  enOtraMoneda: number;
}

/**
 * Cuánto se le carga a esta tarjeta por mes. Excluye lo pausado y lo dado de
 * baja con la MISMA regla que el burn del panel de costos: `activo &&
 * finalizadoEl == null`. Si las dos reglas divergieran, la tarjeta diría que le
 * cargan algo que el burn ya no cuenta.
 */
export function cargadoMensualDe(
  costos: CostoDeTarjeta[],
  monedaTarjeta: MonedaTarjeta,
): CargadoMensual {
  let total = 0;
  let enOtraMoneda = 0;
  for (const c of costos) {
    if (!c.activo || c.finalizadoEl !== null) continue;
    if (c.moneda !== monedaTarjeta) {
      enOtraMoneda++;
      continue;
    }
    total += mensualizado(c.monto, c.frecuencia);
  }
  return { total: round2(total), enOtraMoneda };
}

export interface TarjetaCalculoInput {
  limite: number | null;
  saldoUsado: number | null;
  /** Ya mensualizado y ya en la moneda de la tarjeta (`cargadoMensualDe`). */
  cargadoMensual: number;
}

export interface TarjetaCalculo {
  /** límite − saldo. null = falta un dato; NUNCA se aproxima con los cargos. */
  disponible: number | null;
  /** saldo ÷ límite, 0-100. null por lo mismo. */
  usoPorcentaje: number | null;
  /**
   * true = el disponible NO alcanza para el próximo mes de cargos. Es la única
   * comparación legítima entre el saldo y lo asignado: los dos son plata del
   * mismo mes. Exige los dos datos y al menos un cargo — sin eso no hay
   * afirmación que hacer.
   */
  noCabeElProximoMes: boolean;
  /** Qué falta para poder calcular el disponible (para decirlo en pantalla). */
  faltaDato: "limite" | "saldo" | "ambos" | null;
}

export function calcularTarjeta(input: TarjetaCalculoInput): TarjetaCalculo {
  const { limite, saldoUsado, cargadoMensual } = input;

  const sinLimite = limite === null;
  const sinSaldo = saldoUsado === null;
  const faltaDato: TarjetaCalculo["faltaDato"] =
    sinLimite && sinSaldo ? "ambos" : sinLimite ? "limite" : sinSaldo ? "saldo" : null;

  if (faltaDato !== null) {
    return { disponible: null, usoPorcentaje: null, noCabeElProximoMes: false, faltaDato };
  }

  const disponible = round2(limite! - saldoUsado!);
  // Un límite en cero no da porcentaje: dividir sería Infinity o NaN, y ninguno
  // de los dos se puede pintar.
  const usoPorcentaje = limite! > 0 ? round2((saldoUsado! / limite!) * 100) : null;

  return {
    disponible,
    usoPorcentaje,
    noCabeElProximoMes: cargadoMensual > 0 && disponible < cargadoMensual,
    faltaDato: null,
  };
}

// ── El ciclo de la tarjeta: cuándo corta y cuándo vence el pago ─────────────────

export interface CicloTarjeta {
  /** Próximo día de corte, ISO. Si hoy ES el corte, es hoy (`diasAlCorte: 0`). */
  proximoCorte: string;
  /** Cuándo vence el pago de ESE corte, ISO. Es una ESTIMACIÓN — ver `estimado`. */
  fechaLimitePago: string;
  /** Días de `hoyISO` al corte. 0 = hoy. */
  diasAlCorte: number;
  /** Días de `hoyISO` al vencimiento del pago. */
  diasAlPago: number;
  /**
   * Siempre `true`, y vive en el TIPO para que la pantalla no pueda olvidarse de
   * rotularlo: la fecha de pago se deduce de DOS ENTEROS (día de corte y día de
   * pago) y hay bancos que no se pueden expresar así — uno que corta el 5 y cobra
   * el 25 del mes SIGUIENTE cae fuera de la heurística. El dato duro es el día
   * que el usuario cargó; la fecha es una estimación y se muestra como tal.
   */
  estimado: true;
}

/**
 * El ciclo vivo de una tarjeta a partir de sus dos días configurados.
 *
 * `null` cuando falta cualquiera de los dos — la pantalla lo DICE (mismo criterio
 * que `faltaDato` en `calcularTarjeta`): asumir "el 30" pondría en pantalla una
 * fecha de vencimiento inventada, que es exactamente el dato por el que alguien
 * podría pagar tarde.
 *
 * Reglas:
 *  - El día se CLAMPEA al largo real del mes (un corte el 31 cae el 28 en febrero,
 *    el 29 en bisiesto) reusando `finDeMesISO`, que ya hace esa cuenta.
 *  - `diaPago > diaCorte` ⇒ el pago cae en el MISMO mes del corte;
 *    `diaPago <= diaCorte` ⇒ cae en el mes SIGUIENTE. Se compara con los días
 *    CONFIGURADOS (no los clampeados): el 31 y el 15 siguen siendo el 31 y el 15
 *    aunque en febrero los dos aterricen cerca del 28.
 */
export function cicloDeTarjeta(
  hoyISO: string,
  diaCorte: number | null,
  diaPago: number | null,
): CicloTarjeta | null {
  if (!esDiaDelMes(diaCorte) || !esDiaDelMes(diaPago)) return null;

  const hoy = hoyISO.slice(0, 10);
  const periodoHoy = hoy.slice(0, 7);

  // El corte de ESTE mes si todavía no pasó (hoy incluido); si ya pasó, el del
  // mes que viene. Comparación de strings ISO: mismo largo, orden lexicográfico
  // === orden cronológico.
  const corteDeEsteMes = diaClampeado(periodoHoy, diaCorte);
  const proximoCorte =
    corteDeEsteMes >= hoy ? corteDeEsteMes : diaClampeado(periodoSiguiente(periodoHoy), diaCorte);

  const periodoDelCorte = proximoCorte.slice(0, 7);
  const periodoDelPago =
    diaPago > diaCorte ? periodoDelCorte : periodoSiguiente(periodoDelCorte);
  const fechaLimitePago = diaClampeado(periodoDelPago, diaPago);

  return {
    proximoCorte,
    fechaLimitePago,
    diasAlCorte: diffDays(hoy, proximoCorte),
    diasAlPago: diffDays(hoy, fechaLimitePago),
    estimado: true,
  };
}

/** El día `dia` de `periodo` ("YYYY-MM"), CLAMPEADO al último día real del mes. */
function diaClampeado(periodo: string, dia: number): string {
  const largoDelMes = Number(finDeMesISO(periodo).slice(8, 10));
  const d = Math.min(dia, largoDelMes);
  return `${periodo}-${String(d).padStart(2, "0")}`;
}

/**
 * Un día del mes utilizable. Lo que NO lo es (null, 0, 32, un decimal) se trata
 * como dato FALTANTE en vez de clamparse: clampear un 32 diría "fin de mes" sin
 * que nadie lo haya escrito. El Zod de la frontera ya acota 1-31.
 */
function esDiaDelMes(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 31;
}
