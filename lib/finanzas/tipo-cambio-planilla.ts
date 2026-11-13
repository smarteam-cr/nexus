/**
 * lib/finanzas/tipo-cambio-planilla.ts — la planilla en dólares y el aviso cuando el tipo de cambio se mueve (2026-11-13,
 * DECISIONS «Gastos fijos y variables, las reglas de gasto y el tipo de cambio de la planilla»).
 *
 * Lo acordado con Elías:
 *   · Cada salario se guarda en SU moneda (`CostoRecurrente`, `PagoPlanilla`): eso no cambia.
 *   · La pantalla muestra la planilla en dólares al tipo de cambio del día (la venta del BCCR, `TipoCambioDia`).
 *   · Hay un tipo de cambio de REFERENCIA: el promedio de la venta del BCCR del último mes cerrado. En noviembre, el de
 *     octubre; el 1 de diciembre pasa a ser el de noviembre. No se guarda: sale de los días que ya están guardados, y un
 *     mes que terminó no cambia de promedio (regla 1 del §2 de ARCHITECTURE: nada derivable en dos lugares).
 *   · Aviso amarillo «vigilar» desde el 3 % de diferencia entre el de hoy y el de referencia, y rojo «decidir» desde el
 *     5 %, en las dos direcciones. Los dos porcentajes los edita Super Admin (`UmbralTipoCambio`).
 *   · El caso que importa es el colón que se FORTALECE (menos colones por dólar): la planilla en colones cuesta más
 *     dólares. Se muestra cuánto sube o baja la planilla en dólares con el movimiento.
 *
 * ⛔ El FX sigue prohibido en la base y en los motores: acá solo se PRESENTA, y la conversión es la de siempre
 * (`convertir`, lib/finanzas/equilibrio.ts). Nada de esto se guarda ni entra a la caja neta.
 *
 * PURO: sin Prisma ni reloj.
 */
import { convertir, type MonedaEq } from "./equilibrio";
import { tasaDelDia, tasasDeMesDesdeDias } from "./tipo-cambio";

export interface Umbrales {
  /** Desde qué movimiento (en %) el aviso es amarillo. */
  vigilarPct: number;
  /** Desde qué movimiento (en %) el aviso es rojo. */
  decidirPct: number;
}

/** Lo acordado con Elías el 2026-11-13. Valen mientras Super Admin no los cambie. */
export const UMBRALES_POR_DEFECTO: Umbrales = { vigilarPct: 3, decidirPct: 5 };

/** null = están bien; si no, qué está mal, en palabras de la pantalla. */
export function errorDeUmbrales(u: Umbrales): string | null {
  if (!Number.isFinite(u.vigilarPct) || !Number.isFinite(u.decidirPct)) return "Escribe los dos porcentajes.";
  if (u.vigilarPct <= 0) return "«Vigilar» tiene que ser mayor que 0 %.";
  if (u.decidirPct <= u.vigilarPct) return "«Decidir» tiene que ser mayor que «vigilar».";
  if (u.decidirPct > 50) return "«Decidir» no puede pasar del 50 %.";
  const masDeDosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) > 1e-6;
  if (masDeDosDecimales(u.vigilarPct) || masDeDosDecimales(u.decidirPct)) {
    return "Los porcentajes llevan como mucho dos decimales.";
  }
  return null;
}

