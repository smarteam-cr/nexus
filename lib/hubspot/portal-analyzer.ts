import { prisma } from "@/lib/db/prisma";
import { refreshAccessToken } from "./client";
import { readAccountState, HubspotAccountState, PipelineDef, WorkflowDef, SequenceDef } from "./reader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InferredTier {
  label: string;          // "Professional+" | "Starter+" | "Free/Starter" | "Test/Sandbox" | "No determinado"
  color: "purple" | "blue" | "green" | "orange" | "gray";
  evidence: string[];     // reasons behind the inference
}

export interface AccountDetails {
  portalId: string;
  hubDomain?: string;
  uiDomain?: string;
  timeZone?: string;
  companyCurrency?: string;
  dataHostingLocation?: string;
  accountType?: string;   // STANDARD | DEVELOPER_TEST | SANDBOX
  user?: string;          // authenticated user email
  scopes?: string[];      // granted OAuth scopes
  inferredTier?: InferredTier;
}

export const LIFECYCLE_STAGES = [
  { value: "subscriber",            label: "Suscriptor" },
  { value: "lead",                  label: "Lead" },
  { value: "marketingqualifiedlead",label: "MQL" },
  { value: "salesqualifiedlead",    label: "SQL" },
  { value: "opportunity",           label: "Oportunidad" },
  { value: "customer",              label: "Cliente" },
  { value: "evangelist",            label: "Evangelista" },
  { value: "other",                 label: "Otro" },
] as const;

export interface LifecycleStageCount {
  value: string;
  label: string;
  count: number;
}

export interface LifecycleStats {
  contacts: LifecycleStageCount[];
  companies: LifecycleStageCount[];
  totalContacts: number;
  totalCompanies: number;
  totalDeals: number;
  totalTickets: number;
  lifecycleWorkflows: string[];
}

// ─── Owner Assignment Stats ───────────────────────────────────────────────────

export interface OwnerContactStat {
  ownerId: string;
  ownerName: string;
  email?: string;
  contactCount: number;
}

export interface MonthlyAssignmentStat {
  /** "2024-03" */
  month: string;
  /** "Mar 24" */
  label: string;
  count: number;
}

export interface OwnerAssignmentStats {
  /** Propietarios con ≥1 contacto asignado, ordenados de mayor a menor. */
  owners: OwnerContactStat[];
  /** Contactos sin propietario asignado. */
  unassigned: number;
  /** Suma de contactos que SÍ tienen propietario. */
  totalAssigned: number;
  /** Conteos de asignaciones de propietario por mes (hubspot_owner_assigneddate). */
  monthlyAssignments: MonthlyAssignmentStat[];
  /** Conteos de contactos creados por mes (createdate) — mismos 12 meses. */
  monthlyCreated: MonthlyAssignmentStat[];
}

export interface PipelineActivity {
  avgLastModifiedDate: string | null;
  totalDeals: number;
  activityLabel: string;
  activityColor: "green" | "yellow" | "red" | "gray";
  avgDaysAgo: number | null;
}

// ─── Contact Insights ────────────────────────────────────────────────────────

export interface PropertyBreakdown {
  value: string;
  label: string;
  count: number;
}

export interface ContactInsights {
  /** Distribución por fuente original (hs_analytics_source) */
  byOriginalSource: PropertyBreakdown[];
  /** Distribución por fuente más reciente (hs_latest_source) */
  byLatestSource: PropertyBreakdown[];
  /** Distribución por lead status (hs_lead_status) */
  byLeadStatus: PropertyBreakdown[];
  /** Distribución por industria de empresa asociada (company.industry) */
  byIndustry: PropertyBreakdown[];

  // ── Salud de email ────────────────────────────────────────────────────────
  /** Contactos con hard bounce (hs_email_hard_bounce_reason tiene valor) */
  hardBounceCount: number;
  /** Contactos no aptos para email (unsubscribed u opt-out) */
  emailIneligibleCount: number;
  /** Contactos con conversiones de formulario (num_conversion_events > 0) */
  withConversionsCount: number;

  // ── Actividad reciente ────────────────────────────────────────────────────
  /** Contactos con actividad en últimos 30 días */
  active30dCount: number;
  /** Contactos con actividad en últimos 90 días */
  active90dCount: number;
  /** Contactos sin ninguna actividad registrada (notes_last_activity vacío) */
  neverContactedCount: number;
  /** Contactos sin propietario asignado */
  orphanContactsCount: number;
}

export interface PortalSnapshot {
  accountState: HubspotAccountState;
  accountDetails: AccountDetails;
  lifecycleStats: LifecycleStats;
  /** key = pipelineId */
  pipelineActivity: Record<string, PipelineActivity>;
  contactInsights: ContactInsights;
  fetchedAt: string;
}

// ─── Audit Insights (generados por IA) ───────────────────────────────────────

export type InsightWidgetKey =
  | "stats"
  | "contacts_lifecycle"
  | "contacts_funnel"
  | "companies_lifecycle"
  | "companies_funnel"
  | "lifecycle_workflows"
  | "owner_assignment";

export type InsightSeverity = "positive" | "info" | "warning" | "critical";

export interface AuditInsight {
  widgetKey: InsightWidgetKey;
  title: string;
  comment: string;
  severity: InsightSeverity;
  recommendations: string[];
}

export interface AuditInsights {
  generatedAt: string;
  insights: AuditInsight[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SearchResult {
  total: number;
  results: { properties: Record<string, string> }[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function crmSearch(
  token: string,
  objectType: string,
  filterGroups: object[],
  properties: string[] = [],
  limit = 1,
  sorts: object[] = [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }]
): Promise<SearchResult> {
  const body = JSON.stringify({ filterGroups, properties, sorts, limit });

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.hubapi.com/crm/v3/objects/${objectType}/search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body,
        }
      );

      if (res.status === 429) {
        // Rate limited — respeta Retry-After si viene, si no, backoff exponencial
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
        console.warn(`[crmSearch] 429 rate limit on ${objectType} — waiting ${waitMs}ms (attempt ${attempt + 1})`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        console.error(`[crmSearch] ${objectType} HTTP ${res.status} ${res.statusText}`);
        return { total: 0, results: [] };
      }

      return res.json() as Promise<SearchResult>;
    } catch (err) {
      console.error(`[crmSearch] ${objectType} attempt ${attempt + 1} threw:`, err);
      if (attempt >= 2) return { total: 0, results: [] };
      await sleep(500);
    }
  }

  return { total: 0, results: [] };
}

