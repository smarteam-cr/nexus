/**
 * lib/ventas/metas-reglas.ts — leer una meta de HubSpot y sumar las de una persona. PURO.
 *
 * HubSpot guarda una meta como «tramos» (goal targets): una meta anual con cadencia trimestral son
 * cuatro tramos por persona, cada uno con su monto (`hs_target_amount`) y lo que lleva
 * (`hs_kpi_value`, el avance que calcula HubSpot). El total del año de una persona es la suma de sus
 * tramos dentro del año.
 *
 * ⚠ En el portal conviven metas que NO son de venta (medido el 2026-10-08): «2026 ONFIRE | LLAMADAS
 * PROSPECCIÓN» (llamadas, 51 tramos semanales), «Diagnóstico | Leads» y las del Partner Mutual Action
 * Plan. Sumarlas con la de ventas inflaba la meta en dinero con llamadas y leads. Por eso se suma por
 * TIPO: la de ventas es `sales_quota`.
 */

/** El tipo de meta de HubSpot que mide lo vendido en dinero. */
export const TIPO_META_DE_VENTAS = "sales_quota";

/** Las propiedades que se le piden a `/crm/v3/objects/goal_targets`. */
export const PROPIEDADES_DE_META = [
  "hs_goal_name",
  "hs_goal_type",
  "hs_target_amount",
  "hs_kpi_value",
  "hs_status",
  "hs_start_datetime",
  "hs_end_datetime",
  "hs_goal_target_currency_code",
  "hubspot_owner_id",
  "hs_assignee_user_id",
  "hs_group_correlation_uuid",
  "hs_goal_target_group_id",
] as const;

export interface TramoDeMeta {
  hubspotGoalTargetId: string;
  hubspotGoalId: string | null;
  nombre: string;
  tipo: string | null;
  hubspotOwnerId: string | null;
  hubspotUserId: string | null;
  desde: Date;
  hasta: Date;
  monto: number;
  avance: number | null;
  moneda: string;
  estado: string | null;
}

const num = (v: string | null | undefined): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fecha = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const t = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
};

const texto = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Un tramo crudo de HubSpot, o null si no se puede usar (sin fechas o sin monto). */
export function aTramo(id: string, p: Record<string, string | null | undefined>): TramoDeMeta | null {
  const desde = fecha(p.hs_start_datetime);
  const hasta = fecha(p.hs_end_datetime);
  const monto = num(p.hs_target_amount);
  if (!desde || !hasta || monto === null) return null;
  return {
    hubspotGoalTargetId: id,
    // Las metas viejas (2022) no traen el uuid: el id de grupo hace de identidad de la meta.
    hubspotGoalId: texto(p.hs_group_correlation_uuid) ?? texto(p.hs_goal_target_group_id),
    nombre: texto(p.hs_goal_name) ?? "(meta sin nombre)",
    tipo: texto(p.hs_goal_type),
    hubspotOwnerId: texto(p.hubspot_owner_id),
    hubspotUserId: texto(p.hs_assignee_user_id),
    desde,
    hasta,
    monto,
    avance: num(p.hs_kpi_value),
    moneda: texto(p.hs_goal_target_currency_code)?.toUpperCase() ?? "USD",
    estado: texto(p.hs_status),
  };
}

export interface TramoParaSumar {
  teamMemberId: string | null;
  tipo: string | null;
  hubspotGoalId: string | null;
  nombre: string;
  desde: Date;
  monto: number;
  avance: number | null;
  moneda: string;
}

export interface MetaDelAnio {
  teamMemberId: string;
  /** Los nombres de las metas de HubSpot que suman, sin repetir. */
  metas: string[];
  moneda: string;
  monto: number;
  /** Lo que HubSpot dice que lleva. null si ningún tramo trae avance. */
  avance: number | null;
  /** avance ÷ monto, de 0 a lo que dé (puede pasar de 1). null sin avance o sin monto. */
  cumplimiento: number | null;
  tramos: number;
}

/**
 * Las metas del año de cada persona: suma de sus tramos del `tipo` pedido (por defecto, la de ventas)
 * que EMPIEZAN dentro del año. Una persona con metas en dos monedas aparece una vez por moneda: no se
 * convierte.
 */
export function metasDelAnio(tramos: TramoParaSumar[], anio: number, tipo: string = TIPO_META_DE_VENTAS): MetaDelAnio[] {
  const porClave = new Map<string, MetaDelAnio>();
  for (const t of tramos) {
    if (!t.teamMemberId || t.tipo !== tipo || t.desde.getUTCFullYear() !== anio) continue;
    const clave = `${t.teamMemberId}|${t.moneda}`;
    const m = porClave.get(clave) ?? { teamMemberId: t.teamMemberId, metas: [], moneda: t.moneda, monto: 0, avance: null, cumplimiento: null, tramos: 0 };
    m.monto += t.monto;
    if (t.avance !== null) m.avance = (m.avance ?? 0) + t.avance;
    if (!m.metas.includes(t.nombre)) m.metas.push(t.nombre);
    m.tramos++;
    porClave.set(clave, m);
  }
  return [...porClave.values()].map((m) => ({
    ...m,
    monto: Math.round(m.monto * 100) / 100,
    avance: m.avance === null ? null : Math.round(m.avance * 100) / 100,
    cumplimiento: m.avance !== null && m.monto > 0 ? m.avance / m.monto : null,
  }));
}
