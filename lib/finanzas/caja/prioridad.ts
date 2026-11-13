/**
 * lib/finanzas/caja/prioridad.ts — si la caja no alcanza, en qué orden se paga (2026-11-13). PURO.
 *
 * La prioridad acordada: primero la planilla, después los impuestos y las cargas sociales, después lo demás
 * (proveedores, pagos comprometidos, comisiones, gastos y costos fijos) y las herramientas al final. Dentro de cada
 * nivel, lo que vence antes va antes.
 *
 * ⚠ El orden es ESTRICTO: si un pago no alcanza, los que vienen después en el orden tampoco se marcan como pagables
 * aunque uno más chico entrara. Pagar una herramienta mientras la planilla espera es justo lo que la regla prohíbe.
 */
import type { Moneda, RubroSale, SalidaProyectada, TotalesMoneda } from "./proyeccion";

export const NIVEL_DE_PRIORIDAD: Record<RubroSale, 1 | 2 | 3 | 4> = {
  PLANILLA: 1,
  IMPUESTOS_Y_CARGAS: 2,
  PAGOS: 3,
  COMISIONES_DE_VENDEDOR: 3,
  GASTOS: 3,
  FIJOS: 3,
  HERRAMIENTAS: 4,
};

export const ETIQUETA_DE_NIVEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Primero: personal (planilla y comisiones)",
  2: "Después: impuestos y cargas sociales",
  3: "Después: proveedores y demás pagos",
  4: "Al final: herramientas",
};

export interface PagoEnOrden extends SalidaProyectada {
  nivel: 1 | 2 | 3 | 4;
  /** ¿Alcanza la plata para este pago, pagando en el orden? */
  alcanza: boolean;
  /** Lo que queda libre después de este pago (en dólares si hay tipo de cambio; si no, en su moneda). */
  quedaDespues: number;
}

export interface OrdenDePagos {
  /** En dólares, juntando las dos monedas con el tipo de cambio; o cada moneda por su lado si no lo hay. */
  modo: "EN_DOLARES" | "POR_MONEDA";
  disponible: TotalesMoneda;
  disponibleEnUsd: number | null;
  pagos: PagoEnOrden[];
  /** Lo que no alcanza, sumado. */
  faltante: TotalesMoneda;
  faltanteEnUsd: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** El orden de pago: nivel, después fecha (lo sin día al final de su corte), después concepto. */
export function ordenarPorPrioridad<T extends Pick<SalidaProyectada, "rubro" | "fechaISO" | "corteKey" | "concepto">>(pagos: readonly T[]): T[] {
  return [...pagos].sort(
    (a, b) =>
      NIVEL_DE_PRIORIDAD[a.rubro] - NIVEL_DE_PRIORIDAD[b.rubro] ||
      a.corteKey.localeCompare(b.corteKey) ||
      (a.fechaISO ?? "9999").localeCompare(b.fechaISO ?? "9999") ||
      a.concepto.localeCompare(b.concepto),
  );
}

/**
 * Recorre los pagos en orden de prioridad contra lo `disponible` (lo libre de hoy más lo que entra hasta el corte del
 * faltante) y marca hasta dónde alcanza.
 */
export function ordenarPagosSiNoAlcanza(
  salidas: readonly SalidaProyectada[],
  disponible: TotalesMoneda,
  crcPorUsd: number | null,
): OrdenDePagos {
  const ordenados = ordenarPorPrioridad(salidas);
  const faltante: TotalesMoneda = { CRC: 0, USD: 0 };
  const pagos: PagoEnOrden[] = [];

  if (crcPorUsd && crcPorUsd > 0) {
    const aUsd = (monto: number, moneda: Moneda) => (moneda === "USD" ? monto : monto / crcPorUsd);
    let queda = round2(disponible.USD + disponible.CRC / crcPorUsd);
    const disponibleEnUsd = queda;
    let corto = false;
    for (const s of ordenados) {
      const usd = aUsd(s.monto, s.moneda);
      const alcanza = !corto && usd <= queda + 0.005;
      if (alcanza) queda = round2(queda - usd);
      else {
        corto = true;
        faltante[s.moneda] = round2(faltante[s.moneda] + s.monto);
      }
      pagos.push({ ...s, nivel: NIVEL_DE_PRIORIDAD[s.rubro], alcanza, quedaDespues: queda });
    }
    return { modo: "EN_DOLARES", disponible, disponibleEnUsd, pagos, faltante, faltanteEnUsd: round2(faltante.USD + faltante.CRC / crcPorUsd) };
  }

  const queda: TotalesMoneda = { ...disponible };
  const corto: Record<Moneda, boolean> = { CRC: false, USD: false };
  for (const s of ordenados) {
    const alcanza = !corto[s.moneda] && s.monto <= queda[s.moneda] + 0.005;
    if (alcanza) queda[s.moneda] = round2(queda[s.moneda] - s.monto);
    else {
      corto[s.moneda] = true;
      faltante[s.moneda] = round2(faltante[s.moneda] + s.monto);
    }
    pagos.push({ ...s, nivel: NIVEL_DE_PRIORIDAD[s.rubro], alcanza, quedaDespues: queda[s.moneda] });
  }
  return { modo: "POR_MONEDA", disponible, disponibleEnUsd: null, pagos, faltante, faltanteEnUsd: null };
}