/**
 * Detecta workflows activos que manipulan la propiedad `lifecyclestage`.
 * Estrategia dual:
 *   1. El nombre del WF contiene palabras clave (lifecycle, ciclo, etapa, stage, o un valor de etapa)
 *   2. El JSON completo del WF contiene "lifecyclestage" en sus acciones
 *      — esto detecta WFs como "WF - Calificación de MQL's" que usan SET_CONTACT_PROPERTY
 *        con propertyName: "lifecyclestage" aunque el nombre no lo mencione.
 */
async function detectLifecycleWorkflows(
  token: string,
  stageValues: string[]
): Promise<string[]> {
  try {
    const res = await fetch("https://api.hubapi.com/automation/v3/workflows", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`[detectLifecycleWorkflows] HTTP ${res.status} — sin detección de WFs`);
      return [];
    }

    const data = (await res.json()) as {
      workflows?: Array<Record<string, unknown>>;
    };

    const allWorkflows = data.workflows ?? [];
    const matched: string[] = [];

    for (const wf of allWorkflows) {
      if (!wf.enabled) continue;

      const name = String(wf.name ?? "");
      const nameLower = name.toLowerCase();

      // Estrategia 1: nombre del WF contiene keywords de ciclo de vida
      const nameMatches =
        nameLower.includes("lifecycle") ||
        nameLower.includes("ciclo") ||
        nameLower.includes("etapa") ||
        nameLower.includes("stage") ||
        stageValues.some((v) => nameLower.includes(v.toLowerCase()));

      if (nameMatches) {
        matched.push(name);
        continue;
      }

      // Estrategia 2: el JSON completo del WF referencia "lifecyclestage" en alguna acción
      // Cubre SET_CONTACT_PROPERTY, SET_COMPANY_PROPERTY, y cualquier acción que use la propiedad
      const fullJson = JSON.stringify(wf).toLowerCase();
      if (fullJson.includes("lifecyclestage")) {
        matched.push(name);
      }
    }

    console.log(
      `[detectLifecycleWorkflows] ${matched.length} WFs relacionados con lifecycle de ${allWorkflows.length} totales`
    );
    return matched;
  } catch (err) {
    console.error("[detectLifecycleWorkflows] Error:", err);
    return [];
  }
}

/** Obtiene el total de registros de un objeto CRM usando CRM Search con filtro
 *  "match-all" (createdate siempre existe en todos los objetos CRM de HubSpot). */
async function getObjectTotal(token: string, objectType: string): Promise<number> {
  const r = await crmSearch(token, objectType, [
    { filters: [{ propertyName: "createdate", operator: "HAS_PROPERTY" }] },
  ]);
  return r.total;
}

/** Obtiene todas las opciones de la propiedad lifecyclestage desde la API de HubSpot.
 *  Esto incluye tanto las etapas estándar como los valores customizados del portal (ej: "partner"). */
