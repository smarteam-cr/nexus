/**
 * lib/hubspot/partner-clients.ts
 *
 * Objeto PARTNER CLIENTS de HubSpot (portal de Smarteam como Solutions Partner):
 * uso/adopción por hub (UUS), licencias, MRR, renovaciones, equipo de HubSpot.
 *
 * DEGRADACIÓN DE SCOPE: si el scope `crm.objects.partner-clients.read` no está
 * autorizado, el 403 NO es error: devuelve `{ supported: false }` — el panel
 * muestra "sin permiso de partner" y todo arranca solo al re-autorizar la app
 * (contrato exacto de tickets.ts). Autorizado el 2026-07-10.
 *
 * RESOLUCIÓN DE PROPERTIES en dos niveles:
 *   1. PARTNER_FIELD_NAMES — mapeo ESTÁTICO de internal names, congelado contra el
 *      portal real (sonda del 2026-07-10 sobre las 172 properties). Vía primaria:
 *      inmune a renombres de label.
 *   2. PARTNER_FIELD_MATCHERS — regex sobre el label, SOLO como fallback para keys
 *      que el estático no cubra (p.ej. HubSpot agrega los componentes del UUS).
 *      Un fallback que resuelve loguea warn para promoverlo al estático.
 * El search pide TODAS las properties del objeto: el record crudo completo se
 * persiste en `ClientPartnerSnapshot.properties` (~6 KB/record, trivial en jsonb),
 * así promover un campo a escalar tipado no exige re-sincronizar contra HubSpot.
 *
 * Retry-401 con forceRefreshSystemToken (token del sistema compartido PROD/local).
 */
import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient, forceRefreshSystemToken } from "./client";

/** Slug documentado del objeto (HubSpot-defined). El discovery confirmó que existe
 *  (403 = sin scope, no 404). Si al autorizar cambiara el fqn, es UNA constante. */
export const PARTNER_OBJECT_FQN = "partner_clients";

/**
 * Mapeo ESTÁTICO campo → internal name, congelado contra las 172 properties del
 * portal real (sonda read-only, 2026-07-10). Vía PRIMARIA de resolución. Los 4
 * componentes del UUS (activation/toolUsage/valueMetrics/consumption) NO están:
 * el portal no los expone — si HubSpot los agrega, el fallback por regex los
 * levanta y avisa por consola para sumarlos acá.
 */
export const PARTNER_FIELD_NAMES: Record<string, string> = {
  uusScore: "hs_unified_usage_score",
  uusTrend: "hs_last_4_weeks_usage_score_trend",
  marketingScore: "hs_marketing_hub_usage_score",
  salesScore: "hs_sales_hub_usage_score",
  serviceScore: "hs_service_hub_usage_score",
  commerceScore: "hs_commerce_hub_usage_score",
  seatsCoreAssigned: "hs_core_seats_assigned",
  seatsCoreAvailable: "hs_core_seats_available",
  seatsCoreLimit: "hs_core_seats_limit",
  seatsSalesAssigned: "hs_sales_seats_assigned",
  seatsSalesAvailable: "hs_sales_seats_available",
  seatsSalesLimit: "hs_sales_seats_limit",
  seatsServiceAssigned: "hs_service_seats_assigned",
  seatsServiceAvailable: "hs_service_seats_available",
  seatsServiceLimit: "hs_service_seats_limit",
  marketingContactsLimit: "hs_marketing_contacts_limit",
  marketingContactsUsed: "hs_marketing_contacts_usage",
  mrrTotal: "hs_total_subscription_mrr",
  mrrManaged: "hs_split_managed_mrr",
  mrrUpForRenewal: "hs_renewal_mrr",
  nextRenewalAt: "hs_next_renewal_date",
  renewalMarketing: "hs_marketing_hub_renewal_date",
  renewalSales: "hs_sales_hub_renewal_date",
  renewalService: "hs_service_hub_renewal_date",
  renewalOps: "hs_operations_hub_renewal_date",
  managedExpiryAt: "hs_managed_relationship_estimated_expiration_date",
  cancellationHubs: "hs_cancellation_products",
  revenueSignal: "hs_revenue_signals",
  revenueSignalDetail: "hs_revenue_signal_explanation",
  editionMarketing: "hs_marketing_hub_edition",
  editionSales: "hs_sales_hub_edition",
  editionService: "hs_service_hub_edition",
  editionOps: "hs_operations_hub_edition",
  editionContent: "hs_content_hub_edition",
  editionCommerce: "hs_commerce_hub_edition",
  activeProducts: "hs_all_active_products",
  hsCsmName: "hs_success_owner_name",
  hsCsmEmail: "hs_success_owner_email",
  hsGrowthName: "hs_sales_owner_name",
  hsGrowthEmail: "hs_sales_owner_email",
  cslImplementaciones: "csl__implementaciones",
  clientName: "hs_client_name",
  accountName: "hs_client_account_name",
  domain: "hs_client_domain_name",
  domainFallback: "hs_original_purchased_domain",
  country: "hs_country",
  isManaged: "hs_is_managed",
  relationType: "hs_relationship_type",
  portalLink: "hs_account_link",
};

