/**
 * lib/cobranza/venta-duplicada.ts
 *
 * La misma venta contada dos veces en una cuenta. PURO: sin Prisma, sin red, sin reloj. Lo usan «Lo que no cuadra»
 * (odoo/diferencias.ts) y la carga del Excel de Alexander (libro-alex-carga-completa.ts), con la misma regla.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────
 * Medido el 2026-09-14, después de aplicar el Excel en producción:
 *  · Real Shipping INV-9 (US$6.000, 15-ene) entró cobrada en un servicio del libro, y la cuenta ya tenía en su
 *    servicio de implementación las cuotas 1 y 2 (US$1.500 cada una, facturadas el 16-ene, cobradas). El detector de
 *    la carga no saltó porque 1.500 + 1.500 no es 6.000, y Real Shipping pasó a US$9.000 cobrados.
 *  · Alliance RH INV-46 (US$120, 7-ago) entró cobrada, y el servicio «Capacitación Sales» (US$240, arranca el 15-ago,
 *    entrada del 50 %) todavía no tiene cobros: si alguien los genera, la entrada se cuenta dos veces.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────
 * Una factura con número —uno o varios cobros con ese número— puede ser la misma venta que:
 *  · cuotas de OTRO servicio de la misma cuenta y moneda, sin número (un número distinto ya dice que son otra factura),
 *    con su fecha —la de emisión, o la programada si no se facturó— a hasta `DIAS_CERCA_DE_LA_VENTA` días, y cada una
 *    por no más que la factura: juntas o por separado podrían ser ella;
 *  · un servicio activo de la misma cuenta y moneda que todavía no generó cobros, que arranca a hasta esos días y vale
 *    al menos la factura.
 * Medido sobre los 234 cobros de producción: con 15 días salen exactamente Real Shipping y Alliance RH; con 31 se suma
 * Multiquimica INV-38 contra una cuota programada a 19 días en otro servicio, que es otra venta.
 *
 * ⛔ Avisa y nada más: no junta, no revierte, no anota. Si es la misma venta lo decide una persona.
 */
import { centavos, fmtMontoLibro } from "./montos";
import { normalizarNumeroFactura } from "./numero-factura";

/** Una quincena: el ritmo de la cobranza de la casa, el mismo de la gracia de la copia de Odoo. */
export const DIAS_CERCA_DE_LA_VENTA = 15;

/** Lo mínimo de un cobro de Nexus. `CobroParaCruzar` y `CobroParaLibro` lo cumplen tal cual. */
export type CuotaDeVenta = {
  id: string;
  cuentaId: string;
  servicioId: string;
  /** La descripción del servicio, para decir de cuál es la cuota. */
  servicio: string;
  fechaProgramada: string;
  fechaEmision: string | null;
  monto: number;
  moneda: string;
  estado: string;
  numeroFactura: string | null;
};

/** Un servicio contratado, con cuántos cobros generó. */
export type ServicioDeVenta = {
  id: string;
  cuentaId: string;
  descripcion: string;
  moneda: string;
  montoTotal: number;
  /** `YYYY-MM-DD`, el arranque de la facturación. null = sin arranque. */
  fechaInicio: string | null;
  activo: boolean;
  cobros: number;
};

/** Una factura con número: la de uno o varios cobros de Nexus, o la que la carga del Excel está por cargar. */
export type FacturaDeVenta = {
  cuentaId: string;
  numero: string;
  /** `YYYY-MM-DD`, la de emisión. */
  fecha: string;
  monto: number;
  moneda: string;
  /** Los cobros que ya la tienen anotada: no pueden ser «la otra». Vacío = todavía no está en Nexus. */
  cobroIds: readonly string[];
  /** Los servicios de esos cobros: una cuota del mismo servicio es parte de la misma venta, no una copia. */
  servicioIds: readonly string[];
};

export type VentaQuePuedeSerLaMisma = {
  factura: FacturaDeVenta;
  /** En orden de fecha. */
  cuotas: CuotaDeVenta[];
  servicios: ServicioDeVenta[];
};

const DIA = 86_400_000;
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Un dólar o el 5 %: 712,50 contra 712 es el mismo monto (la misma tolerancia que la carga del Excel). */
const conTolerancia = (cents: number) => cents + Math.max(100, Math.round(cents * 0.05));
const fechaDe = (c: Pick<CuotaDeVenta, "fechaEmision" | "fechaProgramada">) => c.fechaEmision ?? c.fechaProgramada;

