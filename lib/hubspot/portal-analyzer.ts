import { prisma } from "@/lib/db/prisma";
import { refreshAccessToken, tokenDeCuenta } from "./client";
import { readAccountState, HubspotAccountState, PipelineDef } from "./reader";
import {
  crearLector,
  nuevoRegistro,
  VERSION_DEL_REGISTRO,
  type LectorDeHubspot,
  type RegistroDeLecturas,
} from "@/lib/auditoria-portal/lecturas";

// ⚠ Toda lectura de HubSpot de este archivo pasa por el LECTOR de `lib/auditoria-portal/lecturas.ts`:
// un número que no se pudo leer es `null` y queda anotado con su motivo, nunca un 0. Ver el
// encabezado de ese archivo y su test (que prohíbe `fetch` directo acá).

/** El registro de lecturas tal como se guarda dentro de una foto. */
export interface LecturasDeLaFoto extends RegistroDeLecturas {
  version: number;
}

function cerrarRegistro(registro: RegistroDeLecturas): LecturasDeLaFoto {
  return { version: VERSION_DEL_REGISTRO, intentos: registro.intentos, fallidas: registro.fallidas };
}

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

/** Una etapa con su conteo YA VERIFICADO. Es lo que pintan los gráficos. */
export interface LifecycleStageCount {
  value: string;
  label: string;
  count: number;
}

/** Una etapa tal como se leyó: `count: null` = no se pudo leer (el motivo está en las lecturas). */
export interface ConteoDeEtapaLeido {
  value: string;
  label: string;
  count: number | null;
}

/** Lo que se leyó del ciclo de vida. Cada `null` es una lectura que falló, nunca un cero. */
export interface LifecycleStats {
  contacts: ConteoDeEtapaLeido[];
  companies: ConteoDeEtapaLeido[];
  totalContacts: number | null;
  totalCompanies: number | null;
  totalDeals: number | null;
  totalTickets: number | null;
  /** `null` = no se pudo leer la lista de workflows (distinto de `[]`: se leyó y no hay ninguno). */
  lifecycleWorkflows: string[] | null;
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

/** La asignación de propietarios YA VERIFICADA (todas sus lecturas salieron). Es lo que se pinta. */
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

/**
 * La asignación tal como se leyó. Un propietario, un mes o los «sin propietario» que no se
 * pudieron leer quedan en `null`. Con cualquier `null` la sección entera es «sin leer»: un total
 * asignado que suma solo a los que salieron sería un número inventado.
 */
export interface PropietariosLeidos {
  owners: { ownerId: string; ownerName: string; email?: string; contactCount: number | null }[];
  unassigned: number | null;
  monthlyAssignments: { month: string; label: string; count: number | null }[];
  monthlyCreated: { month: string; label: string; count: number | null }[];
  /** Suma de los propietarios leídos. Solo es el total real si no hay ningún `null`. */
  totalAssigned: number;
}

export interface PipelineActivity {
  avgLastModifiedDate: string | null;
  /** `null` = no se pudo leer el pipeline. */
  totalDeals: number | null;
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

/**
 * En las distribuciones (`by…`) una categoría que no se pudo leer NO aparece y queda anotada en
 * las lecturas. En los conteos sueltos, `null` = no se pudo leer.
 */
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
  hardBounceCount: number | null;
  /** Contactos no aptos para email (unsubscribed u opt-out) */
  emailIneligibleCount: number | null;
  /** Contactos con conversiones de formulario (num_conversion_events > 0) */
  withConversionsCount: number | null;

