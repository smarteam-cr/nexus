/**
 * lib/cobranza/odoo/candidatas.ts
 *
 * Qué documentos del espejo de Odoo se le ofrecen a quien marca facturado un cobro. PURO: sin
 * Prisma, sin red, sin reloj. La consulta vive en servicio.ts (`candidatasParaCobro`).
 *
 * ── POR QUÉ UNA LISTA Y NO UN CAMPO DE TEXTO ────────────────────────────────────
 * Para las 47 cuentas que facturan por Odoo el número no hay que teclearlo: ya está en el espejo, con
 * su fecha y su monto. Teclearlo es la forma de que entre «FAC/2026/206» y el cruce no lo encuentre
 * nunca. Elegirlo de una lista lo trae escrito como lo escribe Odoo, y la fecha de emisión sale del
 * documento en vez de la memoria.
 *
 * ⚠ La lista sale de los clientes de Odoo VINCULADOS a la cuenta, no de `FacturaOdoo.cuentaId`: la
 * atribución puede ir un paso atrás del vínculo (del 3 al 12-sep fueron 170 facturas), y un documento
 * que existe no puede faltar de la lista por eso.
 *
 * ⛔ Nada de acá escribe: elegir una candidata es mandar su número al chokepoint del cobro, que es el
 * que firma (lib/cobranza/numero-factura.ts).
 */
import { esDocumentoVivo } from "./diferencias";
import type { PlataformaDeCobro, SociedadOpcion } from "../sociedades";

/** Lo que se lee de cada factura del espejo (del cliente de Odoo vinculado, vigente). */
export interface FacturaDelEspejo {
  odooMoveId: number;
  numero: string;
  odooPartnerNombre: string;
  /** `YYYY-MM-DD` */
  invoiceDate: string;
  montoNeto: number;
  moneda: string;
  moveType: string;
  state: string;
  paymentState: string;
}

/** Lo que importa del cobro para elegir. */
export interface CobroParaCandidatas {
  monto: number;
  moneda: string;
  /** `YYYY-MM-DD` */
  fechaProgramada: string;
  /** El que ya tiene, si tiene: su propia factura no cuenta como «tomada». */
  numeroFactura: string | null;
}

export interface FacturaCandidata {
  numero: string;
  odooPartnerNombre: string;
  invoiceDate: string;
  montoNeto: number;
  moneda: string;
  paymentState: string;
  /** Mismo monto neto que el cobro, al centavo. */
  montoExacto: boolean;
}

/** La respuesta de GET /api/cobranza/cobros/[cobroId]/facturas-candidatas. */
export interface CandidatasDeCobro {
  /** `CuentaFinanciera.viaCobro`: ODOO, MERCURY u OTRA (QuickBooks). Solo ODOO trae candidatas. */
  via: string;
  /** Cuántos clientes de Odoo están vinculados a la cuenta. Cero = no hay de dónde sacar la lista. */
  clientesDeOdoo: number;
  /**
   * Cada candidata dice de qué sociedad de la cuenta es su cliente de Odoo (etapa 12): elegir el documento es
   * decir a quién se le facturó.
   */
  candidatas: Array<FacturaCandidata & { sociedadId: string | null }>;
  /** Día de la última lectura buena de Odoo (`YYYY-MM-DD`), o null si nunca hubo una. */
  espejoAl: string | null;
  /** Etapa 12: las sociedades que le facturan a la cuenta, de todas las plataformas. */
  sociedades: SociedadOpcion[];
  /** Lo que el cobro ya tiene anotado: dónde se emitió y a quién. */
  plataformaFactura: PlataformaDeCobro | null;
  sociedadFacturadaId: string | null;
}

const CENTAVOS = (n: number) => Math.round(n * 100);
const distanciaEnDias = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * El monto exacto primero; después lo más cerca de la fecha programada; y con desempate por
 * `odooMoveId`, para que la lista no cambie de orden entre dos aperturas del diálogo.
 *
 * ⚠ El monto se compara en centavos: Odoo manda 2260.0000000000002.
 */
export function ordenarCandidatas<T extends Pick<FacturaDelEspejo, "montoNeto" | "invoiceDate" | "odooMoveId">>(
  facturas: readonly T[],
  cobro: Pick<CobroParaCandidatas, "monto" | "fechaProgramada">,
): T[] {
  const exacta = (f: T) => (CENTAVOS(f.montoNeto) === CENTAVOS(cobro.monto) ? 1 : 0);
  return facturas
    .slice()
    .sort(
      (a, b) =>
        exacta(b) - exacta(a) ||
        distanciaEnDias(a.invoiceDate, cobro.fechaProgramada) - distanciaEnDias(b.invoiceDate, cobro.fechaProgramada) ||
        a.odooMoveId - b.odooMoveId,
    );
}

/**
 * Las facturas que se le pueden ofrecer a este cobro, ordenadas.
 *
 * Fuera de la lista:
 *  · otra moneda — un cobro en dólares no se factura con un documento en colones;
 *  · lo que no es un documento vivo: notas de crédito, anuladas y revertidas (`esDocumentoVivo`, la
 *    misma regla que usa «Lo que no cuadra»);
 *  · los números que ya tiene otro cobro. Un documento que cubre varias cuotas se sigue pudiendo
 *    teclear en la misma cuenta; ofrecerlo en la lista invitaba a asignar dos veces la misma de las
 *    nueve facturas iguales de PUBLIMARK.
 */
export function candidatasParaElCobro(
  facturas: readonly FacturaDelEspejo[],
  cobro: CobroParaCandidatas,
  numerosTomados: ReadonlySet<string>,
): FacturaCandidata[] {
  const ofrecibles = facturas.filter(
    (f) =>
      f.moneda === cobro.moneda &&
      esDocumentoVivo(f) &&
      (f.numero === cobro.numeroFactura || !numerosTomados.has(f.numero)),
  );
  return ordenarCandidatas(ofrecibles, cobro).map((f) => ({
    numero: f.numero,
    odooPartnerNombre: f.odooPartnerNombre,
    invoiceDate: f.invoiceDate,
    montoNeto: f.montoNeto,
    moneda: f.moneda,
    paymentState: f.paymentState,
    montoExacto: CENTAVOS(f.montoNeto) === CENTAVOS(cobro.monto),
  }));
}
