/**
 * lib/finanzas/caja/semana.ts — la lista de pagos de cada semana (2026-11-13). PURO.
 *
 * La semana va de lunes a domingo. En la de hoy entra también lo atrasado (su día ya pasó y no se pagó): se debe ya.
 * Lo que espera algo (la factura, que el cliente pague, la entrega) no se paga todavía; se muestra aparte, en
 * «Esperando», en la semana en que se estima que podría salir.
 *
 * Lo que entra a la lista: los pagos comprometidos (con la fecha de la política, politica.ts), la planilla de la
 * quincena (sumada), las comisiones de vendedor y los gastos anotados con día. Las herramientas y los costos fijos
 * recurrentes no: no tienen día de pago anotado (la mayoría se cobra sola en una tarjeta).
 */
import { lunesDeLaSemana, sumarDiasISO, type EstadoDelPago } from "./politica";
import type { Moneda, TotalesMoneda } from "./proyeccion";

export interface PagoDeLaSemana {
  clave: string;
  concepto: string;
  beneficiario: string | null;
  /** Qué es: «Planilla», «Servicios profesionales u outsourcing»… */
  tipo: string;
  monto: number;
  moneda: Moneda;
  /** El día de la regla. null = espera algo. */
  fechaISO: string | null;
  fechaEstimadaISO: string;
  estado: EstadoDelPago;
  atrasado: boolean;
  porQue: string;
  /** Si sale de un pago comprometido: para marcarlo pagado desde la lista. */
  compromisoId: string | null;
  parte: "TOTAL" | "ADELANTO" | "RESTO" | null;
}

export interface SemanaDePagos {
  desdeISO: string;
  hastaISO: string;
  esLaDeHoy: boolean;
  pagos: PagoDeLaSemana[];
  esperando: PagoDeLaSemana[];
  total: TotalesMoneda;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function pagosPorSemana(items: readonly PagoDeLaSemana[], hoyISO: string, semanas = 2): SemanaDePagos[] {
  const lunes = lunesDeLaSemana(hoyISO);
  const out: SemanaDePagos[] = [];
  for (let k = 0; k < semanas; k++) {
    const desde = sumarDiasISO(lunes, 7 * k);
    const hasta = sumarDiasISO(desde, 6);
    const enEsta = (f: string) => (k === 0 ? f <= hasta : f >= desde && f <= hasta);
    const pagos = items
      .filter((p) => p.fechaISO !== null && enEsta(p.fechaISO))
      .sort((a, b) => (a.fechaISO ?? "").localeCompare(b.fechaISO ?? "") || a.concepto.localeCompare(b.concepto));
    const esperando = items
      .filter((p) => p.fechaISO === null && enEsta(p.fechaEstimadaISO))
      .sort((a, b) => a.fechaEstimadaISO.localeCompare(b.fechaEstimadaISO) || a.concepto.localeCompare(b.concepto));
    const total: TotalesMoneda = { CRC: 0, USD: 0 };
    for (const p of pagos) total[p.moneda] = round2(total[p.moneda] + p.monto);
    out.push({ desdeISO: desde, hastaISO: hasta, esLaDeHoy: k === 0, pagos, esperando, total });
  }
  return out;
}