/** FALLBACK: regex sobre el LABEL de la property, solo para keys que el mapeo
 *  estático no cubra o cuyo internal name desaparezca del portal. */
export const PARTNER_FIELD_MATCHERS: Record<string, RegExp> = {
  uusScore: /calificaci.n de uso unificada|unified usage score|^unified usage/i,
  // Label real del portal (verificado contra /properties): "Usage Score Trend (Last 4 weeks)".
  uusTrend: /tendencia de la calificaci.n|usage (score|rating) trend/i,
  // Componentes del UUS: VERIFICADO que el portal NO los expone (0 properties que
  // matcheen activation/tool usage/value metrics/consumption entre las 172). Los
  // matchers quedan por si HubSpot los agrega; hoy resuelven a null y la fila de
  // componentes no se pinta.
  activationScore: /activaci.n|activation score|^activation$/i,
  toolUsageScore: /uso de (las )?herramientas|tool usage/i,
  valueMetricsScore: /m.tricas de valor|value metrics/i,
  consumptionScore: /^consumo|consumption( score)?$/i,
  marketingScore: /puntuaci.n del uso de marketing|marketing hub usage score/i,
  salesScore: /puntuaci.n del uso de sales|sales hub usage score/i,
  serviceScore: /puntuaci.n del uso de service|service hub usage score/i,
  commerceScore: /puntuaci.n de uso de commerce|commerce hub usage score/i,
  seatsCoreAssigned: /licencias principales asignadas|core seats assigned/i,
  seatsCoreAvailable: /licencias principales disponibles|core seats available/i,
  seatsCoreLimit: /l.mite de licencias principales|core seats? limit/i,
  seatsSalesAssigned: /licencias de sales hub asignadas|sales hub seats assigned/i,
  seatsSalesAvailable: /licencias de sales hub disponibles|sales hub seats available/i,
  seatsSalesLimit: /l.mite de licencias de sales|sales hub seats? limit/i,
  seatsServiceAssigned: /licencias de service hub asignadas|service hub seats assigned/i,
  seatsServiceAvailable: /licencias de service hub disponibles|service hub seats available/i,
  seatsServiceLimit: /l.mite de licencias de service|service hub seats? limit/i,
  marketingContactsLimit: /l.mite de contactos de marketing|marketing contact.? (tier|limit)/i,
  marketingContactsUsed: /uso de los contactos de marketing|marketing contacts? usage/i,
  mrrTotal: /mrr totales|total mrr/i,
  mrrManaged: /mrr gestionado dividido|split managed mrr/i,
  // `$` obligatorio: el portal tiene "Renewal MRR" y "Renewal MRR Change" — sin ancla
  // el resolver toma la primera que devuelva la API y podría guardar el DELTA como monto.
  mrrUpForRenewal: /^mrr por renovaci.n$|mrr up for renewal|^renewal mrr$/i,
  nextRenewalAt: /pr.xima fecha de renovaci.n|next renewal date/i,
  renewalMarketing: /renovaci.n de marketing hub|marketing hub renewal/i,
  renewalSales: /renovaci.n de sales hub|sales hub renewal/i,
  renewalService: /renovaci.n de service hub|service hub renewal/i,
  renewalOps: /renovaci.n de operations hub|operations hub renewal/i,
  managedExpiryAt: /caducidad estimada de la relaci.n gestionada|managed relationship estimated expiration/i,
  cancellationHubs: /hubs de pr.xima cancelaci.n|hubs (of |up for )?next cancellation|next cancellation hubs/i,
  revenueSignal: /^se.ales de ingresos$|^revenue signals?$/i,
  revenueSignalDetail: /explicaci.n de la se.al de ingresos|revenue signal (explanation|detail)/i,
  editionMarketing: /marketing hub edition/i,
  editionSales: /sales hub edition/i,
  editionService: /service hub edition/i,
  editionOps: /operations hub edition/i,
  editionContent: /content hub edition/i,
  editionCommerce: /edici.n de commerce hub|commerce hub edition/i,
  activeProducts: /todos los productos activos|all active products/i,
  hsCsmName: /nombre del customer success manager|customer success manager name/i,
  hsCsmEmail: /correo electr.nico del customer success manager|customer success manager email/i,
  hsGrowthName: /nombre del especialista en crecimiento|growth specialist name/i,
  hsGrowthEmail: /correo electr.nico del especialista en crecimiento|growth specialist email/i,
  cslImplementaciones: /csl \| implementaciones/i,
  clientName: /^nombre del cliente$|^client name$/i,
  accountName: /nombre de la cuenta del cliente|client account name/i,
  domain: /nombre de dominio de la empresa|company domain name/i,
  domainFallback: /dominio original comprado|original purchased domain/i,
  country: /^pa.s$|^country$/i,
  isManaged: /est. gestionado\?|is managed/i,
  relationType: /tipo de relaci.n|relationship type/i,
  portalLink: /client account link|enlace de la cuenta del cliente/i,
};