/** Lo que puede ser la misma venta que esta factura, o null si no hay nada cerca. */
export function laMismaVenta(
  factura: FacturaDeVenta,
  cuotas: readonly CuotaDeVenta[],
  servicios: readonly ServicioDeVenta[],
): VentaQuePuedeSerLaMisma | null {
  const tope = conTolerancia(centavos(factura.monto));
  const suyas = new Set(factura.cobroIds);
  const susServicios = new Set(factura.servicioIds);
  const cercanas = cuotas
    .filter(
      (c) =>
        c.cuentaId === factura.cuentaId &&
        c.moneda === factura.moneda &&
        !suyas.has(c.id) &&
        !susServicios.has(c.servicioId) &&
        !normalizarNumeroFactura(c.numeroFactura) &&
        c.estado !== "SIN_DATO" &&
        dias(fechaDe(c), factura.fecha) <= DIAS_CERCA_DE_LA_VENTA &&
        centavos(c.monto) <= tope,
    )
    .sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)) || a.id.localeCompare(b.id));
  const sinCobros = servicios
    .filter(
      (s) =>
        s.cuentaId === factura.cuentaId &&
        s.moneda === factura.moneda &&
        s.activo &&
        s.cobros === 0 &&
        !susServicios.has(s.id) &&
        s.fechaInicio !== null &&
        dias(s.fechaInicio, factura.fecha) <= DIAS_CERCA_DE_LA_VENTA &&
        centavos(factura.monto) <= conTolerancia(centavos(s.montoTotal)),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return cercanas.length || sinCobros.length ? { factura, cuotas: cercanas, servicios: sinCobros } : null;
}

/**
 * Todas las facturas con número de estos cobros, una vez cada una (una factura de varias cuotas junta sus cobros),
 * con lo que puede ser la misma venta. Ecoquintas FAC/2026/0336 cubre dos servicios y no se acusa: las dos cuotas
 * tienen su número.
 */
export function ventasContadasDosVeces(cobros: readonly CuotaDeVenta[], servicios: readonly ServicioDeVenta[]): VentaQuePuedeSerLaMisma[] {
  const facturas = new Map<string, { cuentaId: string; numero: string; moneda: string; cobros: CuotaDeVenta[] }>();
  for (const c of cobros) {
    const numero = normalizarNumeroFactura(c.numeroFactura);
    if (!numero || c.estado === "SIN_DATO") continue;
    const k = `${c.cuentaId}|${c.moneda}|${numero}`;
    const g = facturas.get(k) ?? { cuentaId: c.cuentaId, numero, moneda: c.moneda, cobros: [] };
    g.cobros.push(c);
    facturas.set(k, g);
  }
  const out: VentaQuePuedeSerLaMisma[] = [];
  for (const g of facturas.values()) {
    const [fecha] = g.cobros.map(fechaDe).sort();
    if (!fecha) continue;
    const v = laMismaVenta(
      {
        cuentaId: g.cuentaId,
        numero: g.numero,
        fecha,
        monto: round2(g.cobros.reduce((a, c) => a + c.monto, 0)),
        moneda: g.moneda,
        cobroIds: g.cobros.map((c) => c.id),
        servicioIds: [...new Set(g.cobros.map((c) => c.servicioId))],
      },
      cobros,
      servicios,
    );
    if (v) out.push(v);
  }
  return out.sort((a, b) => a.factura.fecha.localeCompare(b.factura.fecha) || a.factura.numero.localeCompare(b.factura.numero));
}

/**
 * Lo que puede estar contado dos veces, con una clave por cosa: cada cuota con su monto (`c:`, la misma clave que usa
 * «Lo que no cuadra», así una cuota que ya mira otra línea suma una vez) y cada servicio hasta el monto de la factura
 * (`s:`).
 */
export function plataEnDuda(v: VentaQuePuedeSerLaMisma): Array<{ clave: string; moneda: string; monto: number }> {
  return [
    ...v.cuotas.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto })),
    ...v.servicios.map((s) => ({ clave: `s:${s.id}`, moneda: s.moneda, monto: Math.min(s.montoTotal, v.factura.monto) })),
  ];
}

const ESTADO_DE_LA_CUOTA: Readonly<Record<string, string>> = { PROGRAMADO: "programada", POR_COBRAR: "por cobrar", COBRADO: "cobrada" };

/**
 * En palabras: «US$1.500 facturada el 2026-01-16 (cobrada) + US$1.500 facturada el 2026-01-16 (cobrada), de «Real
 * Shipping»» y «el servicio «Capacitación Sales» (US$240, arranca el 2026-08-15, todavía sin cobros)».
 */
export function textoDeLaMismaVenta(v: Pick<VentaQuePuedeSerLaMisma, "cuotas" | "servicios">): string {
  const porServicio = new Map<string, CuotaDeVenta[]>();
  for (const c of v.cuotas) porServicio.set(c.servicio, [...(porServicio.get(c.servicio) ?? []), c]);
  const cuota = (c: CuotaDeVenta) =>
    `${fmtMontoLibro(c.monto, c.moneda)} ${c.fechaEmision ? `facturada el ${c.fechaEmision}` : `programada el ${c.fechaProgramada}`} (${ESTADO_DE_LA_CUOTA[c.estado] ?? c.estado.toLowerCase()})`;
  return [
    ...[...porServicio].map(([servicio, cs]) => `${cs.map(cuota).join(" + ")}, de «${servicio}»`),
    ...v.servicios.map(
      (s) => `el servicio «${s.descripcion}» (${fmtMontoLibro(s.montoTotal, s.moneda)}, arranca el ${s.fechaInicio ?? "?"}, todavía sin cobros)`,
    ),
  ].join(" · ");
}