  // ── Actividad reciente ────────────────────────────────────────────────────
  /** Contactos con actividad en últimos 30 días */
  active30dCount: number | null;
  /** Contactos con actividad en últimos 90 días */
  active90dCount: number | null;
  /** Contactos sin ninguna actividad registrada (sin «Fecha de la última actividad») */
  neverContactedCount: number | null;
  /** Contactos sin propietario asignado */
  orphanContactsCount: number | null;
}

export interface PortalSnapshot {
  accountState: HubspotAccountState;
  accountDetails: AccountDetails;
  lifecycleStats: LifecycleStats;
  /** key = pipelineId */
  pipelineActivity: Record<string, PipelineActivity>;
  contactInsights: ContactInsights;
  /** Qué no se pudo leer y por qué. */
  lecturas: LecturasDeLaFoto;
  fetchedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Nombres internos de HubSpot que usa la auditoría. ⚠ Hasta el 2026-10-03 se usaban
 * `notes_last_activity`, `hs_lastactivitydate` y `hs_date_entered_customer` (este último en
 * empresas): NO existen en el portal de Smarteam, HubSpot respondía 400 y la auditoría lo guardaba
 * como 0 — el análisis recibía «0 contactos sin actividad» cuando, medido el 2026-10-03, eran
 * 6.115 de 13.145. Si un portal no tiene alguna de estas, la lectura falla A LA VISTA.
 */
/** «Fecha de la última actividad» (contactos y empresas). */
const PROP_ULTIMA_ACTIVIDAD = "notes_last_updated";
/** «Fecha en que pasó a Cliente» (versión vigente de las fechas de etapa). */
const PROP_PASO_A_CLIENTE = "hs_v2_date_entered_customer";

/** Pausa entre lotes de lecturas para no rozar el límite de llamadas de HubSpot. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Detecta workflows activos que manipulan la propiedad `lifecyclestage`.
 * Estrategia dual:
 *   1. El nombre del WF contiene palabras clave (lifecycle, ciclo, etapa, stage, o un valor de etapa)
 *   2. El JSON completo del WF contiene "lifecyclestage" en sus acciones
 *      — esto detecta WFs como "WF - Calificación de MQL's" que usan SET_CONTACT_PROPERTY
 *        con propertyName: "lifecyclestage" aunque el nombre no lo mencione.
 *
 * Devuelve `null` si la lista de workflows no se pudo leer: «no hay ninguno» y «no pude mirar» no
 * son lo mismo. ⚠ La API v3 de workflows solo devuelve los de CONTACTOS (los de empresas, negocios
 * y tickets necesitan la v4) — eso lo cubre el inventario de configuración, no este conteo.
 */
async function detectLifecycleWorkflows(
  lector: LectorDeHubspot,
  stageValues: string[]
): Promise<string[] | null> {
  const data = await lector.leer<{ workflows?: Array<Record<string, unknown>> }>(
    "workflows",
    "La lista de workflows del portal",
    "/automation/v3/workflows",
  );
  if (!data) return null;

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
}

const NOMBRE_DEL_OBJETO: Record<string, string> = {
  contacts: "contactos",
  companies: "empresas",
  deals: "negocios",
  tickets: "tickets",
};

/** El total de registros de un objeto CRM (filtro «match-all»: createdate existe en todos), o `null`. */
async function getObjectTotal(lector: LectorDeHubspot, objectType: string): Promise<number | null> {
  return lector.contar("totales", `Total de ${NOMBRE_DEL_OBJETO[objectType] ?? objectType}`, {
    objeto: objectType,
    filterGroups: [{ filters: [{ propertyName: "createdate", operator: "HAS_PROPERTY" }] }],
  });
}

/** Obtiene todas las opciones de la propiedad lifecyclestage desde la API de HubSpot.
 *  Esto incluye tanto las etapas estándar como los valores customizados del portal (ej: "partner").
 *
 *  Si no se pueden leer, sigue con las etapas por defecto de HubSpot PERO lo deja anotado en el
 *  bloque `etapas_del_portal`: con esa falla, los contactos de una etapa propia del portal se
 *  sumarían a «sin etapa», así que los gráficos de etapas no se muestran. */
export async function fetchLifecycleStageOptions(
  lector: LectorDeHubspot
): Promise<Array<{ value: string; label: string }>> {
  const data = await lector.leer<{ options?: Array<{ value: string; label: string; hidden?: boolean }> }>(
    "etapas_del_portal",
    "Las etapas del ciclo de vida que usa el portal",
    "/crm/v3/properties/contacts/lifecyclestage",
  );
  if (!data) return [...LIFECYCLE_STAGES];
  const opts = (data.options ?? []).filter((o) => !o.hidden);
  if (opts.length === 0) return [...LIFECYCLE_STAGES];
  console.log(`[fetchLifecycleStageOptions] ${opts.length} etapas encontradas:`, opts.map(o => o.value).join(", "));
  return opts.map((o) => ({ value: o.value, label: o.label }));
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
  lector: LectorDeHubspot,
  token: string,
  customObjectsCount: number,
  pipelineCount: number
): Promise<AccountDetails> {
  const [tokenData, details] = await Promise.all([
    // Este endpoint lleva el token EN LA RUTA y no en la cabecera (así lo define HubSpot).
    lector.leer<{ hub_id?: number; hub_domain?: string; user?: string; scopes?: string[] }>(
      "cuenta",
      "Los datos de la conexión (portal, usuario y permisos concedidos)",
      `/oauth/v1/access-tokens/${token}`,
      { conToken: false },
    ),
    lector.leer<{
      portalId?: number;
      uiDomain?: string;
      timeZone?: string;
      companyCurrency?: string;
      dataHostingLocation?: string;
      accountType?: string;
    }>("cuenta", "La información de la cuenta (moneda, zona horaria, tipo)", "/account-info/v3/details"),
  ]);

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
}

/**
 * Las etapas del ciclo de vida y los totales de cada objeto. Lo que no se pudo leer queda en `null`
 * y anotado en `registro`. ⚠ El segundo argumento ANTES era la lista de workflows (sin uso); ahora
 * es el registro de la corrida, para que el llamador sepa qué falló.
 */
export async function fetchLifecycleStats(
  token: string,
  registro: RegistroDeLecturas = nuevoRegistro()
): Promise<LifecycleStats> {
  const lector = crearLector(token, registro);

  // ── 1. Etapas dinámicas desde HubSpot (incluye valores custom como "partner") ─
  const stages = await fetchLifecycleStageOptions(lector);
  const stageValues = stages.map((s) => s.value);

  // ── 2. Totales — secuenciales con delay para respetar el rate limit ────────
  // NO usar Promise.all: 4 requests paralelas a CRM Search pueden provocar 429.
  const totalContacts = await getObjectTotal(lector, "contacts");
  await sleep(300);
  const totalCompanies = await getObjectTotal(lector, "companies");
  await sleep(300);
  const totalDeals = await getObjectTotal(lector, "deals");
  await sleep(300);
  const totalTickets = await getObjectTotal(lector, "tickets");
  await sleep(300);

  // ── 3. Stage counts en lotes de 2 (= 4 queries paralelas por lote) ─────────
  // Batch de 4 = 8 queries simultáneas → demasiado para cuentas con límite ~5 req/s
  // Batch de 2 = 4 queries simultáneas → seguro en prácticamente todas las cuentas
  const contactCounts: ConteoDeEtapaLeido[] = [];
  const companyCounts: ConteoDeEtapaLeido[] = [];
  const BATCH = 2;

  const contarEtapa = async (
    objeto: "contacts" | "companies",
    stage: { value: string; label: string },
  ): Promise<ConteoDeEtapaLeido> => ({
    value: stage.value,
    label: stage.label,
    count: await lector.contar(
      objeto === "contacts" ? "contactos_por_etapa" : "empresas_por_etapa",
      `${objeto === "contacts" ? "Contactos" : "Empresas"} en la etapa «${stage.label}»`,
      {
        objeto,
        filterGroups: [{ filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: stage.value }] }],
      },
    ),
  });

