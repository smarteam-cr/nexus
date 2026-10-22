/**
 * lib/cobranza/carga-desde-mercury.ts
 *
 * Qué cobros hay que cargar en una cuenta para que Nexus tenga lo que Mercury ya le facturó. PURO: sin Prisma, sin red
 * y sin reloj. Lo usa scripts/cargar-cuenta-desde-mercury.ts, el gemelo de la carga desde Odoo
 * (lib/cobranza/carga-desde-odoo.ts): lee la copia de Mercury, arma el plan con esto y, con permiso, escribe por los
 * chokepoints de siempre.
 *
 * ── POR QUÉ EXISTE (2026-10-12) ─────────────────────────────────────────────────
 * Elías: «pensaba que conectando Mercury y Odoo eso iba a pasar automáticamente». No pasa: la copia de Mercury trae
 * las facturas, pero el punto de equilibrio se arma con los cobros de Nexus, y un cliente de Mercury sin cuenta no es
 * de nadie. Medido ese día: Patagonia Camp (US$4.000), el Ministerio de Economía (US$23.687,25) e Intercert (US$2.000)
 * tenían facturas en Mercury y ninguna cuenta en Nexus.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 * - Entra una factura del año que no esté anulada en Mercury, en dólares o colones, por su monto (lo internacional va
 *   sin IVA) y en su moneda.
 * - Un número que ya está en algún cobro no se carga otra vez: correr la carga dos veces no duplica nada.
 * - ⛔ Si la cuenta YA tiene cuotas sin número de factura en esa moneda, no se carga nada de esa moneda: lo más
 *   probable es que la factura sea una de esas cuotas, y cargarla la contaría dos veces. Medido en MSC Payroll: la
 *   INV-36 (US$3.360) son las dos cuotas de US$1.680 de junio y julio, que Nexus ya tiene cobradas sin número. Se
 *   listan aparte, para anotar el número en la cuota que corresponde.
 * - Pagada en Mercury → cobrada, ⛔ solo si quien carga firma el cobro (`cobrarConFirma`, INV3). El día es el de la
 *   entrada de plata que paga esa factura (`entradasDeFacturas`); si no se encuentra, el día en que la copia la vio
 *   pagada (`pagadaVistaEn`). ⚠ Hasta el 2026-10-22 era el último cambio de la factura en Mercury, que NO es el pago:
 *   Mercury no cambia su `updatedAt` al pagarse. Sin ninguno de los dos, entra por cobrar.
 * - En proceso de pago o sin pagar → por cobrar.
 */
import { numeroDeMercury } from "./mercury/espejo";

/** Una factura de la copia de Mercury, como la lee la carga. */
export interface FacturaDeMercury {
  id: string;
  numero: string;
  mercuryCustomerId: string;
  clienteNombre: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  monto: number;
  moneda: string;
  /** Unpaid · Paid · Cancelled · Processing, como los dice Mercury. */
  estado: string;
  /** `YYYY-MM-DD` del último cambio en Mercury. ⚠ No es el día del pago: Mercury no lo cambia al pagarse (2026-10-22). */
  actualizadaEn: string;
  /** `YYYY-MM-DD` en que la copia la vio pagada (sin depósito, es el día del pago). null = no se sabe. */
  pagadaVistaEn?: string | null;
}

/** Una cuota que la cuenta ya tiene, como la mira la carga. */
export interface CuotaDeLaCuenta {
  periodo: string;
  monto: number;
  moneda: string;
  estado: string;
  numeroFactura: string | null;
}

export interface CobroDesdeMercury {
  numero: string;
  mercuryCustomerId: string;
  clienteNombre: string;
  /** Fecha de la factura: es la fecha de emisión y la programada del cobro. */
  fecha: string;
  periodo: string;
  monto: number;
  moneda: "USD" | "CRC";
  /** Entra cobrado (con firma) o por cobrar. */
  estado: "COBRADO" | "POR_COBRAR";
  /** Solo si entra cobrado: el día en que entró la plata. */
  fechaCobro: string | null;
  /** De dónde salió `fechaCobro`: la entrada del banco o el día en que la copia la vio pagada. */
  /** De dónde sale el día del cobro: el depósito en Mercury, o el día en que la copia la vio pagada. */
  origenDelDia: "ENTRADA" | "VISTA" | null;
  /** Qué hay que saber de esta factura, en palabras. */
  nota: string | null;
}