export interface PartnerClientRecord {
  /** id del record partner_clients en HubSpot. */
  id: string;
  /** Properties crudas completas { internalName: valor }. */
  properties: Record<string, string | null>;
  /** IDs de companies asociadas (para el match con Client.hubspotCompanyId). */
  associatedCompanyIds: string[];
  /** Valores resueltos por PARTNER_FIELD_MATCHERS: { campo: valor crudo string }. */
  resolved: Record<string, string>;
}

export interface PartnerClientsResult {
  /** false = scope no autorizado (403) — degradar sin ruido. */
  supported: boolean;
  records: PartnerClientRecord[];
  /** false = el batch de asociaciones falló (429/timeout/403 parcial): los
   *  associatedCompanyIds NO son confiables — el sync no debe re-matchear ni
   *  crear Clients con esta corrida (fetchStatus "partial"). */
  associationsOk: boolean;
  /** Mapa internalName → label de las properties del objeto (para debugging/UI). */
  propertyLabels: Record<string, string>;
}

const EMPTY: PartnerClientsResult = { supported: false, records: [], associationsOk: false, propertyLabels: {} };

interface HsPropMeta {
  name: string;
  label: string;
}

/** Resuelve el mapa campo→internalName en dos niveles:
 *  1. PARTNER_FIELD_NAMES (estático, congelado contra el portal) si la property EXISTE;
 *  2. fallback por regex sobre el label — un fallback que resuelve loguea warn para
 *     promoverlo al estático (significa que HubSpot renombró o agregó la property). */
function resolveFieldNames(props: HsPropMeta[]): Record<string, string> {
  const byName = new Set(props.map((p) => p.name));
  const out: Record<string, string> = {};
  const fields = new Set([...Object.keys(PARTNER_FIELD_NAMES), ...Object.keys(PARTNER_FIELD_MATCHERS)]);
  for (const field of fields) {
    const frozen = PARTNER_FIELD_NAMES[field];
    if (frozen && byName.has(frozen)) {
      out[field] = frozen;
      continue;
    }
    const re = PARTNER_FIELD_MATCHERS[field];
    const hit = re ? (props.find((p) => re.test(p.label)) ?? props.find((p) => re.test(p.name))) : undefined;
    if (hit) {
      out[field] = hit.name;
      console.warn(
        `[partner-clients] "${field}" resolvió por REGEX a ${hit.name} (label "${hit.label}") — ` +
          `promoverlo a PARTNER_FIELD_NAMES${frozen ? ` (el estático "${frozen}" ya no existe en el portal)` : ""}.`,
      );
    }
  }
  return out;
}

