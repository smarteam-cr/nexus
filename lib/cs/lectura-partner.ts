/**
 * lib/cs/lectura-partner.ts — lo que dice HubSpot Partner Clients de UNA cuenta, leído del crudo
 * (2026-10-04). PURO y CLIENT-SAFE.
 *
 * El sync (`lib/cs/partner-sync.ts`) guarda las ~172 propiedades crudas en
 * `ClientPartnerSnapshot.properties`. Hasta hoy la pantalla solo leía una docena (las que tienen
 * columna propia). Esta lectura saca del crudo todo lo que sirve para Customer Success —sin tocar
 * la base ni HubSpot— y la usan las dos pantallas y el agente vigía, así no pueden leer distinto.
 *
 * ── LO QUE SE MIDIÓ ANTES DE ESCRIBIRLA (copia del 10 jul, 157 registros) ─────────────────────
 *  · El uso (`hs_unified_usage_score`) y casi todo lo de producto solo viene en las cuentas que
 *    Smarteam GESTIONA (55 con puntaje). En las demás, vacío: eso es «sin dato», nunca cero.
 *  · La tendencia de 4 semanas viene como fracción (−0,18 … 0,01). Se muestra como porcentaje.
 *  · `hs_renewal_mrr` suma más que el MRR total de la cartera (161 mil contra 111 mil): no se
 *    entiende qué mide y NO se usa. Lo que renueva se arma con el monto de cada hub.
 *  · Los puntos de nivel no se actualizan desde el 26 nov 2025 (`hs_tiering_properties_updated_at`):
 *    viajan con su fecha.
 *  · Ningún cliente renueva hubs en fechas distintas, pero la lectura lo soporta.
 *
 * ⛔ INTERNO: uso, MRR, puntos y comisión son datos de partner (términos con HubSpot). Nunca van a
 * un documento del cliente.
 */

export const HUBS_DE_PARTNER = ["marketing", "sales", "service", "operations", "content", "commerce"] as const;
export type HubDePartner = (typeof HUBS_DE_PARTNER)[number];

export const NOMBRE_DEL_HUB: Record<HubDePartner, string> = {
  marketing: "Marketing Hub",
  sales: "Sales Hub",
  service: "Service Hub",
  operations: "Operations Hub",
  content: "Content Hub",
  commerce: "Commerce Hub",
};

/** Cómo nombra HubSpot cada hub en cada familia de propiedades (no son todas iguales). */
const CLAVES: Record<
  HubDePartner,
  { tiene: string; activado: string | null; uso: string | null; porActivar: string | null; licencias: string | null }
> = {
  marketing: { tiene: "hs_has_marketing_hub", activado: "hs_is_marketing_hub_activated", uso: "hs_marketing_hub_usage_score", porActivar: "hs_marketing_hub_tools_to_activate", licencias: null },
  sales: { tiene: "hs_has_sales_hub", activado: "hs_is_sales_hub_activated", uso: "hs_sales_hub_usage_score", porActivar: "hs_sales_hub_tools_to_activate", licencias: "hs_sales_seats" },
  service: { tiene: "hs_has_service_hub", activado: "hs_is_service_hub_activated", uso: "hs_service_hub_usage_score", porActivar: "hs_service_hub_tools_to_activate", licencias: "hs_service_seats" },
  operations: { tiene: "hs_has_operations_hub", activado: "hs_is_operations_hub_activated", uso: null, porActivar: null, licencias: null },
  content: { tiene: "hs_has_cms_hub", activado: "hs_is_cms_hub_activated", uso: null, porActivar: null, licencias: null },
  commerce: { tiene: "hs_has_commerce_hub", activado: "hs_is_commerce_hub_activated", uso: "hs_commerce_hub_usage_score", porActivar: null, licencias: "hs_commerce_hub_seats" },
};

/** Las señales de ingresos de HubSpot, dichas en español. Una que no está acá se muestra tal cual. */
export const NOMBRE_DE_LA_SENAL: Record<string, string> = {
  "Customer Agent": "agente de clientes",
  "Prospecting Agent": "agente de prospección",
  "Predicted Cross-Sell": "venta cruzada",
  "Predicted Upsell": "subir de plan",
  "Credits Limit": "límite de créditos",
  "SFDC Compete Campaign": "campaña contra Salesforce",
  "Upcoming HubSpot Renewal": "renovación próxima",
};

