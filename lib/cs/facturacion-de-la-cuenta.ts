/**
 * lib/cs/facturacion-de-la-cuenta.ts — cómo va la facturación de UNA cuenta, para Éxito del
 * cliente (2026-10-04). PURO.
 *
 * Pedido de Elías: que el agente vigía alerte también por facturación. Esto lo resume con las
 * MISMAS reglas que Cobranza —`semaforoCobro`, `marcaPromesa` y la gracia de facturación del
 * motor— para que una cuenta no esté «vencida» en una pantalla y «al día» en la otra.
 *
 *  · Vencida = factura EMITIDA y crédito corrido sin pago (el rojo de Cobranza).
 *  · Sin facturar y atrasada = la fecha programada pasó hace más de la gracia y no hay factura:
 *    es trabajo de Smarteam, no deuda del cliente. Se cuenta aparte y nunca suma al vencido.
 *  · Promesa incumplida = el cliente prometió una fecha, pasó, y no pagó.
 *
 * ⛔ Nexus no es contabilidad: esto dice qué conversación hay que tener, no cuánto se debe.
 */
import {
  DEFAULT_CREDITO_DIAS,
  GRACIA_FACTURACION_DIAS,
  addDaysISO,
  diffDays,
  marcaPromesa,
  semaforoCobro,
} from "@/lib/cobranza/engine";
import { fmtMonto, plural } from "./formato";

export interface CobroDeLaCuenta {
  estado: string;
  /** AAAA-MM-DD. */
  fechaProgramada: string;
  fechaEmision: string | null;
  fechaCobro: string | null;
  promesaPago: string | null;
  monto: number;
  moneda: string;
}

export interface FacturacionDeLaCuenta {
  vencidas: { cantidad: number; montos: Record<string, number>; diasMax: number };
  sinFacturarAtrasadas: { cantidad: number; diasMax: number };
  promesasIncumplidas: number;
  /** AAAA-MM-DD del último pago registrado. */
  ultimoPago: string | null;
}

/** null si la cuenta no tiene cobros en Nexus (no está configurada en Cobranza). */
export function resumirFacturacion(
  cobros: readonly CobroDeLaCuenta[],
  hoy: string,
  creditoDias: number | null = null,
): FacturacionDeLaCuenta | null {
  if (cobros.length === 0) return null;
  const credito = creditoDias ?? DEFAULT_CREDITO_DIAS;
  const out: FacturacionDeLaCuenta = {
    vencidas: { cantidad: 0, montos: {}, diasMax: 0 },
    sinFacturarAtrasadas: { cantidad: 0, diasMax: 0 },
    promesasIncumplidas: 0,
    ultimoPago: null,
  };
  for (const c of cobros) {
    if (c.estado === "COBRADO") {
      if (c.fechaCobro && (!out.ultimoPago || c.fechaCobro > out.ultimoPago)) out.ultimoPago = c.fechaCobro;
      continue;
    }
    const semaforo = semaforoCobro(
      { estado: c.estado, fechaProgramadaISO: c.fechaProgramada, fechaEmisionISO: c.fechaEmision },
      hoy,
      credito,
    );
    if (semaforo === "rojo" && c.fechaEmision) {
      const dias = diffDays(addDaysISO(c.fechaEmision, credito), hoy);
      out.vencidas.cantidad++;
      out.vencidas.montos[c.moneda] = (out.vencidas.montos[c.moneda] ?? 0) + c.monto;
      out.vencidas.diasMax = Math.max(out.vencidas.diasMax, dias);
    }
    if (!c.fechaEmision) {
      const dias = diffDays(c.fechaProgramada, hoy) - GRACIA_FACTURACION_DIAS;
      if (dias > 0) {
        out.sinFacturarAtrasadas.cantidad++;
        out.sinFacturarAtrasadas.diasMax = Math.max(out.sinFacturarAtrasadas.diasMax, dias + GRACIA_FACTURACION_DIAS);
      }
    }
    if (marcaPromesa({ estado: c.estado, fechaEmisionISO: c.fechaEmision, promesaPagoISO: c.promesaPago }, hoy) === "incumplida") {
      out.promesasIncumplidas++;
    }
  }
  return out;
}

/** ¿Hay algo de plata que el CLIENTE debe y que amerita la conversación? */
export function hayDeudaDelCliente(f: FacturacionDeLaCuenta | null): boolean {
  return !!f && (f.vencidas.cantidad > 0 || f.promesasIncumplidas > 0);
}

/** «2 facturas vencidas por US$4.200 (la más vieja, hace 38 días)». null si no hay vencidas. */
export function textoDeVencidas(f: FacturacionDeLaCuenta | null): string | null {
  if (!f || f.vencidas.cantidad === 0) return null;
  const montos = Object.entries(f.vencidas.montos)
    .map(([moneda, monto]) => fmtMonto(monto, moneda))
    .join(" y ");
  return `${plural(f.vencidas.cantidad, "factura vencida", "facturas vencidas")} por ${montos} (la más vieja, hace ${f.vencidas.diasMax} días)`;
}