export interface TasaDeReferencia {
  /** El mes cuyo promedio es la referencia («YYYY-MM»). */
  periodo: string;
  crcPorUsd: number;
  /** Cuántos días del mes tienen su tasa del BCCR. */
  dias: number;
  /** Todos los días del mes tienen tasa. */
  completo: boolean;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreDelMes = (periodo: string) => `${MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo} ${periodo.slice(0, 4)}`;

/**
 * La tasa de referencia: el promedio de la venta del último mes ANTERIOR al de hoy que tiene días del BCCR. El mes en
 * curso nunca: su promedio todavía se mueve. null = no hay ningún mes cerrado con tasas.
 */
export function tasaDeReferencia(dias: ReadonlyArray<{ fecha: string; venta: number }>, hoyISO: string): TasaDeReferencia | null {
  const mesDeHoy = hoyISO.slice(0, 7);
  const periodos = [...new Set(dias.map((d) => d.fecha.slice(0, 7)))].filter((p) => p < mesDeHoy).sort();
  const ultimo = periodos[periodos.length - 1];
  if (!ultimo) return null;
  const t = tasasDeMesDesdeDias(dias, [ultimo], hoyISO).get(ultimo);
  if (!t) return null;
  return { periodo: ultimo, crcPorUsd: t.crcPorUsd, dias: t.dias, completo: t.completo };
}

export type NivelDelAviso = "normal" | "vigilar" | "decidir";

export interface MovimientoDelTipoDeCambio {
  hoy: { fecha: string; venta: number };
  referencia: TasaDeReferencia;
  /** (hoy − referencia) ÷ referencia, en %, con dos decimales. Negativo = el colón se fortaleció. */
  pct: number;
  /** Menos colones por dólar que la referencia: la planilla en colones cuesta más dólares. */
  colonSeFortalece: boolean;
  nivel: NivelDelAviso;
  umbrales: Umbrales;
}

/** El tipo de cambio de hoy (o el del día anterior más cercano, hasta una semana) contra la referencia. */
export function movimientoDelTipoDeCambio(
  dias: ReadonlyArray<{ fecha: string; venta: number }>,
  hoyISO: string,
  umbrales: Umbrales,
): MovimientoDelTipoDeCambio | null {
  const referencia = tasaDeReferencia(dias, hoyISO);
  const hoy = tasaDelDia(new Map(dias.map((d) => [d.fecha, d.venta])), hoyISO);
  if (!referencia || !hoy) return null;
  const pct = Math.round(((hoy.venta - referencia.crcPorUsd) / referencia.crcPorUsd) * 10000) / 100;
  const abs = Math.abs(pct);
  const nivel: NivelDelAviso = abs >= umbrales.decidirPct ? "decidir" : abs >= umbrales.vigilarPct ? "vigilar" : "normal";
  return { hoy, referencia, pct, colonSeFortalece: pct < 0, nivel, umbrales };
}

/** Lo que dice el aviso, sin plata: lo puede leer quien no ve salarios. */
export function textoDelMovimiento(m: MovimientoDelTipoDeCambio): string {
  const cuanto = `${Math.abs(m.pct).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  if (m.pct === 0) return `El dólar está igual que el promedio de ${nombreDelMes(m.referencia.periodo)}.`;
  return m.colonSeFortalece
    ? `El colón se fortaleció ${cuanto} contra el promedio de ${nombreDelMes(m.referencia.periodo)}: lo que se paga en colones cuesta más dólares.`
    : `El colón se debilitó ${cuanto} contra el promedio de ${nombreDelMes(m.referencia.periodo)}: lo que se paga en colones cuesta menos dólares.`;
}

export interface SalarioParaDolares {
  /** Lo que cuesta en UN mes, en su moneda. */
  montoMensual: number;
  moneda: MonedaEq;
}

export interface PlanillaEnDolares {
  /** La parte en colones, al mes. */
  colones: number;
  /** La parte que ya está en dólares, al mes. */
  dolares: number;
  /** Los colones, en dólares al tipo de cambio de hoy. */
  colonesAlDeHoy: number;
  /** Los colones, en dólares al de referencia. */
  colonesAlDeReferencia: number;
  /** Toda la planilla en dólares: hoy y a la referencia. */
  totalAlDeHoy: number;
  totalAlDeReferencia: number;
  /** totalAlDeHoy − totalAlDeReferencia. Positivo = la planilla cuesta más dólares que con la referencia. */
  diferencia: number;
  /** Cuántos salarios hay en cada moneda (para decir de dónde sale el número). */
  enColones: number;
  enDolares: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** La planilla de un mes, en dólares, al tipo de cambio de hoy y al de referencia. null = no hay con qué convertir. */
export function planillaEnDolares(salarios: readonly SalarioParaDolares[], m: Pick<MovimientoDelTipoDeCambio, "hoy" | "referencia">): PlanillaEnDolares | null {
  const colones = round2(salarios.filter((s) => s.moneda === "CRC").reduce((n, s) => n + s.montoMensual, 0));
  const dolares = round2(salarios.filter((s) => s.moneda === "USD").reduce((n, s) => n + s.montoMensual, 0));
  const alDeHoy = convertir(colones, "CRC", "USD", { periodo: m.hoy.fecha.slice(0, 7), crcPorUsd: m.hoy.venta, fuente: "BCCR · venta del día" });
  const alDeReferencia = convertir(colones, "CRC", "USD", {
    periodo: m.referencia.periodo,
    crcPorUsd: m.referencia.crcPorUsd,
    fuente: "BCCR · promedio de la venta del mes",
  });
  if (!alDeHoy || !alDeReferencia) return null;
  const totalAlDeHoy = round2(dolares + alDeHoy.monto);
  const totalAlDeReferencia = round2(dolares + alDeReferencia.monto);
  return {
    colones,
    dolares,
    colonesAlDeHoy: alDeHoy.monto,
    colonesAlDeReferencia: alDeReferencia.monto,
    totalAlDeHoy,
    totalAlDeReferencia,
    diferencia: round2(totalAlDeHoy - totalAlDeReferencia),
    enColones: salarios.filter((s) => s.moneda === "CRC").length,
    enDolares: salarios.filter((s) => s.moneda === "USD").length,
  };
}