async function fetchOnce(hsClient: HsClient): Promise<{ status: number; result: PartnerClientsResult }> {
  // 1. Properties del objeto (auto-configuración). 403 acá = sin scope.
  const propsRes = await hsClient.apiRequest({
    method: "GET",
    path: `/crm/v3/properties/${PARTNER_OBJECT_FQN}`,
  });
  if (propsRes.status === 403) return { status: 403, result: EMPTY };
  if (propsRes.status !== 200) return { status: propsRes.status, result: { ...EMPTY, supported: true } };
  const propsBody = (await propsRes.json()) as { results?: HsPropMeta[] };
  const propMeta = propsBody.results ?? [];
  const propertyLabels = Object.fromEntries(propMeta.map((p) => [p.name, p.label]));
  const fieldNames = resolveFieldNames(propMeta);
  // TODAS las properties del objeto (172 al 2026-07-10): el crudo completo se persiste
  // en el snapshot (~6 KB/record), así promover un campo a escalar no re-consulta HubSpot.
  // Verificado en vivo que el search acepta la lista completa en un solo request.
  const wantedProps = propMeta.map((p) => p.name);

  // 2. Records vía SEARCH (POST: la lista completa de properties no entra en una
  //    query string). Sin filtros = todos; 157 records al 2026-07-10 → 2 páginas de 100.
  const records: PartnerClientRecord[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const searchRes = await hsClient.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${PARTNER_OBJECT_FQN}/search`,
      body: {
        properties: wantedProps,
        limit: 100,
        ...(after ? { after } : {}),
        sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      },
    });
    if (searchRes.status === 403) return { status: 403, result: EMPTY };
    if (searchRes.status !== 200) return { status: searchRes.status, result: { ...EMPTY, supported: true } };
    const body = (await searchRes.json()) as {
      results?: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after?: string } };
    };
    for (const r of body.results ?? []) {
      const resolved: Record<string, string> = {};
      for (const [field, name] of Object.entries(fieldNames)) {
        const v = r.properties[name];
        if (v !== null && v !== undefined && String(v).trim() !== "") resolved[field] = String(v);
      }
      records.push({ id: r.id, properties: r.properties, associatedCompanyIds: [], resolved });
    }
    after = body.paging?.next?.after;
    if (!after) break;
  }

  // 3. Asociaciones a companies en batch (el search no las trae). Un fallo acá
  //    NO tumba el fetch, pero SE PROPAGA (associationsOk=false): sin asociaciones
  //    confiables el sync no debe re-matchear ni crear Clients (un 429 transitorio
  //    dejaría associatedCompanyIds=[] para TODOS los records y el fallback por
  //    dominio crearía duplicados en masa).
  let associationsOk = true;
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    try {
      const assocRes = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v4/associations/${PARTNER_OBJECT_FQN}/companies/batch/read`,
        body: { inputs: chunk.map((r) => ({ id: r.id })) },
      });
      if (assocRes.status !== 200 && assocRes.status !== 207) {
        associationsOk = false;
        continue;
      }
      const body = (await assocRes.json()) as {
        results?: Array<{ from: { id: string }; to: Array<{ toObjectId: number | string }> }>;
      };
      const byId = new Map(chunk.map((r) => [r.id, r]));
      for (const row of body.results ?? []) {
        const rec = byId.get(row.from.id);
        if (rec) rec.associatedCompanyIds = (row.to ?? []).map((t) => String(t.toObjectId));
      }
    } catch {
      associationsOk = false;
    }
  }

  return { status: 200, result: { supported: true, records, associationsOk, propertyLabels } };
}

/** Todos los partner clients del portal, con degradación de scope y retry-401. */
export async function fetchAllPartnerClients(): Promise<PartnerClientsResult> {
  try {
    const hsClient = await getSystemHubspotClient();
    let r = await fetchOnce(hsClient);
    if (r.status === 401) {
      await forceRefreshSystemToken();
      r = await fetchOnce(await getSystemHubspotClient());
    }
    return r.result;
  } catch {
    // API caída ≠ scope faltante: soportado pero vacío (el caller decide no pisar
    // los snapshots existentes cuando records viene vacío por error transitorio).
    return { supported: true, records: [], associationsOk: false, propertyLabels: {} };
  }
}
