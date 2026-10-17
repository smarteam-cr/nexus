/**
 * lib/finanzas/gastos-financieros.ts — las comisiones de Stripe, de las transferencias internacionales y del banco, como
 * gasto financiero (plan «Un solo libro financiero», paso 4, 2026-10-17). PURO: sin Prisma, sin red, sin reloj.
 *
 * Decisión de Alex (16-oct): las comisiones de Stripe y del banco son gasto financiero, y se revisan movimiento por
 * movimiento. Hasta hoy no estaban en ningún lado: una factura de US$1.000 pagada con tarjeta entraba como US$970,70 y
 * la diferencia no era ni ingreso ni gasto.
 *
 * ── DE DÓNDE SALE CADA CANDIDATO (todo de la copia de Mercury) ─────────────────
 *  1. CARGO: un movimiento que sale y ES una comisión (el tipo de Mercury dice «fee», o la descripción dice comisión,
 *     fee o cargo por transferencia). El monto es el del cargo, exacto.
 *  2. CALZA: una entrada de plata atada a una factura de Mercury pagada (`entradasDeFacturas`, la misma regla de «Lo que
 *     no cuadra») que llegó con menos de lo facturado. La diferencia es la comisión, exacta para esa factura.
 *  3. ESTIMADO: un depósito de Stripe que no se ata a ninguna factura. La comisión se estima con la tarifa base de
 *     Stripe (2,9 % + US$0,30 sobre el bruto) y la persona la corrige con el reporte de Stripe: un depósito junta
 *     varios cobros, y la tarjeta internacional (+1,5 %) o la conversión (+1 %) la suben.
 * Qué es (Stripe, transferencia internacional o banco) lo dice quién pagó y cómo: Stripe por su nombre; internacional
 * por el tipo de Mercury o por el «1/» que ponen las transferencias internacionales delante del nombre.
 *
 * ⛔ Nada entra solo al punto de equilibrio: una persona confirma cada uno («Es gasto financiero», con su monto) o lo
 * descarta («No es»). Solo los confirmados suman, en el rubro FINANCIERO.
 */

export type TipoGastoFinanciero = "STRIPE" | "TRANSFERENCIA_INTERNACIONAL" | "BANCO";
export const TIPOS_GASTO_FINANCIERO: readonly TipoGastoFinanciero[] = ["STRIPE", "TRANSFERENCIA_INTERNACIONAL", "BANCO"];

export const ETIQUETA_TIPO: Readonly<Record<TipoGastoFinanciero, string>> = {
  STRIPE: "Comisión de Stripe",
  TRANSFERENCIA_INTERNACIONAL: "Transferencia internacional",
  BANCO: "Comisión del banco",
};

/** La tarifa base de Stripe (Alex, 16-oct): 2,9 % + US$0,30 por cobro. +1,5 % con tarjeta internacional, +1 % con conversión. */
export const TARIFA_STRIPE = { pct: 0.029, fijo: 0.3 } as const;

/** Los estados de un movimiento que no movieron plata. */
const NO_MOVIERON = new Set(["failed", "cancelled", "reversed", "blocked"]);

export interface MovimientoParaRevisar {
  id: string;
  /** Con signo: positivo entra, negativo sale. En dólares. */
  monto: number;
  estado: string;
  tipo: string;
  contraparteNombre: string | null;
  descripcionBanco: string | null;
  nota: string | null;
  conTarjeta: boolean;
  /** `YYYY-MM-DD`. */
  fecha: string;
}

/** Una entrada de plata atada a una factura de Mercury pagada. */
export interface PagoDeFactura {
  entradaId: string;
  facturaNumero: string;
  facturaMonto: number;
  cliente: string;
}

export type ComoSeCalculo = "CARGO" | "CALZA" | "ESTIMADO";