  for (let i = 0; i < stages.length; i += BATCH) {
    const batch = stages.slice(i, i + BATCH);

    const [contactBatch, companyBatch] = await Promise.all([
      Promise.all(batch.map((stage) => contarEtapa("contacts", stage))),
      Promise.all(batch.map((stage) => contarEtapa("companies", stage))),
    ]);

    contactCounts.push(...contactBatch);
    companyCounts.push(...companyBatch);

    // Pausa entre TODOS los lotes (incluyendo el último antes de lifecycle workflows)
    await sleep(500);
  }

  // ── 4. Workflows relacionados con lifecycle ───────────────────────────────
  // Detecta por nombre Y por composición (busca "lifecyclestage" en el JSON completo del WF)
  const lifecycleWorkflows = await detectLifecycleWorkflows(lector, stageValues);

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
  lector: LectorDeHubspot,
  pipelines: Record<string, PipelineDef[]>
): Promise<Record<string, PipelineActivity>> {
  const result: Record<string, PipelineActivity> = {};
  const dealPipelines = pipelines["deals"] ?? [];

  await Promise.all(
    dealPipelines.map(async (pipeline) => {
      const data = await lector.buscar(
        "actividad_de_pipelines",
        `Los negocios del pipeline «${pipeline.label}»`,
        {
          objeto: "deals",
          filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipeline.id }] }],
          properties: ["hs_lastmodifieddate"],
          limit: 15,
        },
      );

      if (!data) {
        result[pipeline.id] = {
          avgLastModifiedDate: null,
          totalDeals: null,
          activityLabel: "No se pudo leer",
          activityColor: "gray",
          avgDaysAgo: null,
        };
        return;
      }

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

