/**
 * lib/sociedades/entre-sociedades.ts — lo que se deben las sociedades de Smarteam, y las transferencias sin factura
 * (2026-11-13). PURO: sin Prisma, sin red, sin reloj.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────
 * De los libros de CR Smarteam en Odoo (la única compañía que hay, medido el 2026-11-13). Ahí se ve todo lo que cruza:
 *   · Flywheel y Smart Agro tienen su cuenta por cobrar («Cuentas por Cobrar Flywheel Centroamerica S.A»,
 *     «Cuenta por cobrar SmartAgro»): cada línea es plata que CR Smarteam puso por ellas o que le devolvieron.
 *   · Con la LLC hay facturas en los dos sentidos (una de 15.000 de la LLC y una de 8.387 a la LLC) y transferencias
 *     que pasan por la cuenta de traslado de la compañía («Transferencia interna») sin factura.
 * Las cuentas se reconocen por los alias de cada sociedad y por el tipo, nunca por su id ni su código: el catálogo se
 * está fusionando (catalogo.ts). La cuenta de traslado la dice Odoo (`res.company.transfer_account_id`).
 *
 * ── EL SIGNO ─────────────────────────────────────────────────────────────────────
 * `monto` es el `balance` de la línea en la cuenta que mira a la otra sociedad, en la moneda del documento: positivo =
 * la contraparte le debe más a la sociedad de los libros (le prestó, le facturó, pagó algo por ella); negativo = le
 * debe menos o la sociedad de los libros le debe a ella. Así una factura de la LLC (pasivo, crédito) resta y su pago
 * suma: la factura pagada queda en cero.
 *
 * ⚠ Los libros de la LLC (Mercury) NO se suman: las mismas transferencias se verían dos veces, una de cada lado.
 */
import { sociedadPorCompany, sociedadPorTexto, type SociedadPropiaDTO } from "./sociedades";
import { esDeBalance, esPorCobrarOPagar, type CuentaClasificada } from "./catalogo";

type Sociedad = Pick<SociedadPropiaDTO, "id" | "alias" | "odooCompanyId" | "nombre">;

/** Los documentos de Odoo que son facturas o notas de crédito. */
export const TIPOS_DE_FACTURA = new Set(["out_invoice", "out_refund", "in_invoice", "in_refund", "out_receipt", "in_receipt"]);

/** Los campos de `account.move.line` que se piden. */
export const ODOO_CAMPOS_LINEA = [
  "id",
  "date",
  "move_id",
  "move_type",
  "account_id",
  "partner_id",
  "name",
  "ref",
  "balance",
  "amount_currency",
  "currency_id",
  "reconciled",
  "full_reconcile_id",
  "journal_id",
  "company_id",
] as const;

export interface LineaContable {
  id: number;
  /** AAAA-MM-DD. */
  fecha: string;
  asiento: string | null;
  moveType: string | null;
  cuentaId: number;
  partnerId: number | null;
  partnerNombre: string | null;
  /** La etiqueta de la línea: «W/T-S50080 SMARTEAM CONSULT». */
  concepto: string | null;
  ref: string | null;
  /** En la moneda de la compañía, con signo (débito positivo). */
  balance: number;
  /** En la moneda de la línea, con signo. 0 si es la de la compañía. */
  montoMoneda: number;
  moneda: string | null;
  conciliada: boolean;
  diario: string | null;
  odooCompanyId: number | null;
}