export interface CandidatoFinanciero {
  movimientoId: string;
  tipo: TipoGastoFinanciero;
  fecha: string;
  moneda: "USD";
  /** Lo que propone Nexus. Siempre > 0. */
  montoPropuesto: number;
  como: ComoSeCalculo;
  /** Una línea para la persona: qué movimiento y por qué es una comisión. */
  descripcion: string;
  /** El monto del movimiento (con signo), para mostrarlo. */
  montoMovimiento: number;
  quien: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const centavos = (n: number) => Math.round(n * 100);

const esStripe = (m: Pick<MovimientoParaRevisar, "contraparteNombre" | "descripcionBanco">) =>
  /stripe/i.test(m.contraparteNombre ?? "") || /stripe/i.test(m.descripcionBanco ?? "");
const esInternacional = (m: Pick<MovimientoParaRevisar, "tipo" | "contraparteNombre" | "descripcionBanco">) =>
  /international/i.test(m.tipo) || /^\d+\//.test(m.contraparteNombre ?? "") || /internacional|international|swift/i.test(m.descripcionBanco ?? "");

/** Si un movimiento que sale es una comisión. Una compra con tarjeta NO, salvo el cargo por usarla afuera. */
export function esCargoDeComision(m: MovimientoParaRevisar): boolean {
  if (m.monto >= 0 || NO_MOVIERON.has(m.estado)) return false;
  if (/fee/i.test(m.tipo)) return true;
  if (m.conTarjeta) return false;
  const textos = [m.descripcionBanco, m.nota, m.contraparteNombre].filter(Boolean).join(" ");
  return /\b(fee|fees|comisi[oó]n|cargo por transferencia|wire charge)\b/i.test(textos);
}

export function tipoDe(m: Pick<MovimientoParaRevisar, "tipo" | "contraparteNombre" | "descripcionBanco">): TipoGastoFinanciero {
  if (esStripe(m)) return "STRIPE";
  if (esInternacional(m)) return "TRANSFERENCIA_INTERNACIONAL";
  return "BANCO";
}

/** La comisión de Stripe estimada sobre un depósito neto: el bruto que, menos la tarifa base, da ese neto. */
export function comisionStripeEstimada(neto: number): number {
  if (!(neto > 0)) return 0;
  const bruto = (neto + TARIFA_STRIPE.fijo) / (1 - TARIFA_STRIPE.pct);
  return round2(bruto - neto);
}

/**
 * Los candidatos a gasto financiero desde `desde` (`YYYY-MM-DD`), el más nuevo primero. Un movimiento da, como mucho,
 * UN candidato: si una entrada calza con su factura, no se estima además.
 */
export function candidatosDeGastoFinanciero(
  movimientos: readonly MovimientoParaRevisar[],
  pagos: readonly PagoDeFactura[],
  desde: string,
): CandidatoFinanciero[] {
  const pagoDe = new Map(pagos.map((p) => [p.entradaId, p]));
  const out: CandidatoFinanciero[] = [];
  for (const m of movimientos) {
    if (m.fecha < desde || NO_MOVIERON.has(m.estado)) continue;
    const quien = m.contraparteNombre?.trim() || m.descripcionBanco?.trim() || "—";
    if (esCargoDeComision(m)) {
      out.push({
        movimientoId: m.id,
        tipo: tipoDe(m),
        fecha: m.fecha,
        moneda: "USD",
        montoPropuesto: round2(-m.monto),
        como: "CARGO",
        descripcion: `Cargo de ${quien}${m.descripcionBanco && m.descripcionBanco !== quien ? ` («${m.descripcionBanco}»)` : ""}.`,
        montoMovimiento: m.monto,
        quien,
      });
      continue;
    }
    if (m.monto <= 0) continue;
    const pago = pagoDe.get(m.id);
    if (pago) {
      const dif = centavos(pago.facturaMonto) - centavos(m.monto);
      if (dif <= 0) continue;
      out.push({
        movimientoId: m.id,
        tipo: tipoDe(m),
        fecha: m.fecha,
        moneda: "USD",
        montoPropuesto: dif / 100,
        como: "CALZA",
        descripcion: `Pago de la ${pago.facturaNumero} (${pago.cliente}): la factura es de US$${pago.facturaMonto.toFixed(2)} y entraron US$${m.monto.toFixed(2)}.`,
        montoMovimiento: m.monto,
        quien,
      });
      continue;
    }
    if (esStripe(m)) {
      out.push({
        movimientoId: m.id,
        tipo: "STRIPE",
        fecha: m.fecha,
        moneda: "USD",
        montoPropuesto: comisionStripeEstimada(m.monto),
        como: "ESTIMADO",
        descripcion: `Depósito de Stripe por US$${m.monto.toFixed(2)} que no se ata a una factura. La comisión es un estimado con la tarifa base: confírmala con el reporte de Stripe.`,
        montoMovimiento: m.monto,
        quien,
      });
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.movimientoId.localeCompare(b.movimientoId));
}

/** Lo que una persona ya decidió sobre un movimiento. */
export interface GastoFinancieroDecidido {
  id: string;
  movimientoMercuryId: string;
  tipo: TipoGastoFinanciero;
  decision: "GASTO" | "NO_ES";
  fecha: string;
  monto: number;
  moneda: string;
  montoPropuesto: number | null;
  descripcion: string;
  decididoPor: string;
  decididoEn: string;
  nota: string | null;
}

export interface RevisionFinanciera {
  /** Los que esperan una decisión. */
  pendientes: CandidatoFinanciero[];
  /** Los decididos, el más nuevo primero. */
  decididos: GastoFinancieroDecidido[];
  /** Lo confirmado como gasto, por tipo, en dólares. */
  totales: Record<TipoGastoFinanciero, number>;
}

export function revisionFinanciera(candidatos: readonly CandidatoFinanciero[], decididos: readonly GastoFinancieroDecidido[]): RevisionFinanciera {
  const ya = new Set(decididos.map((d) => d.movimientoMercuryId));
  const totales = { STRIPE: 0, TRANSFERENCIA_INTERNACIONAL: 0, BANCO: 0 } as Record<TipoGastoFinanciero, number>;
  for (const d of decididos) if (d.decision === "GASTO") totales[d.tipo] = round2(totales[d.tipo] + d.monto);
  return {
    pendientes: candidatos.filter((c) => !ya.has(c.movimientoId)),
    decididos: [...decididos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.decididoEn.localeCompare(a.decididoEn)),
    totales,
  };
}

/** Las líneas del rubro FINANCIERO del punto de equilibrio: solo lo confirmado como gasto, una por movimiento. */
export function egresosFinancieros(decididos: readonly GastoFinancieroDecidido[]) {
  return decididos
    .filter((d) => d.decision === "GASTO" && d.monto > 0)
    .map((d) => ({
      periodo: d.fecha.slice(0, 7),
      concepto: ETIQUETA_TIPO[d.tipo],
      conceptoClave: `financiero-${d.tipo.toLowerCase()}`,
      monto: d.monto,
      moneda: d.moneda,
      fechaISO: d.fecha,
    }));
}
