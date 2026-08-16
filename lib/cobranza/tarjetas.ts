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
 * tarjeta NO se suma — se cuenta aparte y se declara. Convertirlo exigiría un
 * tipo de cambio que este sistema no tiene ni va a tener.
 */

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