/** Una distribución por categoría: las que no se pudieron leer no aparecen y quedan anotadas. */
async function distribucion(
  lector: LectorDeHubspot,
  bloque: "detalle_de_contactos" | "detalle_de_empresas",
  objeto: "contacts" | "companies",
  propiedad: string,
  rotulo: string,
  valores: { value: string; label: string }[],
): Promise<PropertyBreakdown[]> {
  const conteos = await Promise.all(
    valores.map(async (v) => ({
      value: v.value,
      label: v.label,
      count: await lector.contar(bloque, `${rotulo}: ${v.label}`, {
        objeto,
        filterGroups: [{ filters: [{ propertyName: propiedad, operator: "EQ", value: v.value }] }],
      }),
    })),
  );
  return conteos.filter((c): c is PropertyBreakdown => c.count !== null && c.count > 0);
}

async function fetchContactInsights(lector: LectorDeHubspot): Promise<ContactInsights> {
  // Timestamp helpers
  const daysAgoMs = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;
  const tsGTE = (days: number) => String(daysAgoMs(days));
  const contarContactos = (que: string, filterGroups: object[]) =>
    lector.contar("detalle_de_contactos", que, { objeto: "contacts", filterGroups });

  const [
    // ── Source breakdowns ────────────────────────────────────────────────────
    byOriginalSource,
    byLatestSource,
    // ── Lead status ─────────────────────────────────────────────────────────
    byLeadStatus,
    // ── Industry (from company object) ──────────────────────────────────────
    byIndustry,
    // ── Email health ────────────────────────────────────────────────────────
    hardBounceCount,
    emailIneligibleCount,
    withConversionsCount,
    // ── Activity ────────────────────────────────────────────────────────────
    active30dCount,
    active90dCount,
    neverContactedCount,
    orphanContactsCount,
  ] = await Promise.all([
    distribucion(lector, "detalle_de_contactos", "contacts", "hs_analytics_source", "Contactos por fuente original", ORIGINAL_SOURCES),
    distribucion(lector, "detalle_de_contactos", "contacts", "hs_latest_source", "Contactos por fuente más reciente", LATEST_SOURCES),
    distribucion(lector, "detalle_de_contactos", "contacts", "hs_lead_status", "Contactos por estado del lead", LEAD_STATUSES),
    distribucion(lector, "detalle_de_empresas", "companies", "industry", "Empresas por industria", INDUSTRIES.slice(0, 30)),

    // Hard bounce: hs_email_hard_bounce_reason has a value
    contarContactos("Contactos con rebote permanente", [
      { filters: [{ propertyName: "hs_email_hard_bounce_reason", operator: "HAS_PROPERTY" }] },
    ]),

    // Email ineligible: hs_email_optout = true OR hs_email_is_ineligible = true
    contarContactos("Contactos que no pueden recibir correos", [
      { filters: [{ propertyName: "hs_email_optout", operator: "EQ", value: "true" }] },
      { filters: [{ propertyName: "hs_email_is_ineligible", operator: "EQ", value: "true" }] },
    ]),

    // Contacts with at least 1 form conversion
    contarContactos("Contactos con al menos una conversión", [
      { filters: [{ propertyName: "num_conversion_events", operator: "GT", value: "0" }] },
    ]),

    // Active last 30 days
    contarContactos("Contactos con actividad en los últimos 30 días", [
      { filters: [{ propertyName: PROP_ULTIMA_ACTIVIDAD, operator: "GTE", value: tsGTE(30) }] },
    ]),

    // Active last 90 days
    contarContactos("Contactos con actividad en los últimos 90 días", [
      { filters: [{ propertyName: PROP_ULTIMA_ACTIVIDAD, operator: "GTE", value: tsGTE(90) }] },
    ]),

    // Never contacted (sin «Fecha de la última actividad»)
    contarContactos("Contactos sin ninguna actividad registrada", [
      { filters: [{ propertyName: PROP_ULTIMA_ACTIVIDAD, operator: "NOT_HAS_PROPERTY" }] },
    ]),

    // Orphan contacts (no owner assigned)
    contarContactos("Contactos sin propietario", [
      { filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }] },
    ]),
  ]);

  return {
    byOriginalSource,
    byLatestSource,
    byLeadStatus,
    byIndustry,
    hardBounceCount,
    emailIneligibleCount,
    withConversionsCount,
    active30dCount,
    active90dCount,
    neverContactedCount,
    orphanContactsCount,
  };
}

