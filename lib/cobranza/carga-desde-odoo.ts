/**
 * lib/cobranza/carga-desde-odoo.ts
 *
 * Qué cobros hay que cargar en una cuenta para que Nexus tenga lo que Odoo ya le facturó. PURO: sin Prisma, sin red
 * y sin reloj. Lo usa scripts/cargar-cuenta-desde-odoo.ts, que lee la copia de Odoo, arma el plan con esto y, con
 * permiso, escribe por los chokepoints de siempre.
 *
 * ── POR QUÉ EXISTE (2026-09-30) ─────────────────────────────────────────────────
 * El punto de equilibrio se arma con los cobros de Nexus. kölbi le factura a Smarteam a través de dos agencias,
 * Publimark y McCann, y en Nexus no tenía cuenta: sus 17 facturas de 2026 (US$134.750 + ₡69,2 millones) no entraban
 * a ningún número, y el tablero mostraba la mitad de lo facturado del año. Elías pidió cargarla.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 * - Entra una factura VIVA del año (`esDocumentoVivo`: ni revertida ni anulada). Las notas de crédito no son
 *   cobros: corrigen una factura.
 * - ⚠ Una factura sin pagar con una nota de crédito sin aplicar del MISMO cliente, el MISMO día y el MISMO total no
 *   entra: casi seguro la nota la anuló y nadie las concilió en Odoo. Medido en Publimark: FAC/2026/0210 y la nota
 *   FAC/2026/0246, US$13.475 las dos, del 12 de febrero, y ninguna dice en Odoo a qué documento corrige. Se lista
 *   aparte, para conciliarla en Odoo; si resulta que la factura sí se debe, se carga a mano.
 * - Entra por su monto SIN IVA (`montoNeto`), en su moneda: los cobros de Nexus van sin IVA y nunca se convierten.
 * - Pagada en Odoo → cobrada, con la fecha en que entró la plata según la conciliación del banco. ⛔ Solo si quien
 *   carga firma el cobro (`cobrarConFirma`) y la fecha se conoce: COBRADO exige una persona (INV3). Si no, entra por
 *   cobrar, y se dice que Odoo la da pagada.
 * - Pagada a medias → por cobrar: todavía falta plata.
 * - Un número que ya está en algún cobro no se carga otra vez: correr la carga dos veces no duplica nada.
 */
import { esDocumentoVivo } from "./odoo/diferencias";

/** Un documento de la copia de Odoo, como lo lee la carga. */
export interface DocumentoDeOdoo {
  numero: string;
  odooPartnerId: number;
  odooPartnerNombre: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  moveType: string;
  state: string;
  paymentState: string;
  montoNeto: number;
  montoTotal: number;
  montoResidual: number;
  moneda: string;
}

export interface CobroDesdeOdoo {
  numero: string;
  odooPartnerId: number;
  odooPartnerNombre: string;
  /** Fecha de la factura: es la fecha de emisión y la programada del cobro. */
  fecha: string;
  periodo: string;
  /** Sin IVA. */
  monto: number;
  moneda: "USD" | "CRC";
  /** Entra cobrado (con firma) o por cobrar. */
  estado: "COBRADO" | "POR_COBRAR";
  /** Solo si entra cobrado: el día en que la plata entró al banco. */
  fechaCobro: string | null;
  /** Qué hay que saber de esta factura, en palabras. */
  nota: string | null;
}