function many2one(v: unknown): { id: number; nombre: string | null } | null {
  if (!Array.isArray(v) || v.length < 1) return null;
  const id = Number(v[0]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { id, nombre: typeof v[1] === "string" ? v[1] : null };
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null);
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Una fila cruda de `account.move.line` → la línea, o por qué no se pudo leer. */
export function mapearLineaContable(c: Record<string, unknown>): { linea: LineaContable } | { rechazo: string } {
  const id = Number(c.id);
  if (!Number.isFinite(id) || id <= 0) return { rechazo: `línea sin id: ${JSON.stringify(c.id)}` };
  const fecha = typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(c.date) ? c.date.slice(0, 10) : null;
  if (!fecha) return { rechazo: `línea ${id}: sin fecha` };
  const cuenta = many2one(c.account_id);
  if (!cuenta) return { rechazo: `línea ${id}: sin cuenta contable` };
  const balance = Number(c.balance);
  if (!Number.isFinite(balance)) return { rechazo: `línea ${id}: sin monto` };
  const partner = many2one(c.partner_id);
  const montoMoneda = Number(c.amount_currency);
  return {
    linea: {
      id,
      fecha,
      asiento: many2one(c.move_id)?.nombre ?? null,
      moveType: texto(c.move_type),
      cuentaId: cuenta.id,
      partnerId: partner?.id ?? null,
      partnerNombre: partner?.nombre ?? null,
      concepto: texto(c.name),
      ref: texto(c.ref),
      balance: redondear(balance),
      montoMoneda: Number.isFinite(montoMoneda) ? redondear(montoMoneda) : 0,
      moneda: many2one(c.currency_id)?.nombre ?? null,
      conciliada: c.reconciled === true || many2one(c.full_reconcile_id) !== null,
      diario: many2one(c.journal_id)?.nombre ?? null,
      odooCompanyId: many2one(c.company_id)?.id ?? null,
    },
  };
}

/**
 * Las cuentas contables que miran a otra sociedad: de balance (activo, pasivo, patrimonio) y con el nombre de una
 * sociedad («Cuentas por Cobrar Flywheel Centroamerica S.A» → Flywheel). Una cuenta de ingreso o gasto que nombra a una
 * sociedad no cuenta (sería un gasto, no una deuda) y vuelve como aviso.
 */
export function cuentasQueMiranAOtra(
  cuentas: readonly CuentaClasificada[],
  sociedades: readonly Sociedad[],
): { porCuenta: Map<number, string>; avisos: string[] } {
  const porCuenta = new Map<number, string>();
  const avisos: string[] = [];
  for (const c of cuentas) {
    const s = sociedadPorTexto([c.nombre], sociedades);
    if (!s) continue;
    if (!esDeBalance(c.clase)) {
      avisos.push(`La cuenta ${c.codigo} «${c.nombre}» nombra a ${s.nombre} pero no es de balance: no se lee como deuda.`);
      continue;
    }
    porCuenta.set(c.id, s.id);
  }
  return { porCuenta, avisos };
}

/** Los contactos de Odoo que son una sociedad de Smarteam («Smarteam Consultora LLC», «FLYWHEEL CENTRO AMERICA»). */
export function partnersDeSociedades(
  partners: ReadonlyArray<{ id: number; nombre: string }>,
  sociedades: readonly Sociedad[],
): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of partners) {
    const s = sociedadPorTexto([p.nombre], sociedades);
    if (s) out.set(p.id, s.id);
  }
  return out;
}

/**
 * El dominio de los contactos a revisar: los que tienen en el nombre algún alias de las sociedades. Notación prefija
 * de Odoo: N condiciones unidas por «o» llevan N−1 operadores delante. Sin alias, ninguno.
 */
export function dominioDePartnersDeSociedades(sociedades: readonly Sociedad[]): unknown[] | null {
  const alias = [...new Set(sociedades.flatMap((s) => s.alias).filter((a) => a.trim().length >= 4 && !/^\d+$/.test(a.trim())))];
  if (alias.length === 0) return null;
  return [...alias.slice(1).map(() => "|"), ...alias.map((a) => ["name", "ilike", a])];
}

/**
 * El dominio de las líneas: publicadas y en una cuenta que mira a otra sociedad o de traslado, o por cobrar/pagar de un
 * contacto que es una sociedad. ⚠ Se leen todas en cada copia (son pocas: 81 el 2026-11-13): una lectura por fecha de
 * escritura no vería las que se concilian.
 */
export function dominioDeLineas(cuentaIds: readonly number[], partnerIds: readonly number[]): unknown[] {
  const porCuenta: unknown[] = ["account_id", "in", [...cuentaIds]];
  if (partnerIds.length === 0) return ["&", ["parent_state", "=", "posted"], porCuenta];
  return [
    "&",
    ["parent_state", "=", "posted"],
    "|",
    porCuenta,
    "&",
    ["partner_id", "in", [...partnerIds]],
    ["account_id.account_type", "in", ["asset_receivable", "liability_payable"]],
  ];
}

export interface ContextoDeLosLibros {
  sociedades: readonly Sociedad[];
  /** El catálogo clasificado, por id. */
  cuentas: ReadonlyMap<number, CuentaClasificada>;
  /** Cuenta contable → la sociedad que nombra (`cuentasQueMiranAOtra`). */
  cuentaDeSociedad: ReadonlyMap<number, string>;
  /** Las cuentas de traslado de cada compañía (`transfer_account_id`). */
  cuentasDeTraslado: ReadonlySet<number>;
  /** Contacto de Odoo → sociedad (por los alias del nombre). */
  partnerDeSociedad: ReadonlyMap<number, string>;
  /** La moneda de cada compañía de Odoo (CRC). */
  monedaDeCompania: ReadonlyMap<number, string>;
}