// ─── Audit Enrichment (datos adicionales para insights de calidad) ─────────────

/**
 * Cada conteo suelto en `null` = no se pudo leer. En las distribuciones (`by…`), las categorías
 * que no se pudieron leer no aparecen; el detalle queda en el registro de la corrida.
 */
export interface AuditEnrichment {
  contacts: {
    /** Sin propietario asignado */
    orphans: number | null;
    /** Sin ninguna actividad registrada */
    neverContacted: number | null;
    /** Con actividad en los últimos 30 días */
    active30d: number | null;
    /** Con al menos 1 conversión de formulario */
    withConversions: number | null;
    /** Con lead status asignado */
    withLeadStatus: number | null;
    /** Distribución por lead status */
    byLeadStatus: PropertyBreakdown[];
    /** Distribución por fuente original */
    byOriginalSource: PropertyBreakdown[];
  };
  companies: {
    /** Sin propietario asignado */
    orphans: number | null;
    /** Con al menos 1 negocio asociado */
    withDeals: number | null;
    /** Han convertido (tienen fecha de paso a cliente) */
    withCustomerDate: number | null;
    /** Con actividad en los últimos 30 días */
    active30d: number | null;
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
 * Tiempo estimado: ~10-15 segundos. Lo que no se pudo leer queda anotado en `registro`.
 */
export async function fetchAuditEnrichment(
  token: string,
  registro: RegistroDeLecturas = nuevoRegistro()
): Promise<AuditEnrichment> {
  const lector = crearLector(token, registro);
  const tsGTE = (days: number) => String(Date.now() - days * 24 * 60 * 60 * 1000);
  const contar = (
    bloque: "detalle_de_contactos" | "detalle_de_empresas",
    objeto: "contacts" | "companies",
    que: string,
    filters: object[],
  ) => lector.contar(bloque, que, { objeto, filterGroups: [{ filters }] });

  // ── Bloque 1: higiene de contactos (secuencial, 5 queries × 300 ms) ────────
  const cOrphans = await contar("detalle_de_contactos", "contacts", "Contactos sin propietario", [
    { propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" },
  ]);
  await sleep(300);
  const cNeverContacted = await contar("detalle_de_contactos", "contacts", "Contactos sin ninguna actividad registrada", [
    { propertyName: PROP_ULTIMA_ACTIVIDAD, operator: "NOT_HAS_PROPERTY" },
  ]);
  await sleep(300);
  const cActive30d = await contar("detalle_de_contactos", "contacts", "Contactos con actividad en los últimos 30 días", [
    { propertyName: PROP_ULTIMA_ACTIVIDAD, operator: "GTE", value: tsGTE(30) },
  ]);
  await sleep(300);
  const cWithConversions = await contar("detalle_de_contactos", "contacts", "Contactos con al menos una conversión", [
    { propertyName: "num_conversion_events", operator: "GT", value: "0" },
  ]);
  await sleep(300);
  const cWithLeadStatus = await contar("detalle_de_contactos", "contacts", "Contactos con estado del lead", [
    { propertyName: "hs_lead_status", operator: "HAS_PROPERTY" },
  ]);
  await sleep(500);

  // ── Bloque 2: higiene de empresas (secuencial, 4 queries × 300 ms) ─────────
  const coOrphans = await contar("detalle_de_empresas", "companies", "Empresas sin propietario", [
    { propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" },
  ]);
  await sleep(300);
  const coWithDeals = await contar("detalle_de_empresas", "companies", "Empresas con al menos un negocio", [
    { propertyName: "num_associated_deals", operator: "GT", value: "0" },
  ]);
  await sleep(300);
  const coWithCustomer = await contar("detalle_de_empresas", "companies", "Empresas con fecha de paso a cliente", [
    { propertyName: PROP_PASO_A_CLIENTE, operator: "HAS_PROPERTY" },
  ]);
  await sleep(300);
  const coActive30d = await contar("detalle_de_empresas", "companies", "Empresas con actividad en los últimos 30 días", [
    { propertyName: PROP_ULTIMA_ACTIVIDAD, operator: "GTE", value: tsGTE(30) },
  ]);
  await sleep(500);

  // ── Bloque 3: lead status contactos (2 lotes paralelos de 4) ──────────────
  const leadBatch1 = await distribucion(lector, "detalle_de_contactos", "contacts", "hs_lead_status", "Contactos por estado del lead", LEAD_STATUSES.slice(0, 4));
  await sleep(500);
  const leadBatch2 = await distribucion(lector, "detalle_de_contactos", "contacts", "hs_lead_status", "Contactos por estado del lead", LEAD_STATUSES.slice(4));
  await sleep(500);

  // ── Bloque 4: fuente original contactos (2 lotes: 5 + 4) ──────────────────
  const cSrcBatch1 = await distribucion(lector, "detalle_de_contactos", "contacts", "hs_analytics_source", "Contactos por fuente original", ORIGINAL_SOURCES.slice(0, 5));
  await sleep(500);
  const cSrcBatch2 = await distribucion(lector, "detalle_de_contactos", "contacts", "hs_analytics_source", "Contactos por fuente original", ORIGINAL_SOURCES.slice(5));
  await sleep(500);

  // ── Bloque 5: fuente original empresas (2 lotes: 5 + 4) ───────────────────
  const coSrcBatch1 = await distribucion(lector, "detalle_de_empresas", "companies", "hs_analytics_source", "Empresas por fuente original", ORIGINAL_SOURCES.slice(0, 5));
  await sleep(500);
  const coSrcBatch2 = await distribucion(lector, "detalle_de_empresas", "companies", "hs_analytics_source", "Empresas por fuente original", ORIGINAL_SOURCES.slice(5));
  await sleep(500);

  // ── Bloque 6: industrias empresas (2 lotes de 6) ──────────────────────────
  const indBatch1 = await distribucion(lector, "detalle_de_empresas", "companies", "industry", "Empresas por industria", TOP_INDUSTRIES_B2B.slice(0, 6));
  await sleep(500);
  const indBatch2 = await distribucion(lector, "detalle_de_empresas", "companies", "industry", "Empresas por industria", TOP_INDUSTRIES_B2B.slice(6));

  return {
    contacts: {
      orphans:         cOrphans,
      neverContacted:  cNeverContacted,
      active30d:       cActive30d,
      withConversions: cWithConversions,
      withLeadStatus:  cWithLeadStatus,
      byLeadStatus:    [...leadBatch1, ...leadBatch2],
      byOriginalSource: [...cSrcBatch1, ...cSrcBatch2],
    },
    companies: {
      orphans:         coOrphans,
      withDeals:       coWithDeals,
      withCustomerDate: coWithCustomer,
      active30d:       coActive30d,
      byOriginalSource: [...coSrcBatch1, ...coSrcBatch2],
      byIndustry:      [...indBatch1, ...indBatch2],
    },
  };
}

// ─── Lifecycle Snapshot (lightweight, para Auditorías) ────────────────────────

export interface LifecycleSnapshot {
  lifecycleStats: LifecycleStats;
  ownerStats?: PropietariosLeidos;
  capturedAt: string;
  /**
   * Qué no se pudo leer y por qué. AUSENTE en las auditorías anteriores al 2026-10-03: en esas, un
   * cero pudo ser un error de lectura y no hay forma de saberlo.
   */
  lecturas?: LecturasDeLaFoto;
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

  return tokenDeCuenta(account);
}

/**
 * Obtiene estadísticas de asignación de propietarios a contactos:
 *   - Distribución por propietario (contactCount por owner)
 *   - Contactos sin propietario
 *   - Asignaciones mensuales en los últimos 12 meses (hubspot_owner_assigneddate)
 *
 * ~25-40 llamadas API en total. Tiempo estimado: 5-10s. Si la lista de propietarios no se pudo
 * leer, `owners` queda vacío y la falla anotada: la sección entera se muestra como «sin leer».
 */
async function fetchOwnerAssignmentStats(lector: LectorDeHubspot): Promise<PropietariosLeidos> {
  // ── 1. Lista de propietarios ─────────────────────────────────────────────
  type HubOwner = { id: string; firstName?: string; lastName?: string; email?: string };
  const ownersData = await lector.leer<{ results?: HubOwner[] }>(
    "propietarios",
    "La lista de propietarios del portal",
    "/crm/v3/owners?limit=500&archived=false",
  );
  const owners = ownersData?.results ?? [];
  await sleep(300);

  // ── 2. Conteo de contactos por propietario (lotes de 4) ─────────────────
  const ownerCounts: PropietariosLeidos["owners"] = [];
  const OWNER_BATCH = 4;
  for (let i = 0; i < owners.length; i += OWNER_BATCH) {
    const batch = owners.slice(i, i + OWNER_BATCH);
    const results = await Promise.all(
      batch.map(async (o) => {
        const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || `Owner ${o.id}`;
        const contactCount = await lector.contar("propietarios", `Contactos asignados a ${name}`, {
          objeto: "contacts",
          filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: o.id }] }],
        });
        return { ownerId: o.id, ownerName: name, email: o.email, contactCount };
      })
    );
    ownerCounts.push(...results);
    await sleep(350);
  }