export interface PlanDeCargaDesdeOdoo {
  aCargar: CobroDesdeOdoo[];
  /** Números que ya están en algún cobro de Nexus: no se tocan. */
  yaEstaban: string[];
  /** Facturas que parecen anuladas por una nota de crédito sin aplicar: no entran y hay que conciliarlas en Odoo. */
  anuladasPorNota: Array<{ numero: string; nota: string; monto: number; moneda: string; fecha: string }>;
  /** Lo que no entra, con el motivo (revertidas, anuladas, de otro año, en otra moneda…). */
  noEntran: Array<{ numero: string; motivo: string }>;
  /** Lo que se carga, sumado por moneda y sin IVA. */
  totales: Record<"USD" | "CRC", number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const PAGADA = new Set(["paid", "in_payment"]);

export function planDeCargaDesdeOdoo(
  documentos: readonly DocumentoDeOdoo[],
  opciones: {
    anio: number;
    /** Números de factura que ya tienen un cobro en Nexus, de cualquier cuenta. */
    numerosEnCobros: ReadonlySet<string>;
    /** Número → día en que Odoo registró la plata en el banco. */
    fechasDePago: ReadonlyMap<string, string>;
    /** true = quien carga firma los cobros de las facturas pagadas (INV3). */
    cobrarConFirma: boolean;
  },
): PlanDeCargaDesdeOdoo {
  const delAnio = (d: DocumentoDeOdoo) => d.invoiceDate.startsWith(`${opciones.anio}-`);
  const plan: PlanDeCargaDesdeOdoo = { aCargar: [], yaEstaban: [], anuladasPorNota: [], noEntran: [], totales: { USD: 0, CRC: 0 } };

  /* Las notas de crédito sin aplicar, cada una puede anular UNA factura. */
  const notasLibres = documentos.filter(
    (d) => d.moveType === "out_refund" && d.state !== "cancel" && d.paymentState === "not_paid" && d.montoResidual > 0,
  );
  const usadas = new Set<string>();
  const notaQueLaAnula = (f: DocumentoDeOdoo) =>
    f.paymentState === "not_paid"
      ? notasLibres.find(
          (n) =>
            !usadas.has(n.numero) &&
            n.odooPartnerId === f.odooPartnerId &&
            n.moneda === f.moneda &&
            n.invoiceDate === f.invoiceDate &&
            round2(n.montoTotal) === round2(f.montoTotal),
        )
      : undefined;

  const ordenadas = [...documentos].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.numero.localeCompare(b.numero));
  for (const d of ordenadas) {
    if (d.moveType !== "out_invoice") continue;
    if (!delAnio(d)) {
      plan.noEntran.push({ numero: d.numero, motivo: `es de ${d.invoiceDate.slice(0, 4)}, no de ${opciones.anio}` });
      continue;
    }
    if (!esDocumentoVivo(d)) {
      plan.noEntran.push({ numero: d.numero, motivo: d.paymentState === "reversed" ? "está revertida en Odoo" : "está anulada en Odoo" });
      continue;
    }
    if (d.moneda !== "USD" && d.moneda !== "CRC") {
      plan.noEntran.push({ numero: d.numero, motivo: `está en ${d.moneda}: Nexus cobra en dólares o en colones` });
      continue;
    }
    if (opciones.numerosEnCobros.has(d.numero)) {
      plan.yaEstaban.push(d.numero);
      continue;
    }
    const nota = notaQueLaAnula(d);
    if (nota) {
      usadas.add(nota.numero);
      plan.anuladasPorNota.push({ numero: d.numero, nota: nota.numero, monto: d.montoNeto, moneda: d.moneda, fecha: d.invoiceDate });
      continue;
    }
    const pagada = PAGADA.has(d.paymentState);
    const fechaPago = opciones.fechasDePago.get(d.numero) ?? null;
    const cobrada = pagada && opciones.cobrarConFirma && fechaPago !== null;
    const nota_ =
      d.paymentState === "partial"
        ? "Odoo la da pagada en parte: entra por cobrar."
        : pagada && !cobrada
          ? fechaPago === null
            ? "Odoo la da pagada, pero no se encontró el día del pago: entra por cobrar, para registrar el pago con el comprobante."
            : "Odoo la da pagada: entra por cobrar, para registrar el pago con el comprobante."
          : null;
    plan.aCargar.push({
      numero: d.numero,
      odooPartnerId: d.odooPartnerId,
      odooPartnerNombre: d.odooPartnerNombre,
      fecha: d.invoiceDate,
      periodo: d.invoiceDate.slice(0, 7),
      monto: round2(d.montoNeto),
      moneda: d.moneda,
      estado: cobrada ? "COBRADO" : "POR_COBRAR",
      fechaCobro: cobrada ? fechaPago : null,
      nota: nota_,
    });
    plan.totales[d.moneda] = round2(plan.totales[d.moneda] + d.montoNeto);
  }
  return plan;
}

/** La línea de la bitácora del cobro cargado: de dónde sale, por cuánto y quién lo cargó. */
export function textoDeCargaDesdeOdoo(c: CobroDesdeOdoo, firma: string, firmaDeCobro: string | null): string {
  const monto = `${c.moneda === "USD" ? "US$" : "₡"}${c.monto.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;
  return (
    `${firma} cargó la factura ${c.numero} desde la copia de Odoo: ${monto} sin IVA, facturada a «${c.odooPartnerNombre}» el ${c.fecha}.` +
    (c.estado === "COBRADO" && firmaDeCobro
      ? ` Cobrada el ${c.fechaCobro} según el pago que Odoo tiene conciliado con el banco; la confirma ${firmaDeCobro}.`
      : "") +
    (c.nota ? ` ${c.nota}` : "")
  );
}
