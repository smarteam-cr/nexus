/**
 * lib/sociedades/catalogo.ts — el catálogo de cuentas de Odoo (`account.account`), leído con tolerancia (2026-11-13).
 * PURO: sin Prisma, sin red.
 *
 * ── LO QUE SE MIDIÓ ──────────────────────────────────────────────────────────────
 * El catálogo se reordenó: de más de 270 cuentas duplicadas a unas 32, con un código de seis dígitos donde el primero
 * dice la clase (1 activo, 2 pasivo, 3 patrimonio, 4 ingresos, 5 costos, 6 gastos). La fusión no terminó: el
 * 2026-11-13 Odoo devolvía 105 cuentas, varias con códigos de 4, 5, 7 u 8 dígitos («1103011», «61201019») y algunas
 * con un tipo que contradice su código («410104 Comisiones Comerciales Dolares» es de tipo gasto con código de ingreso).
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────
 * Nada se fija por id ni por código exacto: una cuenta se CLASIFICA por el primer dígito de su código, y si el código
 * no lo dice, por su tipo (`account_type`). Lo que no encaja no se descarta: se clasifica igual y lleva un aviso, para
 * que la pantalla lo muestre y alguien lo arregle en Odoo. Una cuenta nueva que aparezca mañana entra sola.
 */

export type ClaseContable = "ACTIVO" | "PASIVO" | "PATRIMONIO" | "INGRESO" | "COSTO" | "GASTO";