  // ── 3. Contactos sin propietario ────────────────────────────────────────
  const unassigned = await lector.contar("propietarios", "Contactos sin propietario", {
    objeto: "contacts",
    filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }] }],
  });
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

  const contarEnElMes = (propiedad: string, que: string, mr: MonthRange) =>
    lector.contar("propietarios", `${que} en ${mr.label}`, {
      objeto: "contacts",
      filterGroups: [
        {
          filters: [
            { propertyName: propiedad, operator: "GTE", value: String(mr.start) },
            { propertyName: propiedad, operator: "LTE", value: String(mr.end) },
          ],
        },
      ],
    });

  const monthlyAssignments: PropietariosLeidos["monthlyAssignments"] = [];
  const monthlyCreated: PropietariosLeidos["monthlyCreated"] = [];
  // Batch de 2 meses × 2 queries/mes = 4 requests paralelas por iteración (seguro)
  const MONTH_BATCH = 2;
  for (let i = 0; i < monthRanges.length; i += MONTH_BATCH) {
    const batch = monthRanges.slice(i, i + MONTH_BATCH);
    const results = await Promise.all(
      batch.flatMap((mr) => [
        // Asignaciones de propietario
        contarEnElMes("hubspot_owner_assigneddate", "Asignaciones de propietario", mr).then((count) => ({
          type: "assigned" as const, month: mr.month, label: mr.label, count,
        })),
        // Contactos creados
        contarEnElMes("createdate", "Contactos creados", mr).then((count) => ({
          type: "created" as const, month: mr.month, label: mr.label, count,
        })),
      ])
    );
    for (const r of results) {
      if (r.type === "assigned") monthlyAssignments.push({ month: r.month, label: r.label, count: r.count });
      else monthlyCreated.push({ month: r.month, label: r.label, count: r.count });
    }
    await sleep(300);
  }

  // ── Resultado ────────────────────────────────────────────────────────────
  // Se conservan los propietarios con conteo > 0 Y los que no se pudieron leer: descartar estos
  // últimos escondería la falla.
  const sortedOwners = ownerCounts
    .filter((o) => o.contactCount === null || o.contactCount > 0)
    .sort((a, b) => (b.contactCount ?? -1) - (a.contactCount ?? -1));

  const totalAssigned = sortedOwners.reduce((sum, o) => sum + (o.contactCount ?? 0), 0);

  return { owners: sortedOwners, unassigned, totalAssigned, monthlyAssignments, monthlyCreated };
}