export type TipoDeMovimiento = "FACTURA" | "TRANSFERENCIA" | "MOVIMIENTO";
export type Respaldo = "FACTURA" | "CONCILIADA" | "SIN_RESPALDO";

export interface MovimientoCalculado {
  odooLineId: number;
  odooCompanyId: number | null;
  fecha: string;
  sociedadId: string;
  contraparteId: string | null;
  monto: number;
  moneda: string;
  /** En la moneda de la compañía: con esto se buscan las dos mitades de un traslado. No se guarda. */
  balance: number;
  tipo: TipoDeMovimiento;
  respaldo: Respaldo;
  concepto: string | null;
  asiento: string | null;
  cuentaContable: string | null;
  diario: string | null;
  factura: string | null;
}

/**
 * Una línea de los libros → el movimiento entre sociedades que representa, o null si no tiene nada que ver.
 *
 * La contraparte se busca en este orden: la cuenta (si nombra a otra sociedad), el contacto, y el texto de la línea
 * («I002902359 Smarteam Consultora»). Si lo único que la nombra es la propia sociedad de los libros —el contacto
 * «CR SMARTEAM» en un traslado entre sus cuentas—, no hay contraparte: es un traslado propio.
 *
 * El respaldo:
 *   · FACTURA: la línea es de una factura, o es un cobro/pago conciliado en una cuenta por cobrar o por pagar (se
 *     concilia contra la factura que paga).
 *   · CONCILIADA: un traslado con sus dos mitades atadas en Odoo.
 *   · SIN_RESPALDO: lo demás. Entre sociedades, es plata que se movió sin una factura que la explique.
 */
export function clasificarLinea(
  l: LineaContable,
  ctx: ContextoDeLosLibros,
): { movimiento: MovimientoCalculado } | { ignorada: true } | { aviso: string } {
  const libros = sociedadPorCompany(l.odooCompanyId, ctx.sociedades);
  if (!libros) return { aviso: `La compañía ${l.odooCompanyId ?? "(sin compañía)"} de Odoo no es de ninguna sociedad de Nexus.` };
  const cuenta = ctx.cuentas.get(l.cuentaId);
  const porCuenta = ctx.cuentaDeSociedad.get(l.cuentaId) ?? null;
  const esTraslado = ctx.cuentasDeTraslado.has(l.cuentaId);
  const porPartner = l.partnerId !== null ? (ctx.partnerDeSociedad.get(l.partnerId) ?? null) : null;
  const porTexto = sociedadPorTexto([l.concepto, l.ref], ctx.sociedades, libros.id)?.id ?? null;
  const ajena = (id: string | null) => (id && id !== libros.id ? id : null);
  const contraparteId = ajena(porCuenta) ?? ajena(porPartner) ?? porTexto;

  const deCobrarOPagar = esPorCobrarOPagar(cuenta?.tipo);
  /* Qué líneas entran: las de una cuenta que mira a otra sociedad, las de la cuenta de traslado, y las por cobrar o
     por pagar de un contacto que es otra sociedad (la factura de la LLC y su pago). */
  const entra = porCuenta !== null || esTraslado || (deCobrarOPagar && ajena(porPartner) !== null);
  if (!entra) return { ignorada: true };
  /* Una cuenta que nombra a la propia sociedad de los libros, sin otra contraparte, no es una deuda con nadie. */
  if (!esTraslado && contraparteId === null) return { ignorada: true };

  const esFactura = l.moveType !== null && TIPOS_DE_FACTURA.has(l.moveType);
  const tipo: TipoDeMovimiento = esFactura ? "FACTURA" : esTraslado ? "TRANSFERENCIA" : "MOVIMIENTO";
  const respaldo: Respaldo = esFactura || (l.conciliada && deCobrarOPagar) ? "FACTURA" : l.conciliada ? "CONCILIADA" : "SIN_RESPALDO";

  const monedaCompania = (l.odooCompanyId !== null ? ctx.monedaDeCompania.get(l.odooCompanyId) : undefined) ?? "CRC";
  const enOtraMoneda = l.moneda !== null && l.moneda !== monedaCompania && l.montoMoneda !== 0;
  return {
    movimiento: {
      odooLineId: l.id,
      odooCompanyId: l.odooCompanyId,
      fecha: l.fecha,
      sociedadId: libros.id,
      contraparteId,
      monto: enOtraMoneda ? l.montoMoneda : l.balance,
      moneda: enOtraMoneda ? l.moneda! : monedaCompania,
      balance: l.balance,
      tipo,
      respaldo,
      concepto: l.concepto ?? l.ref,
      asiento: l.asiento,
      cuentaContable: cuenta ? `${cuenta.codigo} ${cuenta.nombre}` : null,
      diario: l.diario,
      factura: esFactura ? l.asiento : null,
    },
  };
}

