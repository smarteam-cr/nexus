/**
 * lib/cobranza/mercury/espejo.ts
 *
 * Cómo se lee lo que devuelve Mercury y qué se hace con lo que no se puede leer. PURO: sin Prisma, sin red y sin
 * reloj. Lo usa sync.ts.
 *
 * ── LAS REGLAS (las mismas del espejo de Odoo, lib/cobranza/odoo/espejo.ts) ────────
 * - Una factura sin id, número, fecha, monto, moneda o cliente se RECHAZA y se cuenta: no se inventa nada.
 * - Nunca se borra una fila: la que deja de venir queda DESAPARECIDA, salvo que dejen de venir de golpe más de 5 (o
 *   del 5 %): eso no es un borrado, es una lectura rota.
 * - Una lectura que trae menos de la mitad de lo conocido es PARCIAL y no se copia nada.
 */
import { esBorradoMasivo, esCorridaParcial, espejoVencido } from "../odoo/espejo";
import { normalizarNumeroFactura } from "../numero-factura";

export { esBorradoMasivo, esCorridaParcial, espejoVencido };

export interface FacturaDeMercury {
  mercuryInvoiceId: string;
  numero: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  dueDate: string | null;
  monto: number;
  moneda: string;
  estado: string;
  mercuryCustomerId: string;
  canceladaEn: string | null;
  creadaEnMercury: string;
  actualizadaEnMercury: string;
}

export interface ClienteDeMercury {
  mercuryCustomerId: string;
  nombre: string;
  correo: string | null;
  pais: string | null;
}

export interface MovimientoDeMercury {
  mercuryTransactionId: string;
  mercuryAccountId: string;
  monto: number;
  estado: string;
  tipo: string;
  contraparteNombre: string | null;
  contraparteId: string | null;
  descripcionBanco: string | null;
  nota: string | null;
  memoExterno: string | null;
  conTarjeta: boolean;
  creadoEnMercury: string;
  posteadoEn: string | null;
}

