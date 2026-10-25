/**
 * lib/cobranza/odoo/banco.ts — las líneas del banco de Odoo sin conciliar (U15, 2026-10-26). PURO: cero Prisma, cero
 * red, cero reloj.
 *
 * Una línea del banco (`account.bank.statement.line`) es plata que entró o salió de una cuenta del banco o de una
 * tarjeta. Conciliarla en Odoo es atarla a la factura o al pago que explica esa plata. Las que siguen sin conciliar son
 * plata que Odoo todavía no sabe de qué es. Medido el 2026-10-25: 98 de 837, del 5 de abril al 23 de octubre:
 *   · 4 ENTRAN, todas en «BAC Dolares (USD)» (una dice «MULTIQUIMICA»): plata que entró y no está atada a ninguna
 *     factura. Es lo que le importa a cobranza.
 *   · 94 SALEN: 61 de «VISA 7724 Colones», 21 de «VISA 7732 Dolares (USD)» y el resto de BAC. Gastos y pagos.
 *   · Ninguna trae el cliente o proveedor puesto (`partner_id`): solo la referencia del banco.
 *
 * Elías decidió que Alex las revisa EN NEXUS (roadmap, «Lo que decides tú» 28). Este módulo dice qué se lee, cómo se
 * lee cada fila y qué factura podría pagar cada entrada. ⛔ Nada de esto cobra: el cobro solo de lo pagado sigue siendo
 * lib/cobranza/libro, y una pista de factura es solo eso, una pista para la persona.
 */
import { textoOdoo } from "./espejo";

/** El modelo de Odoo. */
export const ODOO_MODELO_BANCO = "account.bank.statement.line";

/** Los campos que se leen. Explícitos: pedir todos trae HTML y adjuntos. */
export const ODOO_CAMPOS_BANCO = [
  "id",
  "date",
  "payment_ref",
  "partner_id",
  "partner_name",
  "amount",
  "amount_currency",
  "foreign_currency_id",
  "currency_id",
  "journal_id",
  "statement_id",
  "move_id",
  "is_reconciled",
  "state",
] as const;

/**
 * Las líneas sin conciliar y publicadas. Un borrador o una anulada no es plata que se movió.
 * ⚠ Son pocas (98): se leen todas en cada copia. Una lectura por `write_date` no vería las que se concilian.
 */
export function dominioBancoSinConciliar(): unknown[] {
  return [
    ["is_reconciled", "=", false],
    ["state", "=", "posted"],
  ];
}

/** Para saber qué pasó con las que dejaron de venir: se piden por id, conciliadas o no. */
export function dominioLineasPorId(ids: readonly number[]): unknown[] {
  return [["id", "in", [...ids]]];
}

export type EstadoDeLaLinea = "SIN_CONCILIAR" | "CONCILIADA" | "DESAPARECIDA";

export interface LineaDelBanco {
  odooLineId: number;
  /** AAAA-MM-DD. */
  fecha: string;
  monto: number;
  moneda: string;
  montoOtraMoneda: number | null;
  otraMoneda: string | null;
  referencia: string | null;
  odooPartnerId: number | null;
  odooPartnerNombre: string | null;
  odooJournalId: number;
  diario: string;
  extracto: string | null;
  asiento: string | null;
  conciliada: boolean;
}

