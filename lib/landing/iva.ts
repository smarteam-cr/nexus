/**
 * lib/landing/iva.ts — el IVA de Costa Rica en la Inversión de la propuesta. PURO (2026-10-17).
 *
 * Pedido del roadmap (Ventas, paso 4): a un cliente de Costa Rica la propuesta le dice si los
 * montos van «+ IVA» o con el «IVA incluido», y le muestra la cuenta. Tres modos:
 *  · `sin`      — como hoy: no se dice nada del impuesto. Es lo que lee TODO lo ya publicado,
 *                 porque ninguna sección trae la key `iva`.
 *  · `mas`      — los montos escritos son SIN impuesto: se suma el 13% y se muestra el total
 *                 con IVA.
 *  · `incluido` — los montos escritos YA traen el impuesto: se desglosa la base y el IVA, y el
 *                 total no cambia.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ─────────────────────────────────────────────
 *  · No mezcla monedas. Recibe UN monto de UNA moneda (el de un cierre ya sumado por
 *    `gruposDeInversion`, que no suma colones con dólares) y devuelve esa moneda tal cual.
 *  · No toca los renglones: el IVA va en el CIERRE, sobre lo que se firma. Las líneas siguen
 *    diciendo lo que escribió Ventas.
 *  · No decide si el cliente es de Costa Rica: eso lo dice `lib/business-cases/pais-del-cliente.ts`
 *    y lo decide Ventas en el editor.
 *
 * ── EL REDONDEO ─────────────────────────────────────────────────────────────
 * A 2 decimales, una sola vez por número, y de forma que base + IVA = total AL CENTAVO: en
 * `mas` el IVA se redondea y el total es la suma de los dos redondeados; en `incluido` la base se
 * redondea y el IVA es lo que falta para llegar al total. Un desglose que no suma lo detecta el
 * cliente con una calculadora.
 */
import type { Rango } from "./money";

/** El IVA general de Costa Rica (Ley 9635), en porcentaje. */
export const TASA_IVA_CR = 13;

export type ModoIva = "sin" | "mas" | "incluido";

/** Los modos que el control ofrece, en orden. */
export const MODOS_IVA: readonly ModoIva[] = ["sin", "mas", "incluido"];

/** El modo de una sección. Lo ilegible o ausente es `sin`: lo publicado se ve como hoy. */
export function modoIvaDe(data: { iva?: unknown } | null | undefined): ModoIva {
  const v = typeof data?.iva === "string" ? data.iva.trim().toLowerCase() : "";
  return v === "mas" || v === "incluido" ? v : "sin";
}

export interface DesgloseIva {
  modo: "mas" | "incluido";
  tasa: number;
  /** El monto sin impuesto. */
  base: Rango;
  /** El impuesto. */
  iva: Rango;
  /** Lo que se paga: base + IVA, al centavo. */
  total: Rango;
}

/** Redondeo a 2 decimales. `EPSILON` para que 1.005 dé 1.01 y no 1.00. */
export function aCentavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function desglosarUno(monto: number, modo: "mas" | "incluido", tasa: number) {
  const f = tasa / 100;
  if (modo === "mas") {
    const base = aCentavos(monto);
    const iva = aCentavos(base * f);
    return { base, iva, total: aCentavos(base + iva) };
  }
  const total = aCentavos(monto);
  const base = aCentavos(total / (1 + f));
  return { base, iva: aCentavos(total - base), total };
}

/**
 * El desglose de UN monto (un rango, si Ventas cotizó un rango). `null` con el modo `sin` o sin
 * monto: no hay nada que decir del impuesto.
 */
export function desgloseIva(
  monto: Rango | null | undefined,
  modo: ModoIva,
  tasa: number = TASA_IVA_CR,
): DesgloseIva | null {
  if (!monto || modo === "sin") return null;
  const a = desglosarUno(monto.min, modo, tasa);
  const b = monto.min === monto.max ? a : desglosarUno(monto.max, modo, tasa);
  return {
    modo,
    tasa,
    base: { min: a.base, max: b.base },
    iva: { min: a.iva, max: b.iva },
    total: { min: a.total, max: b.total },
  };
}

/** Lo mínimo que esta función lee de `gruposDeInversion`. */
export interface CierreDeInversion {
  servicios: { total: Rango | null };
  licencias: { total: Rango | null };
  granTotal: Rango | null;
  gruposConMonto: number;
  hayRecurrentes: boolean;
  unico: Rango | null;
  recurrente: Rango | null;
  moneda: string;
}

/** Los números de la sección que llevan el desglose: los que se firman. */
export interface IvaDelCierre {
  moneda: string;
  /** Con un solo grupo sumable y sin recurrentes, el subtotal de ese grupo ES el total. */
  lineas: DesgloseIva | null;
  licencias: DesgloseIva | null;
  granTotal: DesgloseIva | null;
  unico: DesgloseIva | null;
  recurrente: DesgloseIva | null;
}

/**
 * Qué cierre lleva el desglose, con la MISMA regla con que la sección pinta su píldora final:
 *  · con recurrentes → el pago único y el recurrente (son los dos números que se firman);
 *  · sin recurrentes y con dos grupos → el gran total;
 *  · con un solo grupo → el subtotal de ese grupo, que ahí es el total.
 * Un subtotal que no es el total no lleva desglose: sumar dos desgloses no daría el del total
 * al centavo, y el cliente tiene que poder rehacer la cuenta del número que firma.
 */
export function ivaDelCierre(g: CierreDeInversion, modo: ModoIva, tasa: number = TASA_IVA_CR): IvaDelCierre {
  const vacio: IvaDelCierre = { moneda: g.moneda, lineas: null, licencias: null, granTotal: null, unico: null, recurrente: null };
  if (modo === "sin") return vacio;
  if (g.hayRecurrentes) {
    return { ...vacio, unico: desgloseIva(g.unico, modo, tasa), recurrente: desgloseIva(g.recurrente, modo, tasa) };
  }
  if (g.granTotal) return { ...vacio, granTotal: desgloseIva(g.granTotal, modo, tasa) };
  if (g.gruposConMonto === 1) {
    return {
      ...vacio,
      lineas: desgloseIva(g.servicios.total, modo, tasa),
      licencias: desgloseIva(g.licencias.total, modo, tasa),
    };
  }
  return vacio;
}