export const CLASES: readonly ClaseContable[] = ["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "COSTO", "GASTO"];

export const NOMBRE_DE_CLASE: Record<ClaseContable, string> = {
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PATRIMONIO: "Patrimonio",
  INGRESO: "Ingresos",
  COSTO: "Costos",
  GASTO: "Gastos",
};

/** El primer dígito del código nuevo. */
const CLASE_POR_DIGITO: Record<string, ClaseContable> = {
  "1": "ACTIVO",
  "2": "PASIVO",
  "3": "PATRIMONIO",
  "4": "INGRESO",
  "5": "COSTO",
  "6": "GASTO",
};

/** El tipo de Odoo 17 (`account_type`) → la clase. Un tipo que no está acá no clasifica (y el código decide). */
export function claseDelTipo(tipo: string | null | undefined): ClaseContable | null {
  if (!tipo) return null;
  if (tipo.startsWith("asset_")) return "ACTIVO";
  if (tipo.startsWith("liability_")) return "PASIVO";
  if (tipo === "equity" || tipo === "equity_unaffected") return "PATRIMONIO";
  if (tipo === "income" || tipo === "income_other") return "INGRESO";
  if (tipo === "expense_direct_cost") return "COSTO";
  if (tipo === "expense" || tipo === "expense_depreciation") return "GASTO";
  return null;
}

/** El largo del código nuevo. */
export const DIGITOS_DEL_CODIGO = 6;

export type AvisoDeCuenta =
  /** El código no es de seis dígitos: una cuenta del catálogo viejo que falta fusionar. */
  | "CODIGO_VIEJO"
  /** El primer dígito dice una clase y el tipo de Odoo otra. Manda el código. */
  | "CLASE_DISTINTA"
  /** Ni el código ni el tipo dicen la clase. */
  | "SIN_CLASE";

export const TEXTO_DEL_AVISO: Record<AvisoDeCuenta, string> = {
  CODIGO_VIEJO: "Código del catálogo viejo: falta fusionarla",
  CLASE_DISTINTA: "El código y el tipo no dicen la misma clase",
  SIN_CLASE: "No se sabe de qué clase es",
};

export interface CuentaOdoo {
  id: number;
  codigo: string;
  nombre: string;
  /** `account_type` de Odoo, tal cual. */
  tipo: string | null;
  /** Odoo la marcó para no usar. */
  deprecada: boolean;
  /** Odoo la concilia (cuentas por cobrar y por pagar, transferencias). */
  conciliable: boolean;
  odooCompanyId: number | null;
}

export interface CuentaClasificada extends CuentaOdoo {
  clase: ClaseContable | null;
  /** De dónde salió la clase. */
  claseSegun: "codigo" | "tipo" | null;
  avisos: AvisoDeCuenta[];
}

/** Los campos que se piden. Explícitos: sin la lista, Odoo devuelve todo. */
export const ODOO_CAMPOS_CUENTA = ["id", "code", "name", "account_type", "deprecated", "reconcile", "company_id"] as const;

function many2oneId(v: unknown): number | null {
  if (!Array.isArray(v) || v.length < 1) return null;
  const n = Number(v[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Una fila cruda de `account.account` → la cuenta, o null si no trae id ni código. */
export function mapearCuentaOdoo(c: Record<string, unknown>): CuentaOdoo | null {
  const id = Number(c.id);
  const codigo = typeof c.code === "string" ? c.code.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !codigo) return null;
  return {
    id,
    codigo,
    nombre: typeof c.name === "string" ? c.name.replace(/\s+/g, " ").trim() : "",
    tipo: typeof c.account_type === "string" ? c.account_type : null,
    deprecada: c.deprecated === true,
    conciliable: c.reconcile === true,
    odooCompanyId: many2oneId(c.company_id),
  };
}

/**
 * La clase de una cuenta y lo que no encaja. Manda el primer dígito del código (así lo armó contabilidad); el tipo de
 * Odoo solo decide cuando el código no dice nada. Un 5 con tipo «gasto» no es contradicción: Odoo usa «gasto» también
 * para los costos.
 */
export function clasificarCuenta(c: CuentaOdoo): CuentaClasificada {
  const porCodigo = /^\d/.test(c.codigo) ? (CLASE_POR_DIGITO[c.codigo[0]!] ?? null) : null;
  const porTipo = claseDelTipo(c.tipo);
  const avisos: AvisoDeCuenta[] = [];
  if (!new RegExp(`^\\d{${DIGITOS_DEL_CODIGO}}$`).test(c.codigo)) avisos.push("CODIGO_VIEJO");
  const compatibles = porCodigo === porTipo || (porCodigo === "COSTO" && porTipo === "GASTO");
  if (porCodigo && porTipo && !compatibles) avisos.push("CLASE_DISTINTA");
  const clase = porCodigo ?? porTipo;
  if (!clase) avisos.push("SIN_CLASE");
  return { ...c, clase, claseSegun: porCodigo ? "codigo" : porTipo ? "tipo" : null, avisos };
}

/** Activo, pasivo y patrimonio: las cuentas donde vive lo que una sociedad le debe a otra. */
export function esDeBalance(clase: ClaseContable | null): boolean {
  return clase === "ACTIVO" || clase === "PASIVO" || clase === "PATRIMONIO";
}

/** Las cuentas por cobrar y por pagar, por su tipo: ahí cae una factura entre sociedades y su pago. */
export function esPorCobrarOPagar(tipo: string | null | undefined): boolean {
  return tipo === "asset_receivable" || tipo === "liability_payable";
}

export interface ResumenDelCatalogo {
  total: number;
  /** Con código de seis dígitos. */
  conCodigoNuevo: number;
  /** Lo que contabilidad se puso como meta. */
  meta: number;
  porClase: Array<{ clase: ClaseContable; n: number }>;
  /** Las que llevan algún aviso, en el orden del código. */
  conAviso: CuentaClasificada[];
  deprecadas: number;
}

/** Unas 32 cuentas: la meta de la fusión del catálogo (Elías, 2026-11-13). */
export const META_DEL_CATALOGO = 32;

export function resumenDelCatalogo(cuentas: readonly CuentaClasificada[]): ResumenDelCatalogo {
  const vivas = cuentas.filter((c) => !c.deprecada);
  return {
    total: vivas.length,
    conCodigoNuevo: vivas.filter((c) => !c.avisos.includes("CODIGO_VIEJO")).length,
    meta: META_DEL_CATALOGO,
    porClase: CLASES.map((clase) => ({ clase, n: vivas.filter((c) => c.clase === clase).length })),
    conAviso: vivas.filter((c) => c.avisos.length > 0).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    deprecadas: cuentas.length - vivas.length,
  };
}