/** La señal que no es de crecimiento sino de renovación: va a Renovaciones, no a Crecimiento. */
export const SENAL_DE_RENOVACION = "Upcoming HubSpot Renewal";

export interface Cupo {
  usados: number;
  limite: number;
}

export interface LicenciasDeUnTipo {
  asignadas: number | null;
  libres: number | null;
  limite: number | null;
}

export interface HubDeLaCuenta {
  hub: HubDePartner;
  nombre: string;
  /** «Professional», «Enterprise», «Starter», o null. */
  plan: string | null;
  /** HubSpot dice si el hub está activado. null = no lo dice. */
  activado: boolean | null;
  /** Puntaje de uso del hub (0–100). null = HubSpot no lo mide (Operations, Content) o no vino. */
  uso: number | null;
  /** Lo que HubSpot dice que falta activar («Scale Support»). Frases generales, no herramientas. */
  porActivar: string[];
  licencias: LicenciasDeUnTipo | null;
  /** AAAA-MM-DD. */
  renovacion: string | null;
  /** Lo que paga por este hub al mes, en `moneda`. */
  montoMensual: number | null;
}

export interface SenalDeIngresos {
  tipo: string;
  etiqueta: string;
  esRenovacion: boolean;
}

export interface LecturaDePartner {
  /** HubSpot la tiene como cliente activo. */
  activa: boolean;
  gestionada: boolean;
  vendida: boolean;
  portalBorrado: boolean;
  /** Puntaje de uso de toda la plataforma (0–100, comparado con cuentas parecidas). */
  uso: number | null;
  /** Cambio del uso en 4 semanas, como fracción (−0,12 = cayó 12 %). */
  tendencia: number | null;
  nivelDeUso: "alto" | "medio" | "bajo" | null;
  /** Solo los hubs que la cuenta tiene (contratados o con plan, monto o renovación). */
  hubs: HubDeLaCuenta[];
  licenciasPrincipales: LicenciasDeUnTipo | null;
  contactosDeMarketing: Cupo | null;
  correosDelMes: Cupo | null;
  creditos: (Cupo & { reinicio: string | null; compraAutomatica: boolean | null }) | null;
  /** MRR total de la suscripción y el gestionado por Smarteam (en dólares, como los da HubSpot). */
  mrrTotal: number | null;
  mrrGestionado: number | null;
  /** Moneda de los montos por hub. */
  moneda: string | null;
  /** Cuánto espera HubSpot que cambie el MRR al renovar (negativo = baja de plan). */
  cambioAlRenovar: number | null;
  proximaRenovacion: string | null;
  cancelacion: { hubs: string[]; fecha: string | null } | null;
  /** AAAA-MM-DD estimada por HubSpot: sin actividad de Smarteam en 60 días se pierde. */
  relacionGestionadaVence: string | null;
  /** ISO: la última vez que alguien de Smarteam hizo algo en el portal (según HubSpot). */
  ultimaActividadDeSmarteam: string | null;
  /** Cuántos partners gestionan la cuenta. 2 = la comparte con otro (los puntos se dividen). */
  partnersQueGestionan: number | null;
  senales: SenalDeIngresos[];
  senalExplicacion: string | null;
  senalComoPlantearlo: string | null;
  apps: string[];
  /** AAAA-MM-DD: desde cuándo es cliente (la relación con HubSpot vía Smarteam). */
  clienteDesde: string | null;
  pais: string | null;
  enlacePortal: string | null;
  csmHubspot: string | null;
  growthHubspot: string | null;
  contratosHubspot: string | null;
  nivel: {
    vendidos: number | null;
    gestionados: number | null;
    total: number | null;
    mercado: string | null;
    multiplicador: number | null;
    /** ISO: cuándo HubSpot actualizó los puntos por última vez. */
    actualizadoEn: string | null;
    comision: number | null;
    comisionCalculadaEn: string | null;
  };
}

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

