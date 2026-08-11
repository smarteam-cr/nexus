/**
 * lib/tags/catalog.ts
 *
 * Catálogo ÚNICO de tags de clasificación de un proyecto / business case. Es la fuente
 * de verdad del vocabulario: agregar un producto futuro = una línea acá.
 *
 * Tres grupos viven en el array `tags String[]` (Project + BusinessCase):
 *   - `product`:   hubs de HubSpot + productos propios (Insider One).
 *   - `scope`:     características del alcance (integración/desarrollo, migración de CRM).
 *   - `modalidad`: `recurrente` = el servicio es de continuidad (soporte, retainer, bolsa
 *                  de horas, sin fin definido). Su PRESENCIA en `tags` define el ciclo de
 *                  vida corto (lib/lifecycle). Lo infiere el HANDOFF (isRecurrent); el CSE
 *                  lo corrige quitándolo/agregándolo en la tira. Ausencia = implementación.
 * La MODALIDAD DE IMPLEMENTACIÓN (implementación vs re-implementación) NO va al array — es el
 * enum `implementationType`; el catálogo solo expone sus labels para que la tira de tags la
 * pinte como un chip más (selección única). No confundir con el grupo `modalidad` de tags.
 *
 * Compat: el storage histórico guardó LABELS ("Marketing Hub"). `normalizeTag` acepta
 * slug o label y normaliza a slug, así no hace falta backfill — se normaliza al leer/escribir.
 * Desde el 2026-08-11 esa misma puerta absorbe los RENOMBRES de HubSpot (`TAG_ALIASES`).
 */
import type { ImplementationType } from "@prisma/client";

export type TagGroup = "product" | "scope" | "modalidad";

export interface TagDef {
  slug: string;
  label: string;
  group: TagGroup;
}

/** Slug del tag de recurrencia — su presencia en `Project.tags` = ciclo de vida corto. */
export const RECURRENTE_TAG = "recurrente";

export const TAG_CATALOG: readonly TagDef[] = [
  // ── Productos ──────────────────────────────────────────────────────────────
  // Los HUBS siguen el nombre VIGENTE de HubSpot; los anteriores viven en `TAG_ALIASES`.
  { slug: "marketing_hub", label: "Marketing Hub", group: "product" },
  { slug: "sales_hub", label: "Sales Hub", group: "product" },
  { slug: "service_hub", label: "Service Hub", group: "product" },
  { slug: "content_hub", label: "Content Hub", group: "product" }, // ex "CMS Hub"
  { slug: "data_hub", label: "Data Hub", group: "product" }, // ex "Operations Hub"
  { slug: "revenue_hub", label: "Revenue Hub", group: "product" }, // ex "Commerce Hub" (jun-2026)
  { slug: "insider_one", label: "Insider One", group: "product" }, // app propia de Smarteam
  // ── Alcance / características ────────────────────────────────────────────────
  { slug: "custom_dev", label: "Integración / Desarrollo a medida", group: "scope" },
  { slug: "crm_migration", label: "Migración desde otro CRM", group: "scope" },
  // Se vendió un sitio web (nuevo o rediseño), landings o web pública. Es `scope` y no
  // `product` porque describe QUÉ SE VENDIÓ, no un producto de HubSpot: `content_hub`
  // (ex CMS Hub) sigue siendo el producto y un proyecto web normalmente lleva los dos.
  { slug: "sitio_web", label: "Sitio web", group: "scope" },
  // ── Modalidad del servicio ──────────────────────────────────────────────────
  { slug: RECURRENTE_TAG, label: "Servicio recurrente", group: "modalidad" },
] as const;

/**
 * Nombres MUERTOS → el slug vigente. HubSpot renombra sus productos y la base guarda lo que
 * se escribió el día que se escribió: `operations_hub` (10 filas) y `commerce_hub` (1) siguen
 * ahí, y el sync de HubSpot todavía alimenta labels históricos.
 *
 * Se resuelven al LEER, que es la misma doctrina con la que el catálogo ya venía absorbiendo
 * los labels antiguos: no hace falta backfill y la data converge sola al slug nuevo en el
 * primer guardado (`sanitizeTags` corre en toda escritura y además deduplica, así que una fila
 * con `["operations_hub","data_hub"]` colapsa a `["data_hub"]`).
 *
 * ⚠ NO se borran después de un backfill: el sync de HubSpot los sigue produciendo y los
 * snapshots publicados llevan lo que llevaban el día que se publicaron.
 */
