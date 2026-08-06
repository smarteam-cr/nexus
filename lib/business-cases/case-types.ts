/**
 * lib/business-cases/case-types.ts
 *
 * Catálogo de TIPOS de business case (server+client safe: sin React ni Prisma).
 * El tipo se elige al crear el BC y determina el template de landing y los tags
 * iniciales (slugs del catálogo existente en lib/tags/catalog.ts — NO taxonomía nueva).
 *
 * `BusinessCase.caseType` guarda el slug como String? nullable (NO enum Prisma:
 * agregar un tipo futuro = 1 línea acá, sin migración; un valor desconocido en DB
 * nunca rompe porque resolveBcType() degrada al default). `null` = implementación
 * de HubSpot (todos los BCs legacy y el default del stepper).
 */

/**
 * Color del tag del tipo en los listados. Son nombres de variante de `components/ui/Badge`
 * —no clases— para no meter Tailwind ni React en este archivo, que es server+client safe.
 *
 * `destructive` queda FUERA a propósito: el rojo significa peligro en toda la app y un tipo de
 * propuesta no es un problema. Los tonos son CATEGÓRICOS (distinguir uno de otro), no de estado:
 * que "Integración" sea verde no dice que esté bien.
 */
export type BcTypeTone = "warning" | "info" | "success" | "purple" | "primary";

export interface BcTypeDef {
  id: string;
  label: string;
  shortLabel: string;   // badge en listados/header
  /** Obligatorio: un tipo sin tono nace invisible entre los demás y el compilador lo frena.
   *  Los tonos NO se repiten entre tipos — hay un test que lo congela. */
  tone: BcTypeTone;
  description: string;  // card del stepper
  templateId: string;   // → BC_TEMPLATES (components/landing/configs/templates.defs.ts)
  /**
   * Tags que el TIPO AFIRMA, no los que sugiere. Editables después por el CSE (TagsStrip).
   *
   * ── LA REGLA (2026-08-04) ────────────────────────────────────────────────────
   * Se siembra SOLO lo que elegir este tipo vuelve CIERTO. La plataforma NO se asume:
   * "Sitio web" afirma que se vendió un sitio (`sitio_web`), pero no sobre qué se construye
   * —puede ser Content Hub, WordPress u otra—, así que el producto lo agrega el CSE cuando
   * lo sabe. Un tag de más no es neutro: los tags DIRIGEN al agente de Exploración
   * (`EXPLORACION_TAG_LENSES`) y `custom_dev`/`insider_one` rutean al canvas Desarrollo y a la
   * fase técnica del cronograma — un `content_hub` falso manda a explorar la plataforma
   * equivocada. Mismo criterio que el resto del repo: antes "sin definir" que adivinado.
   */
  defaultTags: string[];
  /** Igual que `defaultTags` pero por subtipo: solo lo que el subtipo AFIRMA. */
  subtypes?: { id: string; label: string; extraTags?: string[] }[];
  /** false = visible pero deshabilitado en el stepper ("próximamente"). */
  enabled: boolean;
}

export const HUBSPOT_TEMPLATE_ID = "hubspot_v1";
export const WEBSITE_TEMPLATE_ID = "website_v1";

export const DEFAULT_BC_TYPE_ID = "hubspot_implementation";

export const BC_TYPE_CATALOG: BcTypeDef[] = [
  {
    id: "hubspot_implementation",
    label: "Implementación de HubSpot",
    shortLabel: "HubSpot",
    tone: "warning", // ámbar — lo más cerca del naranja de HubSpot que hay en el vocabulario
    description: "Caso de negocio para una implementación de HubSpot (hubs, integraciones, onboarding).",
    templateId: HUBSPOT_TEMPLATE_ID,
    defaultTags: [], // idéntico a hoy: el flujo default no siembra tags
    enabled: true,
  },
  {
    id: "insider_implementation",
    label: "Implementación de Insider",
    shortLabel: "Insider",
    tone: "purple",
    description: "Caso de negocio para una implementación de Insider (personalización y engagement).",
    templateId: HUBSPOT_TEMPLATE_ID, // gancho: template propio a futuro
    defaultTags: ["insider_one"],
    enabled: false, // próximamente (sin template propio todavía)
  },
  {
    id: "website",
    label: "Sitio web",
    shortLabel: "Sitio web",
    tone: "info",
    description: "Propuesta de diseño y desarrollo de sitio web (Content Hub).",
    templateId: WEBSITE_TEMPLATE_ID,
    /* SOLO el alcance, nunca la plataforma. `sitio_web` (grupo `scope`) es cierto siempre que
       se elija este tipo; `content_hub` (grupo `product`) NO — el sitio puede ir en WordPress
       o en cualquier otra cosa, y hasta el 2026-08-04 se sembraba igual. El producto lo pone
       el CSE en la tira de tags cuando ya sabe dónde se construye. */
    defaultTags: ["sitio_web"],
    /* El subtipo es la CLASE de sitio (alimenta el prompt del agente), no la plataforma:
       un e-commerce puede ser Commerce Hub, Shopify o WooCommerce, así que tampoco siembra
       producto. Si algún día un subtipo AFIRMA un producto, ahí sí lleva `extraTags`. */
    subtypes: [
      { id: "informativo", label: "Informativo" },
      { id: "ecommerce", label: "E-commerce" },
    ],
    enabled: true,
  },
  {
    id: "integration",
    label: "Integración",
    shortLabel: "Integración",
    tone: "success",
    description: "Caso de negocio centrado en integrar sistemas (ERP, WhatsApp, plataformas existentes).",
    templateId: HUBSPOT_TEMPLATE_ID,
    defaultTags: ["custom_dev"],
    enabled: true,
  },
  {
    id: "custom_dev",
    label: "Desarrollo a la medida",
    shortLabel: "Desarrollo",
    tone: "primary",
    description: "Caso de negocio para un desarrollo a la medida sobre o alrededor del CRM.",
    templateId: HUBSPOT_TEMPLATE_ID,
    defaultTags: ["custom_dev"],
    enabled: true,
  },
];

const BY_ID: Record<string, BcTypeDef> = Object.fromEntries(BC_TYPE_CATALOG.map((t) => [t.id, t]));

/** Resolución TOLERANTE: null/desconocido → tipo default (implementación HubSpot).
 *  Para validar input del usuario usá `bcTypeOrNull` (estricta). */
export function resolveBcType(raw: string | null | undefined): BcTypeDef {
  return (raw && BY_ID[raw]) || BY_ID[DEFAULT_BC_TYPE_ID];
}

/** Resolución ESTRICTA para validar input (create): desconocido → null (→ 400). */
export function bcTypeOrNull(raw: string | null | undefined): BcTypeDef | null {
  return (raw && BY_ID[raw]) || null;
}

/** Tags seed para un tipo (+ extras del sub-tipo si aplica). */
export function seedTagsFor(type: BcTypeDef, subtypeId?: string | null): string[] {
  const sub = subtypeId ? type.subtypes?.find((s) => s.id === subtypeId) : undefined;
  return [...type.defaultTags, ...(sub?.extraTags ?? [])];
}