/** Cuántos días pueden separar las dos mitades de un traslado entre cuentas propias. */
export const DIAS_ENTRE_MITADES = 5;

/**
 * Las dos mitades de un traslado entre cuentas PROPIAS que Odoo no ató: sale de una cuenta y entra en otra el mismo
 * día (o pocos días después) por el mismo monto en colones. Medido el 2026-11-13: de 64 líneas en «Transferencia
 * interna», solo 2 estaban conciliadas en Odoo, y la mayoría de las demás tiene su otra mitad. Las que la encuentran
 * pasan a CONCILIADA; las que no, siguen SIN_RESPALDO: plata que salió (o entró) sin que se vea a dónde.
 *
 * Solo traslados sin contraparte y sin conciliar. Empareja de a dos, por fecha, con el monto exacto al centavo.
 */
export function emparejarTraslados(movs: readonly MovimientoCalculado[]): MovimientoCalculado[] {
  const out = movs.map((m) => ({ ...m }));
  const sueltos = out
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.tipo === "TRANSFERENCIA" && m.contraparteId === null && m.respaldo === "SIN_RESPALDO")
    .sort((a, b) => a.m.fecha.localeCompare(b.m.fecha) || a.m.odooLineId - b.m.odooLineId);
  const usado = new Set<number>();
  const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
  for (const { m, i } of sueltos) {
    if (usado.has(i)) continue;
    const par = sueltos.find(
      ({ m: o, i: j }) =>
        j !== i &&
        !usado.has(j) &&
        Math.round((o.balance + m.balance) * 100) === 0 &&
        m.balance !== 0 &&
        dias(o.fecha, m.fecha) <= DIAS_ENTRE_MITADES,
    );
    if (!par) continue;
    usado.add(i);
    usado.add(par.i);
    out[i]!.respaldo = "CONCILIADA";
    out[par.i]!.respaldo = "CONCILIADA";
  }
  return out;
}

/* ── El saldo de cada par ────────────────────────────────────────────────────────── */

export interface MovimientoParaSaldo {
  sociedadId: string;
  contraparteId: string | null;
  monto: number;
  moneda: string;
  fecha: string;
  estado: string;
}

export interface SaldoEntreSociedades {
  /** La que debe y la que cobra. Con el saldo en cero, el orden es el del par. */
  deudoraId: string;
  acreedoraId: string;
  moneda: string;
  /** Siempre positivo (o cero). */
  saldo: number;
  movimientos: number;
  ultimaFecha: string;
}

/**
 * El saldo acumulado de cada par de sociedades, por moneda (CRC y USD no se suman). Junta lo que está en los libros de
 * una y lo anotado en los de la otra: el par es el mismo. Solo lo VIGENTE y con contraparte.
 */
export function saldosEntreSociedades(movs: readonly MovimientoParaSaldo[]): SaldoEntreSociedades[] {
  const acc = new Map<string, { a: string; b: string; moneda: string; neto: number; n: number; ultima: string }>();
  for (const m of movs) {
    if (m.estado !== "VIGENTE" || !m.contraparteId || m.contraparteId === m.sociedadId) continue;
    const [a, b] = [m.sociedadId, m.contraparteId].sort();
    const k = `${a}|${b}|${m.moneda}`;
    const e = acc.get(k) ?? { a: a!, b: b!, moneda: m.moneda, neto: 0, n: 0, ultima: "" };
    /* `neto` = lo que b le debe a a. En los libros de a, el monto ya es eso; en los de b, es al revés. */
    e.neto += m.sociedadId === a ? m.monto : -m.monto;
    e.n++;
    if (m.fecha > e.ultima) e.ultima = m.fecha;
    acc.set(k, e);
  }
  return [...acc.values()]
    .map((e) => {
      const neto = redondear(e.neto);
      return {
        deudoraId: neto >= 0 ? e.b : e.a,
        acreedoraId: neto >= 0 ? e.a : e.b,
        moneda: e.moneda,
        saldo: Math.abs(neto),
        movimientos: e.n,
        ultimaFecha: e.ultima,
      };
    })
    .sort((x, y) => y.saldo - x.saldo);
}

/** Lo que va a la lista de «sin factura»: entre sociedades o traslados propios sin su otra mitad, sin aceptar. */
export function necesitaRevision(m: { respaldo: string; estado: string; aceptadoEn: Date | string | null }): boolean {
  return m.estado === "VIGENTE" && m.respaldo === "SIN_RESPALDO" && !m.aceptadoEn;
}