const TAG_ALIASES: Record<string, string> = {
  // Renombres de producto de HubSpot
  operations_hub: "data_hub",
  "operations hub": "data_hub",
  commerce_hub: "revenue_hub",
  "commerce hub": "revenue_hub",
  // El label viejo de Content Hub, que hasta ahora devolvía null
  "cms hub": "content_hub",
};

/**
 * Los hubs de HUBSPOT, sin los productos propios.
 *
 * ⚠ NO es lo mismo que `productTags()`: ahí vive `insider_one`, que es una app de Smarteam.
 * Todo lo que hable de "los Hubs del cliente" —la sección de la propuesta, el conocimiento por
 * hub— filtra por acá; filtrar por `group === "product"` mete Insider entre los Hubs.
 */
export const HUBSPOT_HUB_SLUGS = [
  "marketing_hub",
  "sales_hub",
  "service_hub",
  "content_hub",
  "data_hub",
  "revenue_hub",
] as const;

export type HubspotHubSlug = (typeof HUBSPOT_HUB_SLUGS)[number];

const BY_SLUG = new Map(TAG_CATALOG.map((t) => [t.slug, t]));
const BY_LABEL = new Map(TAG_CATALOG.map((t) => [t.label.toLowerCase(), t]));

export function tagDef(slug: string): TagDef | undefined {
  return BY_SLUG.get(slug);
}
export function isKnownTag(slug: string): boolean {
  return BY_SLUG.has(slug);
}
export function labelForTag(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}
export function productTags(): TagDef[] {
  return TAG_CATALOG.filter((t) => t.group === "product");
}
export function scopeTags(): TagDef[] {
  return TAG_CATALOG.filter((t) => t.group === "scope");
}
export function modalidadTags(): TagDef[] {
  return TAG_CATALOG.filter((t) => t.group === "modalidad");
}
/** ¿La lista marca el servicio como recurrente? → ciclo de vida corto (lib/lifecycle). */
export function isRecurrente(slugs: string[]): boolean {
  return sanitizeTags(slugs).includes(RECURRENTE_TAG);
}

/** Acepta slug, label conocido o nombre MUERTO (`TAG_ALIASES`) → slug canónico; null si no. */
export function normalizeTag(s: string): string | null {
  if (BY_SLUG.has(s)) return s;
  const lower = s.toLowerCase();
  const byLabel = BY_LABEL.get(lower);
  if (byLabel) return byLabel.slug;
  // Los renombres se resuelven al final: un slug o label VIVO siempre gana.
  return TAG_ALIASES[s] ?? TAG_ALIASES[lower] ?? null;
}

/** Normaliza una lista a slugs canónicos, descartando lo desconocido y los duplicados. */
export function sanitizeTags(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  const out: string[] = [];
  for (const s of slugs) {
    if (typeof s !== "string") continue;
    const slug = normalizeTag(s);
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/** Labels legibles (para mostrar / inyectar en prompts de agentes). */
export function tagLabels(slugs: string[]): string[] {
  return sanitizeTags(slugs).map(labelForTag);
}

/** ¿La lista tiene un tag de alcance técnico? → enruta a la fase "Desarrollo / Integración" (#7).
 *
 *  ⚠ `sitio_web` NO entra acá A PROPÓSITO: esta función rutea al canvas "Desarrollo" y a la fase
 *  técnica del cronograma, y un sitio web NO es necesariamente desarrollo a medida (un sitio en
 *  el CMS sin integraciones no lleva fase técnica). Si un proyecto web además tiene desarrollo,
 *  el handoff le pone `custom_dev` y ahí sí entra. No acoplarlos por arrastre. */
export function hasTechnicalScope(slugs: string[]): boolean {
  const s = sanitizeTags(slugs);
  return s.includes("custom_dev") || s.includes("insider_one");
}

/** Modalidad (impl/re-impl) — labels para la tira. No va al array de tags. */
export const MODALITY_LABEL: Record<ImplementationType, string> = {
  IMPLEMENTATION: "Implementación",
  REIMPLEMENTATION: "Re-implementación",
};

/** serviceType → producto por defecto (slug). Reemplaza el viejo SERVICE_TO_HUB con labels. */
export const SERVICE_TO_PRODUCT: Record<string, string> = {
  loop_marketing: "marketing_hub",
  loop_sales: "sales_hub",
  loop_service: "service_hub",
};