/** Construye un snapshot liviano con solo las estadísticas de ciclo de vida.
 *  Usado por la feature de Auditorías para no cargar el estado completo del portal. */
/**
 * Lo que la auditoría lee del ciclo de vida y de los propietarios, anotando en `registro` (el de la
 * corrida entera: la captura junta acá el ciclo, los propietarios, el detalle y el inventario).
 */
export async function capturarCicloYPropietarios(
  token: string,
  registro: RegistroDeLecturas,
): Promise<{ lifecycleStats: LifecycleStats; ownerStats: PropietariosLeidos }> {
  const [lifecycleStats, ownerStats] = await Promise.all([
    fetchLifecycleStats(token, registro),
    fetchOwnerAssignmentStats(crearLector(token, registro)),
  ]);
  return { lifecycleStats, ownerStats };
}

/** Los datos de la cuenta (moneda, zona horaria, dónde se alojan los datos, permisos concedidos). */
export async function leerCuentaDelPortal(token: string, registro: RegistroDeLecturas): Promise<AccountDetails> {
  return fetchAccountDetails(crearLector(token, registro), token, 0, 0);
}

export async function buildLifecycleSnapshot(accountId: string): Promise<LifecycleSnapshot> {
  const token = await getFreshToken(accountId);
  const registro = nuevoRegistro();
  const [lifecycleStats, ownerStats] = await Promise.all([
    fetchLifecycleStats(token, registro),
    fetchOwnerAssignmentStats(crearLector(token, registro)),
  ]);
  return {
    lifecycleStats,
    ownerStats,
    capturedAt: new Date().toISOString(),
    lecturas: cerrarRegistro(registro),
  };
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
  const token = account ? tokenDeCuenta(account) : "";

  const pipelineCount = Object.values(accountState.pipelines).flat().length;
  const customObjectsCount = accountState.customObjects.length;

  const registro = nuevoRegistro();
  const lector = crearLector(token, registro);
  const [accountDetails, lifecycleStats, pipelineActivity, contactInsights] = await Promise.all([
    fetchAccountDetails(lector, token, customObjectsCount, pipelineCount),
    fetchLifecycleStats(token, registro),
    fetchPipelineActivity(lector, accountState.pipelines),
    fetchContactInsights(lector),
  ]);

  return {
    accountState,
    accountDetails,
    lifecycleStats,
    pipelineActivity,
    contactInsights,
    lecturas: cerrarRegistro(registro),
    fetchedAt: new Date().toISOString(),
  };
}
