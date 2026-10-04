/**
 * lib/finanzas/facturado-sin-cuenta.ts
 *
 * Lo que Odoo facturó en el año a clientes que NO tienen cuenta en Nexus: la plata que el punto de equilibrio no ve.
 * PURO: sin Prisma, sin red y sin reloj. La conversión de moneda entra por parámetro (`convertir()` de equilibrio.ts
 * sigue siendo el único punto de conversión del sistema).
 *
 * ── POR QUÉ EXISTE (revisión con Alex, 2026-09-29) ──────────────────────────────
 * El tablero se arma con los COBROS de Nexus, no con las facturas de Odoo. Si a un cliente se le factura en Odoo y
 * nadie le creó la cuenta en Nexus, no tiene cobros, y sus facturas no entran ni a «Facturado» ni a «Cobrado»: el año
 * se ve más chico de lo que es y nada lo dice.
 *
 * Medido ese día: el tablero mostraba US$277.343 facturados en 2026, y Odoo tenía además 28 facturas por
 * US$143.772 + ₡69,3 millones de 7 clientes sin cuenta (US$282.324 a la tasa del tablero): el año facturado era el
 * doble de lo que se veía. Casi todo son Publimark y McCann, que en Nexus no existen (el trato «KOLBI ICE | SALES
 * HUB», de US$108.000, cuelga de «kölbi», que no tiene cuenta de cobro).
 *
 * ⛔ No suma esas facturas al tablero: lo dice, con su monto, para que alguien cree la cuenta. Sumarlas haría que el
 * mismo negocio contara dos veces el día que se carguen sus cobros, y el tablero tendría dos fuentes para una cifra.
 */