/** `[id, "nombre"]` de un many2one de Odoo; `false` si está vacío. */
function many2one(v: unknown): { id: number; nombre: string | null } | null {
  if (!Array.isArray(v) || v.length < 1) return null;
  const id = Number(v[0]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { id, nombre: textoOdoo(v[1]) };
}

/** Una fila cruda de Odoo → la línea, o por qué no se pudo leer. Sin fecha, monto, moneda o diario no se copia. */
export function mapearLineaDelBanco(c: Record<string, unknown>): { linea: LineaDelBanco } | { rechazo: string } {
  const id = Number(c.id);
  if (!Number.isFinite(id) || id <= 0) return { rechazo: `línea sin id: ${JSON.stringify(c.id)}` };
  const fecha = typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(c.date) ? c.date.slice(0, 10) : null;
  const monto = Number(c.amount);
  const moneda = many2one(c.currency_id)?.nombre ?? null;
  const diario = many2one(c.journal_id);
  if (!fecha) return { rechazo: `línea ${id}: sin fecha` };
  if (!Number.isFinite(monto)) return { rechazo: `línea ${id}: sin monto` };
  if (!moneda) return { rechazo: `línea ${id}: sin moneda` };
  if (!diario?.nombre) return { rechazo: `línea ${id}: sin diario` };
  const otra = many2one(c.foreign_currency_id);
  const montoOtra = Number(c.amount_currency);
  const partner = many2one(c.partner_id);
  return {
    linea: {
      odooLineId: id,
      fecha,
      monto: Math.round(monto * 100) / 100,
      moneda,
      montoOtraMoneda: otra && Number.isFinite(montoOtra) && montoOtra !== 0 ? Math.round(montoOtra * 100) / 100 : null,
      otraMoneda: otra?.nombre ?? null,
      referencia: textoOdoo(c.payment_ref),
      odooPartnerId: partner?.id ?? null,
      odooPartnerNombre: partner?.nombre ?? textoOdoo(c.partner_name),
      odooJournalId: diario.id,
      diario: diario.nombre,
      extracto: many2one(c.statement_id)?.nombre ?? null,
      asiento: many2one(c.move_id)?.nombre ?? null,
      conciliada: c.is_reconciled === true,
    },
  };
}

/**
 * Qué les pasó a las que estaban sin conciliar y dejaron de venir: con la segunda lectura por id, las que Odoo devuelve
 * conciliadas quedan CONCILIADAS; las demás, DESAPARECIDAS: Odoo no las devuelve (las borró alguien, o un permiso
 * cambió) o las devuelve sin conciliar pero fuera de la lectura de las publicadas (pasaron a borrador o se anularon).
 * Si alguien la desconcilia, vuelve en la lectura siguiente y la copia la reabre.
 */
export function cierreDeLasQueSeFueron(
  idsQueSeFueron: readonly number[],
  releidas: ReadonlyArray<Pick<LineaDelBanco, "odooLineId" | "conciliada">>,
): Map<number, Exclude<EstadoDeLaLinea, "SIN_CONCILIAR">> {
  const porId = new Map(releidas.map((l) => [l.odooLineId, l]));
  const out = new Map<number, Exclude<EstadoDeLaLinea, "SIN_CONCILIAR">>();
  for (const id of idsQueSeFueron) {
    const l = porId.get(id);
    out.set(id, l?.conciliada ? "CONCILIADA" : "DESAPARECIDA");
  }
  return out;
}

/* ── Lo que ve «Lo que no cuadra» ──────────────────────────────────────────────── */

/** Una línea sin conciliar, como la cruza «Lo que no cuadra». */
export interface MovimientoDelBancoParaCruzar {
  id: string;
  fecha: string;
  monto: number;
  moneda: string;
  referencia: string | null;
  diario: string;
  asiento: string | null;
  odooPartnerNombre: string | null;
}

/** Una factura de Odoo con saldo, para buscar qué podría pagar una entrada. */
export interface FacturaConSaldo {
  numero: string;
  moneda: string;
  /** Lo que falta cobrar, con IVA (`amount_residual`). */
  saldo: number;
  odooPartnerNombre: string;
}

const centavos = (n: number) => Math.round(n * 100);

/** Las palabras de un nombre que sirven para buscarlo en la referencia del banco (4 letras o más, sin «S.A.»). */
function palabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p.length >= 4 && !["SOCIEDAD", "ANONIMA", "LIMITADA", "GRUPO", "COSTA", "RICA"].includes(p));
}

/**
 * Qué factura podría pagar una ENTRADA: las de la misma moneda cuyo saldo es exactamente el monto, y, si ninguna, las
 * de un cliente cuyo nombre aparece en la referencia del banco. Es una pista para la persona, nunca una decisión: no
 * cambia nada y no cobra nada. A lo sumo tres, las de saldo exacto primero.
 */
export function facturasQuePodriaPagar(
  m: Pick<MovimientoDelBancoParaCruzar, "monto" | "moneda" | "referencia">,
  facturas: readonly FacturaConSaldo[],
): FacturaConSaldo[] {
  if (!(m.monto > 0)) return [];
  const mismaMoneda = facturas.filter((f) => f.moneda === m.moneda && f.saldo > 0);
  const exactas = mismaMoneda.filter((f) => centavos(f.saldo) === centavos(m.monto));
  if (exactas.length) return exactas.slice(0, 3);
  const ref = new Set(palabras(m.referencia ?? ""));
  if (!ref.size) return [];
  return mismaMoneda.filter((f) => palabras(f.odooPartnerNombre).some((p) => ref.has(p))).slice(0, 3);
}

/**
 * Las facturas que la referencia del banco NOMBRA por número: «CANCELA FACT 330» nombra FAC/2026/0330. En cualquier
 * moneda (la referencia la escribe quien paga, y puede pagar en otra), a lo sumo tres. Medido el 2026-10-25: «CANCELA
 * FACT 330» por US$621,50 calza por saldo con dos facturas de Total Finco y nombra la 330 de JUDESUR, en colones. Las
 * dos pistas van juntas: decide la persona.
 */
export function facturasQueNombra(referencia: string | null, facturas: readonly FacturaConSaldo[]): FacturaConSaldo[] {
  const m = /\bFAC(?:T|TURA)?\b\.?\s*(?:N[O°º]\.?\s*)?#?\s*(?:\d{4}\s*[/-]\s*)?(\d{1,6})\b/i.exec(referencia ?? "");
  if (!m) return [];
  const n = Number(m[1]);
  if (!(n > 0)) return [];
  return facturas.filter((f) => Number(/(\d+)\s*$/.exec(f.numero)?.[1] ?? NaN) === n).slice(0, 3);
}

/** La huella de una línea del banco en «Lo que no cuadra»: su monto y su fecha. Si cambia, su marca deja de valer. */
export function huellaDeMovimiento(m: Pick<MovimientoDelBancoParaCruzar, "monto" | "moneda" | "fecha">): string {
  return [centavos(m.monto), m.moneda, m.fecha].join("|");
}

/**
 * Lo que dice la fila: «I003938302 MULTIQUIMICA DOMINI · 2026-10-21 · BAC Dolares (USD)». La referencia va primero: es
 * lo que identifica el movimiento, y el ejemplo corto de la vista por documento corta en el segundo «·».
 */
export function textoDeMovimiento(m: Pick<MovimientoDelBancoParaCruzar, "fecha" | "diario" | "referencia" | "odooPartnerNombre">): string {
  return [m.odooPartnerNombre ?? m.referencia ?? "(sin referencia)", m.fecha, m.diario].join(" · ");
}