/** HubSpot da fechas como epoch en ms (texto) o ISO. → ISO, o null. */
function instante(p: Props, k: string): string | null {
  const t = texto(p, k);
  if (t === null) return null;
  const ms = /^\d{10,}$/.test(t) ? Number(t) : Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function dia(p: Props, k: string): string | null {
  return instante(p, k)?.slice(0, 10) ?? null;
}

function plan(p: Props, k: string): string | null {
  const t = texto(p, k);
  if (!t || /^(none|free)$/i.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function lista(t: string | null, separador: RegExp): string[] {
  if (!t) return [];
  return t
    .split(separador)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** HTML de HubSpot → texto plano de una línea. */
export function textoPlano(html: string | null, tope = 600): string | null {
  if (!html) return null;
  // Cada bloque (párrafo, ítem, título) es una línea; las etiquetas de adentro se borran sin
  // dejar espacio, así «<b>uso</b>:» queda «uso:».
  const lineas = html
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/ul|\/ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // Se unen con punto, salvo que la línea anterior ya cierre (con «:» la siguiente la completa).
  const t = lineas.reduce((acc, l) => (!acc ? l : /[.:;!?]$/.test(acc) ? `${acc} ${l}` : `${acc}. ${l}`), "");
  if (!t) return null;
  return t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t;
}

function licencias(p: Props, prefijo: string): LicenciasDeUnTipo | null {
  const asignadas = numero(p, `${prefijo}_assigned`);
  const libres = numero(p, `${prefijo}_available`);
  const limite = numero(p, `${prefijo}_limit`);
  if (asignadas === null && libres === null && limite === null) return null;
  if (!limite && !asignadas) return null;
  return { asignadas, libres, limite };
}

function cupo(usados: number | null, limite: number | null): Cupo | null {
  return usados !== null && limite !== null && limite > 0 ? { usados, limite } : null;
}

/** Lee el crudo de Partner Clients. null si no hay crudo. */
export function leerPartner(properties: unknown): LecturaDePartner | null {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  const p = properties as Props;

  const moneda = texto(p, "hs_managed_local_mrr_currency");
  const hubs: HubDeLaCuenta[] = [];
  for (const hub of HUBS_DE_PARTNER) {
    const k = CLAVES[hub];
    const h: HubDeLaCuenta = {
      hub,
      nombre: NOMBRE_DEL_HUB[hub],
      plan: plan(p, `hs_${hub}_hub_edition`),
      activado: k.activado ? booleano(p, k.activado) : null,
      uso: k.uso ? numero(p, k.uso) : null,
      porActivar: lista(k.porActivar ? texto(p, k.porActivar) : null, /\s*[,;]\s*/),
      licencias: k.licencias ? licencias(p, k.licencias) : null,
      renovacion: dia(p, `hs_${hub}_hub_renewal_date`),
      montoMensual: (() => {
        const n = numero(p, `hs_${hub}_hub_mrr`);
        return n !== null && n > 0 ? n : null;
      })(),
    };
    const tiene = booleano(p, k.tiene);
    if (tiene === true || (tiene === null && (h.plan || h.montoMensual || h.renovacion))) hubs.push(h);
  }

  const cancelacionHubs = lista(texto(p, "hs_cancellation_products"), /\s*;\s*/);
  const fechaCancelacion = dia(p, "hs_next_cancellation_date");
  const senales = lista(texto(p, "hs_revenue_signals"), /\s*;\s*/).map((tipo) => ({
    tipo,
    etiqueta: NOMBRE_DE_LA_SENAL[tipo] ?? tipo,
    esRenovacion: tipo === SENAL_DE_RENOVACION,
  }));
  const incluidos = numero(p, "hs_included_hubspot_credits_monthly_limit");
  const adicionales = numero(p, "hs_additional_hubspot_credits_monthly_limit") ?? 0;
  const creditosUsados = numero(p, "hs_credits_usage");
  const creditos =
    incluidos !== null && creditosUsados !== null && incluidos + adicionales > 0
      ? {
          usados: creditosUsados,
          limite: incluidos + adicionales,
          reinicio: dia(p, "hs_next_hubspot_credit_reset_date"),
          compraAutomatica: (() => {
            const s = texto(p, "hs_credits_overage_setting");
            return s === null ? null : s !== "DISABLED";
          })(),
        }
      : null;
  const nivelDeUso = texto(p, "hs_platform_engagement_level")?.toLowerCase();

  return {
    activa: booleano(p, "hs_is_active") === true,
    gestionada: booleano(p, "hs_is_managed") === true,
    vendida: booleano(p, "hs_is_sold") === true,
    portalBorrado: booleano(p, "hs_client_portal_purged") === true,
    uso: numero(p, "hs_unified_usage_score"),
    tendencia: numero(p, "hs_last_4_weeks_usage_score_trend"),
    nivelDeUso: nivelDeUso === "alto" || nivelDeUso === "high" ? "alto" : nivelDeUso === "medium" ? "medio" : nivelDeUso === "low" ? "bajo" : null,
    hubs,
    licenciasPrincipales: licencias(p, "hs_core_seats"),
    contactosDeMarketing: cupo(numero(p, "hs_marketing_contacts_usage"), numero(p, "hs_marketing_contacts_limit")),
    correosDelMes: cupo(numero(p, "hs_monthly_email_sends_usage"), numero(p, "hs_monthly_email_sends_limit")),
    creditos,
    mrrTotal: numero(p, "hs_total_subscription_mrr"),
    mrrGestionado: numero(p, "hs_managed_mrr"),
    moneda,
    cambioAlRenovar: numero(p, "hs_renewal_mrr_change"),
    proximaRenovacion: dia(p, "hs_next_renewal_date"),
    cancelacion: cancelacionHubs.length > 0 || fechaCancelacion ? { hubs: cancelacionHubs, fecha: fechaCancelacion } : null,
    relacionGestionadaVence: dia(p, "hs_managed_relationship_estimated_expiration_date"),
    ultimaActividadDeSmarteam: instante(p, "hs_last_active_partner_employee_active_at"),
    partnersQueGestionan: numero(p, "hs_number_of_managing_partners"),
    senales,
    senalExplicacion: textoPlano(texto(p, "hs_revenue_signal_explanation")),
    senalComoPlantearlo: textoPlano(texto(p, "hs_revenue_signal_positioning"), 900),
    apps: lista(texto(p, "hs_all_apps"), /\s*,\s*/),
    clienteDesde: dia(p, "hs_relationship_start_date"),
    pais: texto(p, "hs_country"),
    enlacePortal: texto(p, "hs_account_link"),
    csmHubspot: texto(p, "hs_success_owner_name"),
    growthHubspot: texto(p, "hs_sales_owner_name"),
    contratosHubspot: texto(p, "hs_contract_manager_name"),
    nivel: {
      vendidos: numero(p, "hs_sold_tier_points"),
      gestionados: numero(p, "hs_managed_tier_points"),
      total: numero(p, "hs_total_tier_points"),
      mercado: texto(p, "hs_market_name"),
      multiplicador: numero(p, "hs_market_multiplier"),
      actualizadoEn: instante(p, "hs_tiering_properties_updated_at"),
      comision: numero(p, "hs_projected_commission"),
      comisionCalculadaEn: instante(p, "hs_projected_commission_calculated_at"),
    },
  };
}

/** Umbrales de Smarteam (HubSpot no publica los suyos). Uno solo para pantallas y agente. */
export const UMBRALES = {
  /** Bajo este puntaje, el uso es bajo. Es el mismo que ya usaba el vigía. */
  usoBajo: 35,
  /** Una tendencia de 4 semanas por debajo de esto es «uso cayendo» (−5 %). */
  tendenciaCaida: -0.05,
  /** Al 85 % o más de un cupo: conversación para ampliar. */
  alLimite: 0.85,
  /** Créditos: al 80 % ya avisa HubSpot. */
  creditosAlLimite: 0.8,
  /** 30 % o menos de contactos usados, o 30 % o más de licencias libres: paga por lo que no usa. */
  pocoUso: 0.3,
} as const;

/** −0,12 → «−12 %». */
export function porcentajeDeTendencia(t: number): string {
  const n = Math.round(t * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} %`;
}

export function usoCayendo(l: Pick<LecturaDePartner, "tendencia">): boolean {
  return l.tendencia !== null && l.tendencia < UMBRALES.tendenciaCaida;
}

export function usoBajo(l: Pick<LecturaDePartner, "uso">): boolean {
  return l.uso !== null && l.uso < UMBRALES.usoBajo;
}

/** Las licencias de todos los tipos sumadas (principales + por hub). */
export function licenciasSumadas(l: Pick<LecturaDePartner, "hubs" | "licenciasPrincipales">): LicenciasDeUnTipo | null {
  const tipos = [l.licenciasPrincipales, ...l.hubs.map((h) => h.licencias)].filter((x): x is LicenciasDeUnTipo => !!x);
  if (tipos.length === 0) return null;
  const sumar = (k: keyof LicenciasDeUnTipo) =>
    tipos.some((t) => t[k] !== null) ? tipos.reduce((s, t) => s + (t[k] ?? 0), 0) : null;
  return { asignadas: sumar("asignadas"), libres: sumar("libres"), limite: sumar("limite") };
}

/** Fracción usada de un cupo (0–1). */
export function fraccion(c: Cupo): number {
  return c.limite > 0 ? c.usados / c.limite : 0;
}