export const ESTADOS_DE_FACTURA = ["Unpaid", "Paid", "Cancelled", "Processing"] as const;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const fecha = (v: unknown): string | null => {
  const s = texto(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const instante = (v: unknown): string | null => {
  const s = texto(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export function mapearFactura(c: Record<string, unknown>): { factura: FacturaDeMercury } | { rechazo: string } {
  const id = texto(c.id);
  const num = texto(c.invoiceNumber);
  const invoiceDate = fecha(c.invoiceDate);
  const monto = numero(c.amount);
  const moneda = texto(c.currencyCode);
  const cliente = texto(c.customerId);
  const estado = texto(c.status);
  const creada = instante(c.createdAt);
  const faltan = [
    !id && "id",
    !num && "número",
    !invoiceDate && "fecha",
    monto === null && "monto",
    !moneda && "moneda",
    !cliente && "cliente",
    !estado && "estado",
    !creada && "fecha de creación",
  ].filter(Boolean);
  if (faltan.length) return { rechazo: `${num ?? id ?? "(sin id)"}: le falta ${faltan.join(", ")}` };
  return {
    factura: {
      mercuryInvoiceId: id!,
      numero: num!,
      invoiceDate: invoiceDate!,
      dueDate: fecha(c.dueDate),
      monto: monto!,
      moneda: moneda!.toUpperCase(),
      estado: estado!,
      mercuryCustomerId: cliente!,
      canceladaEn: instante(c.canceledAt),
      creadaEnMercury: creada!,
      actualizadaEnMercury: instante(c.updatedAt) ?? creada!,
    },
  };
}

export function mapearCliente(c: Record<string, unknown>): ClienteDeMercury | null {
  const id = texto(c.id);
  const nombre = texto(c.name);
  if (!id || !nombre) return null;
  const direccion = (c.address ?? null) as { country?: unknown } | null;
  return { mercuryCustomerId: id, nombre, correo: texto(c.email), pais: texto(direccion?.country) };
}

export function mapearMovimiento(c: Record<string, unknown>): MovimientoDeMercury | null {
  const id = texto(c.id);
  const cuenta = texto(c.accountId);
  const monto = numero(c.amount);
  const creado = instante(c.createdAt);
  if (!id || !cuenta || monto === null || !creado) return null;
  const detalles = (c.details ?? {}) as Record<string, unknown>;
  return {
    mercuryTransactionId: id,
    mercuryAccountId: cuenta,
    monto,
    estado: texto(c.status) ?? "desconocido",
    tipo: texto(c.kind) ?? "desconocido",
    contraparteNombre: texto(c.counterpartyName),
    contraparteId: texto(c.counterpartyId),
    descripcionBanco: texto(c.bankDescription),
    nota: texto(c.note),
    memoExterno: texto(c.externalMemo),
    conTarjeta: !!(texto(c.cardId) || detalles.debitCardInfo || detalles.creditCardInfo),
    creadoEnMercury: creado,
    posteadoEn: instante(c.postedAt),
  };
}

/** ¿Cambió algo que importe? Lo que no cambió no se reescribe: se estampa la fecha de la copia y listo. */
export function facturaCambio(
  previa: Pick<FacturaDeMercury, "numero" | "invoiceDate" | "dueDate" | "monto" | "moneda" | "estado" | "mercuryCustomerId" | "canceladaEn" | "actualizadaEnMercury"> & {
    estadoEspejo: string;
  },
  nueva: FacturaDeMercury,
): boolean {
  return (
    previa.estadoEspejo !== "VIGENTE" ||
    previa.numero !== nueva.numero ||
    previa.invoiceDate !== nueva.invoiceDate ||
    previa.dueDate !== nueva.dueDate ||
    Math.round(previa.monto * 100) !== Math.round(nueva.monto * 100) ||
    previa.moneda !== nueva.moneda ||
    previa.estado !== nueva.estado ||
    previa.mercuryCustomerId !== nueva.mercuryCustomerId ||
    previa.canceladaEn !== nueva.canceladaEn ||
    previa.actualizadaEnMercury !== nueva.actualizadaEnMercury
  );
}

export function movimientoCambio(
  previo: Pick<MovimientoDeMercury, "monto" | "estado" | "posteadoEn" | "contraparteNombre" | "nota" | "memoExterno">,
  nuevo: MovimientoDeMercury,
): boolean {
  return (
    Math.round(previo.monto * 100) !== Math.round(nuevo.monto * 100) ||
    previo.estado !== nuevo.estado ||
    previo.posteadoEn !== nuevo.posteadoEn ||
    previo.contraparteNombre !== nuevo.contraparteNombre ||
    previo.nota !== nuevo.nota ||
    previo.memoExterno !== nuevo.memoExterno
  );
}

/* ── ¿Esta entrada de plata es un cliente pagando? ──────────────────────────────── */

/** Lo que no es un pago de cliente aunque entre plata (medido el 2026-10-02 sobre las 110 entradas de 2026). */
const TIPOS_QUE_NO_SON_COBROS = new Set(["internalTransfer", "interestPayment", "treasuryTransfer", "creditCardTransaction"]);
const ESTADOS_QUE_NO_ENTRARON = new Set(["failed", "cancelled", "reversed", "blocked"]);

/**
 * Una entrada que es plata de un cliente. Afuera: las transferencias entre las cuentas propias, los intereses, el
 * cashback y el pago automático de la tarjeta («Mercury IO…», «Mercury Checking ••6736»), las devoluciones de una
 * compra con tarjeta, y lo que viene de Smarteam (la otra empresa). `propios` = nombres de las empresas de la casa.
 */
export function esEntradaDeCliente(
  m: Pick<MovimientoDeMercury, "monto" | "estado" | "tipo" | "contraparteNombre" | "conTarjeta">,
  propios: readonly string[] = ["smarteam"],
): boolean {
  if (m.monto <= 0 || ESTADOS_QUE_NO_ENTRARON.has(m.estado) || TIPOS_QUE_NO_SON_COBROS.has(m.tipo) || m.conTarjeta) return false;
  const quien = (m.contraparteNombre ?? "").toLowerCase();
  if (quien.startsWith("mercury")) return false;
  return !propios.some((p) => quien.includes(p));
}

/**
 * El número de Mercury dentro de lo que alguien anotó en un cobro: «INVOICE NO.INV-48» es la INV-48 (caso real de
 * Metzger, 2026-09). null = no hay un número de Mercury ahí.
 */
export function numeroDeMercury(texto: string | null | undefined): string | null {
  const n = normalizarNumeroFactura(texto);
  /* «INVOICE-1» también: Mercury deja numerar a mano, y así salieron las de Intercert (medido el 2026-10-02). */
  return n?.match(/INV(?:OICE)?-\d+(?:-\d+)*/)?.[0] ?? null;
}

/** El nombre de quien pagó sin el «1/» que ponen las transferencias internacionales. */
export const nombreDeQuienPago = (nombre: string | null) => (nombre ?? "").replace(/^\d+\//, "").trim();