import { esDocumentoVivo, estaPorCobrar, montosPorMoneda, textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import type { ItemInconsistencia } from "./inconsistencias";

/** Una factura de la copia de Odoo cuyo cliente no está vinculado a ninguna cuenta de Nexus. */
export interface FacturaDeOdooSinCuenta {
  odooPartnerId: number;
  odooPartnerNombre: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  /** Sin IVA, como todo Nexus. */
  montoNeto: number;
  moneda: string;
  moveType: string;
  state: string;
  paymentState: string;
}

export interface FacturadoSinCuenta {
  /** Facturas vivas del año, sin cuenta. */
  cuantas: number;
  clientes: number;
  /** En la moneda del reporte. Lo que no se pudo convertir NO está sumado. */
  monto: number;
  /** Facturas que no se pudieron convertir por falta de tipo de cambio de su mes. */
  sinTasa: number;
  /** Una fila por cliente de Odoo, la más grande primero. */
  items: ItemInconsistencia[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const round2 = (n: number) => Math.round(n * 100) / 100;
const mesDe = (periodo: string) => MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo;

/**
 * Las facturas vivas del año sin cuenta, por cliente de Odoo.
 *
 * Solo facturas propiamente dichas y vivas (`esDocumentoVivo`): una nota de crédito corrige una factura, no es venta,
 * y una factura revertida o anulada no se le cobra a nadie. Es la misma regla que usa «Lo que no cuadra».
 *
 * `aPresentacion` convierte a la moneda del reporte con la tasa del mes; null = ese mes no tiene tasa. ⛔ Sin tasa no
 * se aproxima: la factura se cuenta, su monto nativo se muestra y el total no la suma.
 */
export function facturadoEnOdooSinCuenta(
  facturas: readonly FacturaDeOdooSinCuenta[],
  anio: number,
  aPresentacion: (monto: number, moneda: string, periodo: string) => number | null,
): FacturadoSinCuenta {
  const delAnio = facturas.filter((f) => esDocumentoVivo(f) && f.invoiceDate.startsWith(`${anio}-`));
  const porCliente = new Map<number, { nombre: string; facturas: FacturaDeOdooSinCuenta[] }>();
  for (const f of delAnio) {
    const c = porCliente.get(f.odooPartnerId) ?? { nombre: f.odooPartnerNombre, facturas: [] };
    c.facturas.push(f);
    porCliente.set(f.odooPartnerId, c);
  }

  let sinTasa = 0;
  const filas = [...porCliente.values()].map((c) => {
    let monto = 0;
    for (const f of c.facturas) {
      const convertido = aPresentacion(f.montoNeto, f.moneda, f.invoiceDate.slice(0, 7));
      if (convertido === null) sinTasa++;
      else monto += convertido;
    }
    const periodos = c.facturas.map((f) => f.invoiceDate.slice(0, 7)).sort();
    const [desde, hasta] = [periodos[0]!, periodos[periodos.length - 1]!];
    const porCobrar = c.facturas.filter(estaPorCobrar).length;
    const nota = [
      c.facturas.length === 1 ? "1 factura" : `${c.facturas.length} facturas`,
      `${textoDeMontos(montosPorMoneda(c.facturas.map((f) => ({ monto: f.montoNeto, moneda: f.moneda }))))} sin IVA`,
      desde === hasta ? `de ${mesDe(desde)}` : `de ${mesDe(desde)} a ${mesDe(hasta)}`,
      porCobrar > 0 ? `${porCobrar} sin pagar en Odoo` : "todas pagadas en Odoo",
    ].join(" · ");
    return { texto: c.nombre, monto: round2(monto), nota };
  });
  filas.sort((a, b) => b.monto - a.monto || a.texto.localeCompare(b.texto, "es"));

  return {
    cuantas: delAnio.length,
    clientes: porCliente.size,
    monto: round2(filas.reduce((n, f) => n + f.monto, 0)),
    sinTasa,
    items: filas,
  };
}

// ── Mercury (rediseño de Finanzas, 2026-10-03) ────────────────────────────────────
// En Mercury el problema no es que falte la cuenta: los clientes de afuera casi todos tienen su cuenta en Nexus. Lo que
// falta es EMPAREJARLOS (decir qué cuenta es cada cliente de Mercury). Mientras no lo estén, no se puede saber si una
// factura sin pagar está en «Por cobrar» del tablero (si alguien marcó la cuota facturada) o falta. Por eso esto no
// suma a nada ni dice «falta»: dice cuánto hay sin poder comprobar.

/** Una factura de la copia de Mercury cuyo cliente no está emparejado con una cuenta de Nexus. */
export interface FacturaDeMercurySinEmparejar {
  mercuryCustomerId: string;
  clienteNombre: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  monto: number;
  moneda: string;
  /** Unpaid · Paid · Cancelled · Processing, como los dice Mercury. */
  estado: string;
}

/** Lo que Mercury tiene sin pagar del año, de clientes sin emparejar, por cliente. */
export function porCobrarEnMercurySinEmparejar(
  facturas: readonly FacturaDeMercurySinEmparejar[],
  anio: number,
  aPresentacion: (monto: number, moneda: string, periodo: string) => number | null,
): FacturadoSinCuenta {
  const delAnio = facturas.filter(
    (f) => f.invoiceDate.startsWith(`${anio}-`) && f.estado !== "Paid" && f.estado !== "Cancelled",
  );
  const porCliente = new Map<string, { nombre: string; facturas: FacturaDeMercurySinEmparejar[] }>();
  for (const f of delAnio) {
    const c = porCliente.get(f.mercuryCustomerId) ?? { nombre: f.clienteNombre, facturas: [] };
    c.facturas.push(f);
    porCliente.set(f.mercuryCustomerId, c);
  }
  let sinTasa = 0;
  const filas = [...porCliente.values()].map((c) => {
    let monto = 0;
    for (const f of c.facturas) {
      const convertido = aPresentacion(f.monto, f.moneda, f.invoiceDate.slice(0, 7));
      if (convertido === null) sinTasa++;
      else monto += convertido;
    }
    const periodos = c.facturas.map((f) => f.invoiceDate.slice(0, 7)).sort();
    const [desde, hasta] = [periodos[0]!, periodos[periodos.length - 1]!];
    const nota = [
      c.facturas.length === 1 ? "1 factura sin pagar" : `${c.facturas.length} facturas sin pagar`,
      textoDeMontos(montosPorMoneda(c.facturas.map((f) => ({ monto: f.monto, moneda: f.moneda })))),
      desde === hasta ? `de ${mesDe(desde)}` : `de ${mesDe(desde)} a ${mesDe(hasta)}`,
    ].join(" · ");
    return { texto: c.nombre, monto: round2(monto), nota };
  });
  filas.sort((a, b) => b.monto - a.monto || a.texto.localeCompare(b.texto, "es"));
  return {
    cuantas: delAnio.length,
    clientes: porCliente.size,
    monto: round2(filas.reduce((n, f) => n + f.monto, 0)),
    sinTasa,
    items: filas,
  };
}