async function fetchLifecycleStageOptions(
  token: string
): Promise<Array<{ value: string; label: string }>> {
  try {
    const res = await fetch(
      "https://api.hubapi.com/crm/v3/properties/contacts/lifecyclestage",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      console.warn(`[fetchLifecycleStageOptions] HTTP ${res.status} — usando etapas por defecto`);
      return [...LIFECYCLE_STAGES];
    }
    const data = (await res.json()) as {
      options?: Array<{ value: string; label: string; hidden?: boolean }>;
    };
    const opts = (data.options ?? []).filter((o) => !o.hidden);
    if (opts.length === 0) return [...LIFECYCLE_STAGES];
    console.log(`[fetchLifecycleStageOptions] ${opts.length} etapas encontradas:`, opts.map(o => o.value).join(", "));
    return opts.map((o) => ({ value: o.value, label: o.label }));
  } catch (err) {
    console.error("[fetchLifecycleStageOptions] Error:", err);
    return [...LIFECYCLE_STAGES];
  }
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

function inferTier(
  accountType: string | undefined,
  customObjectsCount: number,
  pipelineCount: number,
  scopes: string[]
): InferredTier {
  // Test/Sandbox accounts
  if (accountType === "DEVELOPER_TEST") {
    return { label: "Developer Test", color: "orange", evidence: ["accountType: DEVELOPER_TEST"] };
  }
  if (accountType === "SANDBOX") {
    return { label: "Sandbox", color: "orange", evidence: ["accountType: SANDBOX"] };
  }

  const evidence: string[] = [];

  // Custom objects → Operations Hub Professional+ (≥ Pro)
  if (customObjectsCount > 0) {
    evidence.push(`${customObjectsCount} objeto(s) personalizado(s) (requiere Operations Hub Pro+)`);
    return { label: "Professional+", color: "purple", evidence };
  }

  // Multiple pipelines → at least Sales/Service Hub Starter
  if (pipelineCount > 2) {
    evidence.push(`${pipelineCount} pipelines configurados (requiere Starter+)`);
    if (scopes.includes("automation")) {
      evidence.push("Scope 'automation' disponible (Marketing Hub Starter+)");
    }
    return { label: "Starter+", color: "blue", evidence };
  }

  if (pipelineCount > 1) {
    evidence.push(`${pipelineCount} pipelines (Free permite solo 1 en Sales Hub)`);
    return { label: "Starter+", color: "blue", evidence };
  }

  // Single pipeline, basic scopes → Free or Starter
  evidence.push("1 pipeline y sin objetos personalizados detectados");
  if (scopes.length > 8) {
    evidence.push(`${scopes.length} scopes OAuth autorizados`);
    return { label: "Free / Starter", color: "green", evidence };
  }

  return { label: "No determinado", color: "gray", evidence: ["Datos insuficientes"] };
}

async function fetchAccountDetails(
  token: string,
  customObjectsCount: number,
  pipelineCount: number
): Promise<AccountDetails> {
  try {
    const [tokenRes, detailsRes] = await Promise.all([
      fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${token}`),
      fetch("https://api.hubapi.com/account-info/v3/details", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const tokenData = tokenRes.ok
      ? ((await tokenRes.json()) as {
          hub_id?: number;
          hub_domain?: string;
          user?: string;
          scopes?: string[];
        })
      : null;

    const details = detailsRes.ok
      ? ((await detailsRes.json()) as {
          portalId?: number;
          uiDomain?: string;
          timeZone?: string;
          companyCurrency?: string;
          dataHostingLocation?: string;
          accountType?: string;
        })
      : null;

    const scopes = tokenData?.scopes ?? [];
    const accountType = details?.accountType;

    return {
      portalId: String(tokenData?.hub_id ?? details?.portalId ?? ""),
      hubDomain: tokenData?.hub_domain,
      uiDomain: details?.uiDomain,
      timeZone: details?.timeZone,
      companyCurrency: details?.companyCurrency,
      dataHostingLocation: details?.dataHostingLocation,
      accountType,
      user: tokenData?.user,
      scopes,
      inferredTier: inferTier(accountType, customObjectsCount, pipelineCount, scopes),
    };
  } catch {
    return { portalId: "" };
  }
}

async function fetchLifecycleStats(
  token: string,
  _workflows: WorkflowDef[]
): Promise<LifecycleStats> {
  // ── 1. Etapas dinámicas desde HubSpot (incluye valores custom como "partner") ─
  const stages = await fetchLifecycleStageOptions(token);
  const stageValues = stages.map((s) => s.value);

  // ── 2. Totales — secuenciales con delay para respetar el rate limit ────────
  // NO usar Promise.all: 4 requests paralelas a CRM Search pueden provocar 429.
  const totalContacts = await getObjectTotal(token, "contacts");
  await sleep(300);
  const totalCompanies = await getObjectTotal(token, "companies");
  await sleep(300);
  const totalDeals = await getObjectTotal(token, "deals");
  await sleep(300);
  const totalTickets = await getObjectTotal(token, "tickets");
  await sleep(300);

  // ── 3. Stage counts en lotes de 2 (= 4 queries paralelas por lote) ─────────
  // Batch de 4 = 8 queries simultáneas → demasiado para cuentas con límite ~5 req/s
  // Batch de 2 = 4 queries simultáneas → seguro en prácticamente todas las cuentas
  const contactCounts: LifecycleStageCount[] = [];
  const companyCounts: LifecycleStageCount[] = [];
  const BATCH = 2;

  for (let i = 0; i < stages.length; i += BATCH) {
    const batch = stages.slice(i, i + BATCH);

    const [contactBatch, companyBatch] = await Promise.all([
      Promise.all(
        batch.map(async (stage) => {
          const r = await crmSearch(token, "contacts", [
            { filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: stage.value }] },
          ]);
          return { value: stage.value, label: stage.label, count: r.total };
        })
      ),
      Promise.all(
        batch.map(async (stage) => {
          const r = await crmSearch(token, "companies", [
            { filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: stage.value }] },
          ]);
          return { value: stage.value, label: stage.label, count: r.total };
        })
      ),
    ]);

    contactCounts.push(...contactBatch);
    companyCounts.push(...companyBatch);

    // Pausa entre TODOS los lotes (incluyendo el último antes de lifecycle workflows)
    await sleep(500);
  }

  // ── 4. Workflows relacionados con lifecycle ───────────────────────────────
  // Detecta por nombre Y por composición (busca "lifecyclestage" en el JSON completo del WF)
  const lifecycleWorkflows = await detectLifecycleWorkflows(token, stageValues);

  return {
    contacts: contactCounts,
    companies: companyCounts,
    totalContacts,
    totalCompanies,
    totalDeals,
    totalTickets,
    lifecycleWorkflows,
  };
}

async function fetchPipelineActivity(
  token: string,
  pipelines: Record<string, PipelineDef[]>
): Promise<Record<string, PipelineActivity>> {
  const result: Record<string, PipelineActivity> = {};
  const dealPipelines = pipelines["deals"] ?? [];

  await Promise.all(
    dealPipelines.map(async (pipeline) => {
      const data = await crmSearch(
        token,
        "deals",
        [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipeline.id }] }],
        ["hs_lastmodifieddate"],
        15
      );

      const totalDeals = data.total;

      if (data.results.length === 0) {
        result[pipeline.id] = {
          avgLastModifiedDate: null,
          totalDeals,
          activityLabel: "Sin deals",
          activityColor: "gray",
          avgDaysAgo: null,
        };
        return;
      }

      // Average of hs_lastmodifieddate of the last 15 deals
      const timestamps = data.results
        .map((d) => new Date(d.properties["hs_lastmodifieddate"] ?? "").getTime())
        .filter((t) => !isNaN(t));

      const avgMs =
        timestamps.length > 0
          ? timestamps.reduce((a, b) => a + b, 0) / timestamps.length
          : null;

      const avgDate = avgMs ? new Date(avgMs).toISOString() : null;
      const avgDaysAgo = avgMs
        ? Math.round((Date.now() - avgMs) / (1000 * 60 * 60 * 24))
        : null;

      let activityLabel: string;
      let activityColor: "green" | "yellow" | "red" | "gray";

      if (avgDaysAgo === null) {
        activityLabel = "Sin actividad";
        activityColor = "gray";
      } else if (avgDaysAgo <= 30) {
        activityLabel = `Activo`;
        activityColor = "green";
      } else if (avgDaysAgo <= 90) {
        activityLabel = `Poco activo`;
        activityColor = "yellow";
      } else {
        activityLabel = `Inactivo`;
        activityColor = "red";
      }

      result[pipeline.id] = {
        avgLastModifiedDate: avgDate,
        totalDeals,
        activityLabel,
        activityColor,
        avgDaysAgo,
      };
    })
  );

  return result;
}

// ─── Contact Insights fetcher ─────────────────────────────────────────────────

// Enum values for hs_analytics_source / hs_latest_source (HubSpot built-in)
const ORIGINAL_SOURCES: { value: string; label: string }[] = [
  { value: "ORGANIC_SEARCH",   label: "Búsqueda orgánica" },
  { value: "PAID_SEARCH",      label: "Búsqueda pagada" },
  { value: "EMAIL_MARKETING",  label: "Email marketing" },
  { value: "SOCIAL_MEDIA",     label: "Redes sociales" },
  { value: "REFERRALS",        label: "Referidos" },
  { value: "PAID_SOCIAL",      label: "Social pagado" },
  { value: "DIRECT_TRAFFIC",   label: "Tráfico directo" },
  { value: "OTHER_CAMPAIGNS",  label: "Otras campañas" },
  { value: "OFFLINE",          label: "Fuera de línea" },
];

const LATEST_SOURCES: { value: string; label: string }[] = [
  { value: "ORGANIC_SEARCH",   label: "Búsqueda orgánica" },
  { value: "PAID_SEARCH",      label: "Búsqueda pagada" },
  { value: "EMAIL_MARKETING",  label: "Email marketing" },
  { value: "SOCIAL_MEDIA",     label: "Redes sociales" },
  { value: "REFERRALS",        label: "Referidos" },
  { value: "PAID_SOCIAL",      label: "Social pagado" },
  { value: "DIRECT_TRAFFIC",   label: "Tráfico directo" },
  { value: "OTHER_CAMPAIGNS",  label: "Otras campañas" },
  { value: "OFFLINE",          label: "Fuera de línea" },
  { value: "CRM_UI",           label: "CRM manual" },
  { value: "IMPORT",           label: "Importación" },
  { value: "INTEGRATION",      label: "Integración" },
  { value: "SALES_EXTENSION",  label: "Sales extension" },
  { value: "CHATFLOWS",        label: "Chat / Chatbot" },
  { value: "FORM",             label: "Formulario" },
];

const LEAD_STATUSES: { value: string; label: string }[] = [
  { value: "NEW",                  label: "Nuevo" },
  { value: "OPEN",                 label: "Abierto" },
  { value: "IN_PROGRESS",          label: "En proceso" },
  { value: "OPEN_DEAL",            label: "Deal abierto" },
  { value: "UNQUALIFIED",          label: "No calificado" },
  { value: "ATTEMPTED_TO_CONTACT", label: "Contacto intentado" },
  { value: "CONNECTED",            label: "Conectado" },
  { value: "BAD_TIMING",           label: "Mal momento" },
];

const INDUSTRIES: { value: string; label: string }[] = [
  { value: "ACCOUNTING",                        label: "Contabilidad" },
  { value: "AIRLINES_AVIATION",                 label: "Aviación" },
  { value: "ALTERNATIVE_MEDICINE",              label: "Medicina alternativa" },
  { value: "ANIMATION",                         label: "Animación" },
  { value: "APPAREL_FASHION",                   label: "Moda" },
  { value: "ARCHITECTURE_PLANNING",             label: "Arquitectura" },
  { value: "ARTS_CRAFTS",                       label: "Arte y artesanía" },
  { value: "AUTOMOTIVE",                        label: "Automotriz" },
  { value: "BANKING_MORTGAGE",                  label: "Banca" },
  { value: "BIOTECHNOLOGY_GREENTECH",           label: "Biotecnología" },
  { value: "BROADCAST_MEDIA",                   label: "Medios de comunicación" },
  { value: "BUILDING_MATERIALS",                label: "Materiales de construcción" },
  { value: "BUSINESS_SUPPLIES_EQUIPMENT",       label: "Suministros empresariales" },
  { value: "CAPITAL_MARKETS_HEDGE_FUND_PRIVATE_EQUITY", label: "Mercados de capital" },
  { value: "CHEMICALS",                         label: "Química" },
  { value: "CIVIC_SOCIAL_ORGANIZATION",         label: "Organización social" },
  { value: "CIVIL_ENGINEERING",                 label: "Ingeniería civil" },
  { value: "COMMERCIAL_REAL_ESTATE",            label: "Bienes raíces comerciales" },
  { value: "COMPUTER_GAMES",                    label: "Videojuegos" },
  { value: "COMPUTER_HARDWARE",                 label: "Hardware" },
  { value: "COMPUTER_NETWORKING",               label: "Redes informáticas" },
  { value: "COMPUTER_SOFTWARE_ENGINEERING",     label: "Software" },
  { value: "COMPUTER_NETWORK_SECURITY",         label: "Ciberseguridad" },
  { value: "CONSTRUCTION",                      label: "Construcción" },
  { value: "CONSUMER_ELECTRONICS",              label: "Electrónica de consumo" },
  { value: "CONSUMER_GOODS",                    label: "Bienes de consumo" },
  { value: "CONSUMER_SERVICES",                 label: "Servicios al consumidor" },
  { value: "COSMETICS",                         label: "Cosméticos" },
  { value: "DAIRY",                             label: "Lácteos" },
  { value: "DEFENSE_SPACE",                     label: "Defensa y espacio" },
  { value: "DESIGN",                            label: "Diseño" },
  { value: "E_LEARNING",                        label: "E-learning" },
  { value: "EDUCATION_MANAGEMENT",              label: "Educación" },
  { value: "ELECTRICAL_ELECTRONIC_MANUFACTURING", label: "Manufactura electrónica" },
  { value: "ENTERTAINMENT_MOVIE_PRODUCTION",    label: "Entretenimiento" },
  { value: "ENVIRONMENTAL_SERVICES",            label: "Servicios ambientales" },
  { value: "EVENTS_SERVICES",                   label: "Eventos" },
  { value: "EXECUTIVE_OFFICE",                  label: "Dirección ejecutiva" },
  { value: "FACILITIES_SERVICES",               label: "Servicios de instalaciones" },
  { value: "FARMING",                           label: "Agricultura" },
  { value: "FINANCIAL_SERVICES",                label: "Servicios financieros" },
  { value: "FINE_ART",                          label: "Bellas artes" },
  { value: "FISHERY",                           label: "Pesca" },
  { value: "FOOD_BEVERAGES",                    label: "Alimentos y bebidas" },
  { value: "FOOD_PRODUCTION",                   label: "Producción de alimentos" },
  { value: "FUNDRAISING",                       label: "Recaudación de fondos" },
  { value: "FURNITURE",                         label: "Muebles" },
  { value: "GAMBLING_CASINOS",                  label: "Juegos de azar" },
  { value: "GLASS_CERAMICS_CONCRETE",           label: "Vidrio y cerámica" },
  { value: "GOVERNMENT_ADMINISTRATION",         label: "Gobierno" },
  { value: "GOVERNMENT_RELATIONS",              label: "Relaciones gubernamentales" },
  { value: "GRAPHIC_DESIGN_WEB_DESIGN",         label: "Diseño gráfico/web" },
  { value: "HEALTH_FITNESS",                    label: "Salud y fitness" },
  { value: "HIGHER_EDUCATION_ACADEMIA",         label: "Educación superior" },
  { value: "HOSPITAL_HEALTH_CARE",              label: "Salud / Hospital" },
  { value: "HOSPITALITY",                       label: "Hospitalidad" },
  { value: "HUMAN_RESOURCES_HR",                label: "Recursos humanos" },
  { value: "IMPORT_EXPORT",                     label: "Importación/Exportación" },
  { value: "INDIVIDUAL_FAMILY_SERVICES",        label: "Servicios familiares" },
  { value: "INDUSTRIAL_AUTOMATION",             label: "Automatización industrial" },
  { value: "INFORMATION_SERVICES",              label: "Servicios de información" },
  { value: "INFORMATION_TECHNOLOGY_IT_SERVICES", label: "IT / Tecnología" },
  { value: "INSURANCE",                         label: "Seguros" },
  { value: "INTERNATIONAL_AFFAIRS",             label: "Asuntos internacionales" },
  { value: "INTERNATIONAL_TRADE_DEVELOPMENT",   label: "Comercio internacional" },
  { value: "INTERNET",                          label: "Internet" },
  { value: "INVESTMENT_BANKING_VENTURE",        label: "Banca de inversión" },
  { value: "INVESTMENT_MANAGEMENT_HEDGE_FUND_PRIVATE_EQUITY", label: "Gestión de inversiones" },
  { value: "JUDICIARY",                         label: "Judicial" },
  { value: "LAW_ENFORCEMENT",                   label: "Aplicación de la ley" },
  { value: "LAW_PRACTICE_LAW_FIRMS",            label: "Despacho jurídico" },
  { value: "LEGAL_SERVICES",                    label: "Servicios legales" },
  { value: "LEGISLATIVE_OFFICE",                label: "Oficina legislativa" },
  { value: "LEISURE_TRAVEL",                    label: "Turismo y viajes" },
  { value: "LIBRARIES",                         label: "Bibliotecas" },
  { value: "LOGISTICS_SUPPLY_CHAIN",            label: "Logística" },
  { value: "LUXURY_GOODS_JEWELRY",              label: "Lujo y joyería" },
  { value: "MACHINERY",                         label: "Maquinaria" },
  { value: "MANAGEMENT_CONSULTING",             label: "Consultoría" },
  { value: "MARITIME",                          label: "Marítimo" },
  { value: "MARKET_RESEARCH",                   label: "Investigación de mercado" },
  { value: "MARKETING_ADVERTISING",             label: "Marketing y publicidad" },
  { value: "MECHANICAL_OR_INDUSTRIAL_ENGINEERING", label: "Ingeniería industrial" },
  { value: "MEDIA_PRODUCTION",                  label: "Producción de medios" },
  { value: "MEDICAL_EQUIPMENT",                 label: "Equipos médicos" },
  { value: "MEDICAL_PRACTICE",                  label: "Práctica médica" },
  { value: "MENTAL_HEALTH_CARE",                label: "Salud mental" },
  { value: "MINING_METALS",                     label: "Minería y metales" },
  { value: "MOTION_PICTURES_FILM",              label: "Cine" },
  { value: "MUSEUMS_INSTITUTIONS",              label: "Museos" },
  { value: "MUSIC",                             label: "Música" },
  { value: "NANOTECHNOLOGY",                    label: "Nanotecnología" },
  { value: "NEWSPAPERS",                        label: "Periódicos" },
  { value: "NONPROFIT_ORGANIZATION_MANAGEMENT", label: "ONG / Sin fines de lucro" },
  { value: "OIL_ENERGY_SOLAR_GREENTECH",        label: "Energía / Petróleo" },
  { value: "ONLINE_PUBLISHING",                 label: "Publicación online" },
  { value: "OUTSOURCING_OFFSHORING",            label: "Outsourcing" },
  { value: "PACKAGE_FREIGHT_DELIVERY",          label: "Mensajería" },
  { value: "PACKAGING_CONTAINERS",              label: "Envases y embalajes" },
  { value: "PAPER_FOREST_PRODUCTS",             label: "Papel y madera" },
  { value: "PERFORMING_ARTS",                   label: "Artes escénicas" },
  { value: "PHARMACEUTICALS",                   label: "Farmacéutica" },
  { value: "PHILANTHROPY",                      label: "Filantropía" },
  { value: "PHOTOGRAPHY",                       label: "Fotografía" },
  { value: "PLASTICS",                          label: "Plásticos" },
  { value: "POLITICAL_ORGANIZATION",            label: "Política" },
  { value: "PRIMARY_SECONDARY_EDUCATION",       label: "Educación primaria/secundaria" },
  { value: "PRINTING",                          label: "Impresión" },
  { value: "PROFESSIONAL_TRAINING",             label: "Formación profesional" },
  { value: "PROGRAM_DEVELOPMENT",               label: "Desarrollo de programas" },
  { value: "PUBLIC_RELATIONS_PR",               label: "Relaciones públicas" },
  { value: "PUBLIC_SAFETY",                     label: "Seguridad pública" },
  { value: "PUBLISHING_INDUSTRY",               label: "Industria editorial" },
  { value: "RAILROAD_MANUFACTURE",              label: "Ferroviario" },
  { value: "RANCHING",                          label: "Ganadería" },
  { value: "REAL_ESTATE_MORTGAGE",              label: "Inmobiliaria" },
  { value: "RECREATIONAL_FACILITIES_SERVICES",  label: "Recreación" },
  { value: "RELIGIOUS_INSTITUTIONS",            label: "Instituciones religiosas" },
  { value: "RENEWABLES_ENVIRONMENT",            label: "Energía renovable" },
  { value: "RESEARCH",                          label: "Investigación" },
  { value: "RESTAURANTS",                       label: "Restaurantes" },
  { value: "RETAIL",                            label: "Retail / Comercio" },
  { value: "SECURITY_INVESTIGATIONS",           label: "Seguridad e investigaciones" },
  { value: "SEMICONDUCTORS",                    label: "Semiconductores" },
  { value: "SHIPBUILDING",                      label: "Construcción naval" },
  { value: "SPORTING_GOODS",                    label: "Artículos deportivos" },
  { value: "SPORTS",                            label: "Deportes" },
  { value: "STAFFING_RECRUITING",               label: "Reclutamiento" },
  { value: "SUPERMARKETS",                      label: "Supermercados" },
  { value: "TELECOMMUNICATIONS",                label: "Telecomunicaciones" },
  { value: "TEXTILES",                          label: "Textiles" },
  { value: "THINK_TANKS",                       label: "Think tanks" },
  { value: "TOBACCO",                           label: "Tabaco" },
  { value: "TRANSLATION_LOCALIZATION",          label: "Traducción" },
  { value: "TRANSPORTATION_TRUCKING_RAILROAD",  label: "Transporte" },
  { value: "UTILITIES",                         label: "Utilidades / Servicios públicos" },
  { value: "VENTURE_CAPITAL_VC",                label: "Capital de riesgo" },
  { value: "VETERINARY",                        label: "Veterinaria" },
  { value: "WAREHOUSING",                       label: "Almacenamiento" },
  { value: "WHOLESALE",                         label: "Mayorista" },
  { value: "WINE_SPIRITS",                      label: "Vinos y licores" },
  { value: "WIRELESS",                          label: "Inalámbrico" },
  { value: "WRITING_EDITING",                   label: "Escritura y edición" },
];

async function fetchContactInsights(token: string): Promise<ContactInsights> {
  // Timestamp helpers
  const daysAgoMs = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;
  const tsGTE = (days: number) => String(daysAgoMs(days));

  const [
    // ── Source breakdowns ────────────────────────────────────────────────────
    originalSourceCounts,
    latestSourceCounts,
    // ── Lead status ─────────────────────────────────────────────────────────
    leadStatusCounts,
    // ── Industry (from company object) ──────────────────────────────────────
    industryCounts,
    // ── Email health ────────────────────────────────────────────────────────
    hardBounceResult,
    emailIneligibleResult,
    withConversionsResult,
    // ── Activity ────────────────────────────────────────────────────────────
    active30dResult,
    active90dResult,
    neverContactedResult,
    orphanResult,
  ] = await Promise.all([
    // Original source — one query per enum value
    Promise.all(
      ORIGINAL_SOURCES.map(async (src) => {
        const r = await crmSearch(token, "contacts", [
          { filters: [{ propertyName: "hs_analytics_source", operator: "EQ", value: src.value }] },
        ]);
        return { value: src.value, label: src.label, count: r.total };
      })
    ),

    // Latest source — one query per enum value
    Promise.all(
      LATEST_SOURCES.map(async (src) => {
        const r = await crmSearch(token, "contacts", [
          { filters: [{ propertyName: "hs_latest_source", operator: "EQ", value: src.value }] },
        ]);
        return { value: src.value, label: src.label, count: r.total };
      })
    ),

    // Lead status — one query per enum value
    Promise.all(
      LEAD_STATUSES.map(async (ls) => {
        const r = await crmSearch(token, "contacts", [
          { filters: [{ propertyName: "hs_lead_status", operator: "EQ", value: ls.value }] },
        ]);
        return { value: ls.value, label: ls.label, count: r.total };
      })
    ),

    // Industry (company object) — top industries
    Promise.all(
      INDUSTRIES.slice(0, 30).map(async (ind) => {
        const r = await crmSearch(token, "companies", [
          { filters: [{ propertyName: "industry", operator: "EQ", value: ind.value }] },
        ]);
        return { value: ind.value, label: ind.label, count: r.total };
      })
    ),

    // Hard bounce: hs_email_hard_bounce_reason has a value
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "hs_email_hard_bounce_reason", operator: "HAS_PROPERTY" }] },
    ]),

    // Email ineligible: hs_email_optout = true OR hs_email_is_ineligible = true
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "hs_email_optout", operator: "EQ", value: "true" }] },
      { filters: [{ propertyName: "hs_email_is_ineligible", operator: "EQ", value: "true" }] },
    ]),

    // Contacts with at least 1 form conversion
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "num_conversion_events", operator: "GT", value: "0" }] },
    ]),

    // Active last 30 days
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "notes_last_activity", operator: "GTE", value: tsGTE(30) }] },
    ]),

    // Active last 90 days
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "notes_last_activity", operator: "GTE", value: tsGTE(90) }] },
    ]),

    // Never contacted (notes_last_activity is empty)
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "notes_last_activity", operator: "NOT_HAS_PROPERTY" }] },
    ]),

    // Orphan contacts (no owner assigned)
    crmSearch(token, "contacts", [
      { filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }] },
    ]),
  ]);

  return {
    byOriginalSource: originalSourceCounts.filter((s) => s.count > 0),
    byLatestSource:   latestSourceCounts.filter((s) => s.count > 0),
    byLeadStatus:     leadStatusCounts.filter((s) => s.count > 0),
    byIndustry:       industryCounts.filter((s) => s.count > 0),
    hardBounceCount:      hardBounceResult.total,
    emailIneligibleCount: emailIneligibleResult.total,
    withConversionsCount: withConversionsResult.total,
    active30dCount:       active30dResult.total,
    active90dCount:       active90dResult.total,
    neverContactedCount:  neverContactedResult.total,
    orphanContactsCount:  orphanResult.total,
  };
}

// ─── Audit Enrichment (datos adicionales para insights de calidad) ─────────────

export interface AuditEnrichment {
  contacts: {
    /** Sin propietario asignado */
    orphans: number;
    /** Sin ninguna actividad registrada */
    neverContacted: number;
    /** Con actividad en los últimos 30 días */
    active30d: number;
    /** Con al menos 1 conversión de formulario */
    withConversions: number;
    /** Con lead status asignado */
    withLeadStatus: number;
    /** Distribución por lead status */
    byLeadStatus: PropertyBreakdown[];
    /** Distribución por fuente original */
    byOriginalSource: PropertyBreakdown[];
  };
  companies: {
    /** Sin propietario asignado */
    orphans: number;
    /** Con al menos 1 negocio asociado */
    withDeals: number;
    /** Han convertido (tienen hs_date_entered_customer) */
    withCustomerDate: number;
    /** Con actividad en los últimos 30 días */
    active30d: number;
    /** Distribución por fuente original */
    byOriginalSource: PropertyBreakdown[];
    /** Distribución por industria (top 12 industrias más comunes en B2B) */
    byIndustry: PropertyBreakdown[];
  };
}

// Top 12 industrias B2B más comunes en LATAM
const TOP_INDUSTRIES_B2B: { value: string; label: string }[] = [
  { value: "COMPUTER_SOFTWARE_ENGINEERING",      label: "Software" },
  { value: "INFORMATION_TECHNOLOGY_IT_SERVICES", label: "IT / Tecnología" },
  { value: "MARKETING_ADVERTISING",              label: "Marketing y publicidad" },
  { value: "FINANCIAL_SERVICES",                 label: "Servicios financieros" },
  { value: "MANAGEMENT_CONSULTING",              label: "Consultoría" },
  { value: "RETAIL",                             label: "Retail / Comercio" },
  { value: "EDUCATION_MANAGEMENT",               label: "Educación" },
  { value: "CONSTRUCTION",                       label: "Construcción" },
  { value: "INTERNET",                           label: "Internet" },
  { value: "TELECOMMUNICATIONS",                 label: "Telecomunicaciones" },
  { value: "PROFESSIONAL_TRAINING",              label: "Formación profesional" },
  { value: "FOOD_BEVERAGES",                     label: "Alimentos y bebidas" },
];

/**
 * Obtiene datos de enriquecimiento adicionales para generar insights de calidad.
 * Se ejecuta en bloques secuenciales/pequeños para no superar el rate limit de HubSpot.
 * Tiempo estimado: ~10-15 segundos.
 */
export async function fetchAuditEnrichment(token: string): Promise<AuditEnrichment> {
  const tsGTE = (days: number) => String(Date.now() - days * 24 * 60 * 60 * 1000);

  // ── Bloque 1: higiene de contactos (secuencial, 5 queries × 300 ms) ────────
  const cOrphans = await crmSearch(token, "contacts", [
    { filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }] },
  ]);
  await sleep(300);
  const cNeverContacted = await crmSearch(token, "contacts", [
    { filters: [{ propertyName: "notes_last_activity", operator: "NOT_HAS_PROPERTY" }] },
  ]);
  await sleep(300);
  const cActive30d = await crmSearch(token, "contacts", [
    { filters: [{ propertyName: "notes_last_activity", operator: "GTE", value: tsGTE(30) }] },
  ]);
  await sleep(300);
  const cWithConversions = await crmSearch(token, "contacts", [
    { filters: [{ propertyName: "num_conversion_events", operator: "GT", value: "0" }] },
  ]);
  await sleep(300);
  const cWithLeadStatus = await crmSearch(token, "contacts", [
    { filters: [{ propertyName: "hs_lead_status", operator: "HAS_PROPERTY" }] },
  ]);
  await sleep(500);

  // ── Bloque 2: higiene de empresas (secuencial, 4 queries × 300 ms) ─────────
  const coOrphans = await crmSearch(token, "companies", [
    { filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }] },
  ]);
  await sleep(300);
  const coWithDeals = await crmSearch(token, "companies", [
    { filters: [{ propertyName: "num_associated_deals", operator: "GT", value: "0" }] },
  ]);
  await sleep(300);
  const coWithCustomer = await crmSearch(token, "companies", [
    { filters: [{ propertyName: "hs_date_entered_customer", operator: "HAS_PROPERTY" }] },
  ]);
  await sleep(300);
  const coActive30d = await crmSearch(token, "companies", [
    { filters: [{ propertyName: "hs_lastactivitydate", operator: "GTE", value: tsGTE(30) }] },
  ]);
  await sleep(500);

  // ── Bloque 3: lead status contactos (2 lotes paralelos de 4) ──────────────
  const leadBatch1 = await Promise.all(
    LEAD_STATUSES.slice(0, 4).map(async (ls) => {
      const r = await crmSearch(token, "contacts", [
        { filters: [{ propertyName: "hs_lead_status", operator: "EQ", value: ls.value }] },
      ]);
      return { value: ls.value, label: ls.label, count: r.total };
    })
  );
  await sleep(500);
  const leadBatch2 = await Promise.all(
    LEAD_STATUSES.slice(4).map(async (ls) => {
      const r = await crmSearch(token, "contacts", [
        { filters: [{ propertyName: "hs_lead_status", operator: "EQ", value: ls.value }] },
      ]);
      return { value: ls.value, label: ls.label, count: r.total };
    })
  );
  await sleep(500);

  // ── Bloque 4: fuente original contactos (2 lotes: 5 + 4) ──────────────────
  const cSrcBatch1 = await Promise.all(
    ORIGINAL_SOURCES.slice(0, 5).map(async (src) => {
      const r = await crmSearch(token, "contacts", [
        { filters: [{ propertyName: "hs_analytics_source", operator: "EQ", value: src.value }] },
      ]);
      return { value: src.value, label: src.label, count: r.total };
    })
  );
  await sleep(500);
  const cSrcBatch2 = await Promise.all(
    ORIGINAL_SOURCES.slice(5).map(async (src) => {
      const r = await crmSearch(token, "contacts", [
        { filters: [{ propertyName: "hs_analytics_source", operator: "EQ", value: src.value }] },
      ]);
      return { value: src.value, label: src.label, count: r.total };
    })
  );
  await sleep(500);

  // ── Bloque 5: fuente original empresas (2 lotes: 5 + 4) ───────────────────
  const coSrcBatch1 = await Promise.all(
    ORIGINAL_SOURCES.slice(0, 5).map(async (src) => {
      const r = await crmSearch(token, "companies", [
        { filters: [{ propertyName: "hs_analytics_source", operator: "EQ", value: src.value }] },
      ]);
      return { value: src.value, label: src.label, count: r.total };
    })
  );
  await sleep(500);
  const coSrcBatch2 = await Promise.all(
    ORIGINAL_SOURCES.slice(5).map(async (src) => {
      const r = await crmSearch(token, "companies", [
        { filters: [{ propertyName: "hs_analytics_source", operator: "EQ", value: src.value }] },
      ]);
      return { value: src.value, label: src.label, count: r.total };
    })
  );
  await sleep(500);

  // ── Bloque 6: industrias empresas (2 lotes de 6) ──────────────────────────
  const indBatch1 = await Promise.all(
    TOP_INDUSTRIES_B2B.slice(0, 6).map(async (ind) => {
      const r = await crmSearch(token, "companies", [
        { filters: [{ propertyName: "industry", operator: "EQ", value: ind.value }] },
      ]);
      return { value: ind.value, label: ind.label, count: r.total };
    })
  );
  await sleep(500);
  const indBatch2 = await Promise.all(
    TOP_INDUSTRIES_B2B.slice(6).map(async (ind) => {
      const r = await crmSearch(token, "companies", [
        { filters: [{ propertyName: "industry", operator: "EQ", value: ind.value }] },
      ]);
      return { value: ind.value, label: ind.label, count: r.total };
    })
  );

  return {
    contacts: {
      orphans:         cOrphans.total,
      neverContacted:  cNeverContacted.total,
      active30d:       cActive30d.total,
      withConversions: cWithConversions.total,
      withLeadStatus:  cWithLeadStatus.total,
      byLeadStatus:    [...leadBatch1, ...leadBatch2].filter((s) => s.count > 0),
      byOriginalSource: [...cSrcBatch1, ...cSrcBatch2].filter((s) => s.count > 0),
    },
    companies: {
      orphans:         coOrphans.total,
      withDeals:       coWithDeals.total,
      withCustomerDate: coWithCustomer.total,
      active30d:       coActive30d.total,
      byOriginalSource: [...coSrcBatch1, ...coSrcBatch2].filter((s) => s.count > 0),
      byIndustry:      [...indBatch1, ...indBatch2].filter((s) => s.count > 0),
    },
  };
}

// ─── Lifecycle Snapshot (lightweight, para Auditorías) ────────────────────────

export interface LifecycleSnapshot {
  lifecycleStats: LifecycleStats;
  ownerStats?: OwnerAssignmentStats;
  capturedAt: string;
  insights?: AuditInsights;
}

/** Obtiene un token fresco (refresca si está por vencer) sin cargar el estado completo del portal */
export async function getFreshToken(accountId: string): Promise<string> {
  const account = await prisma.hubspotAccount.findUnique({
    where: { id: accountId },
    select: { accessToken: true, refreshToken: true, expiresAt: true },
  });
  if (!account) throw new Error(`Account not found: ${accountId}`);

  if (account.expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(account.refreshToken);
    await prisma.hubspotAccount.update({
      where: { id: accountId },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }

  return account.accessToken;
}

/**
 * Obtiene estadísticas de asignación de propietarios a contactos:
 *   - Distribución por propietario (contactCount por owner)
 *   - Contactos sin propietario
 *   - Asignaciones mensuales en los últimos 12 meses (hubspot_owner_assigneddate)
 *
 * ~25-40 llamadas API en total. Tiempo estimado: 5-10s.
 */
async function fetchOwnerAssignmentStats(token: string): Promise<OwnerAssignmentStats> {
  // ── 1. Lista de propietarios ─────────────────────────────────────────────
  type HubOwner = { id: string; firstName?: string; lastName?: string; email?: string };
  const ownersRes = await fetch(
    "https://api.hubapi.com/crm/v3/owners?limit=500&archived=false",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const ownersData = ownersRes.ok
    ? ((await ownersRes.json()) as { results?: HubOwner[] })
    : { results: [] };
  const owners = ownersData.results ?? [];
  await sleep(300);

  // ── 2. Conteo de contactos por propietario (lotes de 4) ─────────────────
  const ownerCounts: OwnerContactStat[] = [];
  const OWNER_BATCH = 4;
  for (let i = 0; i < owners.length; i += OWNER_BATCH) {
    const batch = owners.slice(i, i + OWNER_BATCH);
    const results = await Promise.all(
      batch.map(async (o) => {
        const r = await crmSearch(token, "contacts", [
          { filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: o.id }] },
        ]);
        const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || `Owner ${o.id}`;
        return { ownerId: o.id, ownerName: name, email: o.email, contactCount: r.total };
      })
    );
    ownerCounts.push(...results);
    await sleep(350);
  }

  // ── 3. Contactos sin propietario ────────────────────────────────────────
  const unassignedRes = await crmSearch(token, "contacts", [
    { filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }] },
  ]);
  const unassigned = unassignedRes.total;
  await sleep(300);

  // ── 4. Asignaciones mensuales — últimos 12 meses ────────────────────────
  const now = new Date();
  type MonthRange = { start: number; end: number; month: string; label: string };
  const monthRanges: MonthRange[] = [];

  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const rawLabel = d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).replace(".", "");
    monthRanges.push({ start, end, month, label });
  }

  const monthlyAssignments: MonthlyAssignmentStat[] = [];
  const monthlyCreated: MonthlyAssignmentStat[] = [];
  // Batch de 2 meses × 2 queries/mes = 4 requests paralelas por iteración (seguro)
  const MONTH_BATCH = 2;
  for (let i = 0; i < monthRanges.length; i += MONTH_BATCH) {
    const batch = monthRanges.slice(i, i + MONTH_BATCH);
    const results = await Promise.all(
      batch.flatMap((mr) => [
        // Asignaciones de propietario
        crmSearch(token, "contacts", [
          {
            filters: [
              { propertyName: "hubspot_owner_assigneddate", operator: "GTE", value: String(mr.start) },
              { propertyName: "hubspot_owner_assigneddate", operator: "LTE", value: String(mr.end) },
            ],
          },
        ]).then((r) => ({ type: "assigned" as const, month: mr.month, label: mr.label, count: r.total })),
        // Contactos creados
        crmSearch(token, "contacts", [
          {
            filters: [
              { propertyName: "createdate", operator: "GTE", value: String(mr.start) },
              { propertyName: "createdate", operator: "LTE", value: String(mr.end) },
            ],
          },
        ]).then((r) => ({ type: "created" as const, month: mr.month, label: mr.label, count: r.total })),
      ])
    );
    for (const r of results) {
      if (r.type === "assigned") monthlyAssignments.push({ month: r.month, label: r.label, count: r.count });
      else monthlyCreated.push({ month: r.month, label: r.label, count: r.count });
    }
    await sleep(300);
  }

  // ── Resultado ────────────────────────────────────────────────────────────
  const sortedOwners = ownerCounts
    .filter((o) => o.contactCount > 0)
    .sort((a, b) => b.contactCount - a.contactCount);

  const totalAssigned = sortedOwners.reduce((sum, o) => sum + o.contactCount, 0);

  return { owners: sortedOwners, unassigned, totalAssigned, monthlyAssignments, monthlyCreated };
}

/** Construye un snapshot liviano con solo las estadísticas de ciclo de vida.
 *  Usado por la feature de Auditorías para no cargar el estado completo del portal. */
export async function buildLifecycleSnapshot(accountId: string): Promise<LifecycleSnapshot> {
  const token = await getFreshToken(accountId);
  const [lifecycleStats, ownerStats] = await Promise.all([
    fetchLifecycleStats(token, []),
    fetchOwnerAssignmentStats(token),
  ]);
  return { lifecycleStats, ownerStats, capturedAt: new Date().toISOString() };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function buildPortalSnapshot(accountId: string): Promise<PortalSnapshot> {
  // readAccountState refreshes token if needed
  const accountState = await readAccountState(accountId);

  // Read fresh token from DB (after possible refresh above)
  const account = await prisma.hubspotAccount.findUnique({
    where: { id: accountId },
    select: { accessToken: true },
  });
  const token = account?.accessToken ?? "";

  const pipelineCount = Object.values(accountState.pipelines).flat().length;
  const customObjectsCount = accountState.customObjects.length;

  const [accountDetails, lifecycleStats, pipelineActivity, contactInsights] = await Promise.all([
    fetchAccountDetails(token, customObjectsCount, pipelineCount),
    fetchLifecycleStats(token, accountState.workflows),
    fetchPipelineActivity(token, accountState.pipelines),
    fetchContactInsights(token),
  ]);

  return {
    accountState,
    accountDetails,
    lifecycleStats,
    pipelineActivity,
    contactInsights,
    fetchedAt: new Date().toISOString(),
  };
}