export interface PlanDeCargaDesdeMercury {
  aCargar: CobroDesdeMercury[];
  /** Números que ya están en algún cobro de Nexus: no se tocan. */
  yaEstaban: string[];
  /** Facturas que no se cargan porque la cuenta ya tiene cuotas sin número en esa moneda: hay que anotarles el número. */
  enCuotasSinNumero: Array<{ numero: string; fecha: string; monto: number; moneda: string; estado: string; cuotas: CuotaDeLaCuenta[] }>;
  /** Lo que no entra, con el motivo (anuladas, de otro año, en otra moneda). */
  noEntran: Array<{ numero: string; motivo: string }>;
  /** Lo que se carga, sumado por moneda. */
  totales: Record<"USD" | "CRC", number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function planDeCargaDesdeMercury(
  facturas: readonly FacturaDeMercury[],
  opciones: {
    anio: number;
    /** Números de factura que ya tienen un cobro en Nexus, de cualquier cuenta, normalizados (`numeroDeMercury`). */
    numerosEnCobros: ReadonlySet<string>;
    /** Las cuotas que la cuenta ya tiene (vacío si la cuenta es nueva). */
    cuotasDeLaCuenta: readonly CuotaDeLaCuenta[];
    /** Id de la factura → día de la entrada de plata que la paga (`entradasDeFacturas`). */
    entradas: ReadonlyMap<string, string>;
    /** true = quien carga firma los cobros de las facturas pagadas (INV3). */
    cobrarConFirma: boolean;
  },
): PlanDeCargaDesdeMercury {
  const plan: PlanDeCargaDesdeMercury = { aCargar: [], yaEstaban: [], enCuotasSinNumero: [], noEntran: [], totales: { USD: 0, CRC: 0 } };
  const sinNumero = (moneda: string) => opciones.cuotasDeLaCuenta.filter((c) => c.moneda === moneda && !c.numeroFactura);

  const ordenadas = [...facturas].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.numero.localeCompare(b.numero));
  for (const f of ordenadas) {
    if (!f.invoiceDate.startsWith(`${opciones.anio}-`)) {
      plan.noEntran.push({ numero: f.numero, motivo: `es de ${f.invoiceDate.slice(0, 4)}, no de ${opciones.anio}` });
      continue;
    }
    if (f.estado === "Cancelled") {
      plan.noEntran.push({ numero: f.numero, motivo: "está anulada en Mercury" });
      continue;
    }
    if (f.moneda !== "USD" && f.moneda !== "CRC") {
      plan.noEntran.push({ numero: f.numero, motivo: `está en ${f.moneda}: Nexus cobra en dólares o en colones` });
      continue;
    }
    const numero = numeroDeMercury(f.numero) ?? f.numero.toUpperCase();
    if (opciones.numerosEnCobros.has(numero)) {
      plan.yaEstaban.push(f.numero);
      continue;
    }
    const cuotas = sinNumero(f.moneda);
    if (cuotas.length) {
      plan.enCuotasSinNumero.push({ numero: f.numero, fecha: f.invoiceDate, monto: round2(f.monto), moneda: f.moneda, estado: f.estado, cuotas });
      continue;
    }
    const pagada = f.estado === "Paid";
    const deLaEntrada = opciones.entradas.get(f.id) ?? null;
    /* ⚠ Sin depósito, el día es el que la copia la vio pagada. El último cambio de Mercury NO sirve: no cambia al pagarse
       (2026-10-22). Sin ninguno de los dos no se sabe el día, y no se cobra. */
    const diaDelPago = deLaEntrada ?? f.pagadaVistaEn ?? null;
    const cobrada = pagada && opciones.cobrarConFirma && diaDelPago !== null;
    const nota = f.estado === "Processing"
      ? "Mercury la da en proceso de pago: entra por cobrar."
      : pagada && !opciones.cobrarConFirma
        ? "Mercury la da pagada: entra por cobrar, para registrar el pago con el comprobante."
        : pagada && !cobrada
          ? "Mercury la da pagada, pero no dice qué día y no hay depósito en Mercury (tarjeta por Stripe o pago externo): entra por cobrar, para registrar el pago con su fecha."
          : cobrada && !deLaEntrada
            ? "Sin depósito en Mercury (tarjeta por Stripe o pago externo): el día del cobro es el que la copia la vio pagada."
            : null;
    plan.aCargar.push({
      numero: f.numero,
      mercuryCustomerId: f.mercuryCustomerId,
      clienteNombre: f.clienteNombre,
      fecha: f.invoiceDate,
      periodo: f.invoiceDate.slice(0, 7),
      monto: round2(f.monto),
      moneda: f.moneda,
      estado: cobrada ? "COBRADO" : "POR_COBRAR",
      fechaCobro: cobrada ? diaDelPago : null,
      origenDelDia: cobrada ? (deLaEntrada ? "ENTRADA" : "VISTA") : null,
      nota,
    });
    plan.totales[f.moneda] = round2(plan.totales[f.moneda] + f.monto);
  }
  return plan;
}

/** La línea de la bitácora del cobro cargado: de dónde sale, por cuánto y quién lo cargó. */
export function textoDeCargaDesdeMercury(c: CobroDesdeMercury, firma: string, firmaDeCobro: string | null): string {
  const monto = `${c.moneda === "USD" ? "US$" : "₡"}${c.monto.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;
  return (
    `${firma} cargó la factura ${c.numero} desde la copia de Mercury: ${monto}, facturada a «${c.clienteNombre}» el ${c.fecha}.` +
    (c.estado === "COBRADO" && firmaDeCobro
      ? ` Cobrada el ${c.fechaCobro}${c.origenDelDia === "ENTRADA" ? ", el día que la plata entró a Mercury" : ""}; la confirma ${firmaDeCobro}.`
      : "") +
    (c.nota ? ` ${c.nota}` : "")
  );
}
