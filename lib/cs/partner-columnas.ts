/**
 * lib/cs/partner-columnas.ts — lo que la copia de Partner pasa del crudo a columnas (U29, 2026-10-25). PURO.
 *
 * La copia (`lib/cs/partner-sync.ts`) guarda las ~178 propiedades de cada registro `partner_clients` en
 * `ClientPartnerSnapshot.properties`. Lo vendido, las fechas de la relación, la comisión proyectada y el MRR por hub
 * vivían solo ahí: para sumarlos había que abrir el Json de cada fila y no quedaban semana a semana. Esta función los
 * saca con los nombres internos de HubSpot (no por el label, como `PARTNER_FIELD_NAMES`: estos no cambian de nombre
 * y no hace falta tocar `lib/hubspot/`). La usan la copia y el backfill (`scripts/partner-columnas.ts`), así no pueden
 * leer distinto.
 *
 * ── LO QUE SE MIDIÓ ANTES DE ESCRIBIRLA (168 registros, 2026-10-24) ──────────────────────────────────────────────
 *  · `hs_projected_commission` es MENSUAL: en las 44 cuentas con comisión es el 20 % de `hs_sold_mrr` (kölbi:
 *    4.701,60 = 20 % de 23.508). Moneda: USD en los 168.
 *  · `hs_sold_mrr` viene en los 168; `hs_sold_relationship_end_date`, en ninguno; `hs_relationship_end_date`, en 68.
 *  · `hs_projected_commission_calculated_at` es de cada cuenta y cambia solo cuando cambia la comisión (hay de 2025).
 *
 * ⛔ INTERNO: MRR y comisión son datos de partner (términos con HubSpot). Nunca van a un documento del cliente.
 */

type Props = Record<string, unknown>;

function texto(p: Props, k: string): string | null {
  const v = p[k];
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function numero(p: Props, k: string): number | null {
  const t = texto(p, k);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function booleano(p: Props, k: string): boolean | null {
  const t = texto(p, k)?.toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return null;
}

/** HubSpot da fechas como epoch en ms (texto) o ISO. */
function fecha(p: Props, k: string): Date | null {
  const t = texto(p, k);
  if (t === null) return null;
  const ms = /^\d{10,}$/.test(t) ? Number(t) : Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** El MRR por hub, con las claves que usa Nexus. Un hub sin monto no aparece (sin dato no es cero). */
export const MRR_POR_HUB_CLAVES = {
  marketing: "hs_marketing_hub_mrr",
  sales: "hs_sales_hub_mrr",
  service: "hs_service_hub_mrr",
  operations: "hs_operations_hub_mrr",
  content: "hs_content_hub_mrr",
  commerce: "hs_commerce_hub_mrr",
  addOns: "hs_add_ons_mrr",
  seats: "hs_seats_mrr",
} as const;

export type MrrPorHub = Partial<Record<keyof typeof MRR_POR_HUB_CLAVES, number>>;

export interface ColumnasDePartner {
  isManaged: boolean | null;
  isSold: boolean | null;
  soldMrr: number | null;
  soldProductLines: string | null;
  soldRelationshipStartAt: Date | null;
  soldRelationshipEndAt: Date | null;
  relationshipStartAt: Date | null;
  relationshipEndAt: Date | null;
  managedRelationshipStartAt: Date | null;
  managedRelationshipEndAt: Date | null;
  projectedCommission: number | null;
  projectedCommissionCurrency: string | null;
  projectedCommissionAt: Date | null;
  /** null = ningún hub trae monto. */
  mrrByHub: MrrPorHub | null;
}

export function mrrPorHub(p: Props): MrrPorHub | null {
  const out: MrrPorHub = {};
  for (const [clave, prop] of Object.entries(MRR_POR_HUB_CLAVES) as Array<[keyof typeof MRR_POR_HUB_CLAVES, string]>) {
    const n = numero(p, prop);
    if (n !== null) out[clave] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Las columnas de U29 a partir de las propiedades crudas de un registro de Partner. */
export function columnasDePartner(props: Props): ColumnasDePartner {
  return {
    isManaged: booleano(props, "hs_is_managed"),
    isSold: booleano(props, "hs_is_sold"),
    soldMrr: numero(props, "hs_sold_mrr"),
    soldProductLines: texto(props, "hs_sold_product_lines"),
    soldRelationshipStartAt: fecha(props, "hs_sold_relationship_start_date"),
    soldRelationshipEndAt: fecha(props, "hs_sold_relationship_end_date"),
    relationshipStartAt: fecha(props, "hs_relationship_start_date"),
    relationshipEndAt: fecha(props, "hs_relationship_end_date"),
    managedRelationshipStartAt: fecha(props, "hs_managed_relationship_start_date"),
    managedRelationshipEndAt: fecha(props, "hs_managed_relationship_end_date"),
    projectedCommission: numero(props, "hs_projected_commission"),
    projectedCommissionCurrency: texto(props, "hs_projected_commission_currency_code"),
    projectedCommissionAt: fecha(props, "hs_projected_commission_calculated_at"),
    mrrByHub: mrrPorHub(props),
  };
}

/** Semana ISO «YYYY-Www»: la clave del historial semanal de uso (`PartnerUsageSnapshot.weekKey`). */
export function semanaIso(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** El lunes (UTC) de la semana ISO de `d`. */
function lunesDe(d: Date): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() || 7) - 1));
  return t;
}

/**
 * La semana desde la que el historial de uso es continuo: la copia diaria corre de lunes a viernes desde el
 * 2026-10-05 (semana 41). Antes hubo una sola foto (semana 28, el 10 jul) y doce semanas sin copia: ese hueco no
 * se puede llenar, porque HubSpot no guarda el uso de semanas pasadas. Lo que se vigila (INV50) es de acá en adelante.
 */
export const HISTORIAL_CONTINUO_DESDE = new Date(Date.UTC(2026, 9, 5));

/**
 * Las semanas COMPLETAS (de `desde` hasta la anterior a la de `ahora`) que no tienen historial suficiente: menos
 * de `minimo` filas. La semana en curso no cuenta: el lunes antes de la copia de las 6 todavía no tiene fila.
 */
export function semanasConHueco(
  filasPorSemana: ReadonlyMap<string, number>,
  desde: Date,
  ahora: Date,
  minimo: number,
): string[] {
  const huecos: string[] = [];
  const hasta = lunesDe(ahora);
  for (let l = lunesDe(desde); l < hasta; l = new Date(l.getTime() + 7 * 86400000)) {
    const clave = semanaIso(l);
    if ((filasPorSemana.get(clave) ?? 0) < minimo) huecos.push(clave);
  }
  return huecos;
}
