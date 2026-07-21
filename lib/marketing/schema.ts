/**
 * lib/marketing/schema.ts
 *
 * Schemas Zod del módulo Marketing + Contenido: inputs de los endpoints CRUD
 * (validación en la frontera, ARCHITECTURE §3) + el schema del output del
 * agente de generación (GenerationOutputSchema — validación POR ÍTEM: un ítem
 * inválido se descarta, no tumba la corrida).
 */
import { z } from "zod";

// ── Enums espejo (client-safe: sin importar @prisma/client acá) ────────────────

export const ICP_SECTIONS = [
  "FIRMOGRAFICA_DESCRIPTOR",
  "FIRMOGRAFICA_INDUSTRIA",
  "BEHAVIORAL_REVENUE",
  "BEHAVIORAL_CANALES",
  "BEHAVIORAL_ORG",
  "BEHAVIORAL_DECISION",
  "SIGNAL_ANTI",
  "SIGNAL_FUERTE",
  "SIGNAL_MEDIA",
  "SIGNAL_DEBIL",
] as const;

export const CAMPAIGN_CHANNELS = ["GOOGLE_SEARCH", "PAID_SOCIAL", "DISPLAY", "OTHER"] as const;
export const RUN_KINDS = ["INGEST", "GENERATE", "CHAIN"] as const;

// Objetivo de piezas por tanda de generación (fuente única para el mini-form, el Zod
// y el agente). Default 9+6 = 15 ≈ el reparto histórico ~60% EMPRESA / ~40% PERSONA.
// Es un OBJETIVO, no un mínimo: el prompt prioriza calidad ("10 fuertes > 15 flojas").
export const MARKETING_GEN_DEFAULTS = { empresa: 9, persona: 6 } as const;
// Topes del form/Zod. PERSONA más bajo: son piezas largas (900–1600 chars) — protege el
// presupuesto de tokens del agente.
export const MARKETING_GEN_LIMITS = { maxEmpresa: 15, maxPersona: 10 } as const;

// Tipo de post (audiencia): empresa = página de Smarteam (escueto); persona =
// marca personal / social selling (largo, storytelling). Espejo del enum Prisma.
export const MARKETING_POST_TYPES = ["EMPRESA", "PERSONA"] as const;
export type MarketingPostTypeValue = (typeof MARKETING_POST_TYPES)[number];

// Etapa del viaje semanal de Smarteam (solo posts de EMPRESA). Espejo del enum.
export const MARKETING_JOURNEY_STAGES = ["CONCIENCIA", "ESTRATEGIA", "INSPIRACION"] as const;
export type MarketingJourneyStageValue = (typeof MARKETING_JOURNEY_STAGES)[number];

// Destino de uso al aceptar una publicación. Espejo del enum Prisma.
export const MARKETING_USAGE_TARGETS = ["PERSONAL", "SMARTEAM"] as const;
export type MarketingUsageTargetValue = (typeof MARKETING_USAGE_TARGETS)[number];

// Metadatos de display (client-safe) reutilizados por la UI de /contenido.
export const POST_TYPE_META: Record<MarketingPostTypeValue, { label: string }> = {
  EMPRESA: { label: "Empresa" },
  PERSONA: { label: "Persona" },
};
export const JOURNEY_STAGE_META: Record<
  MarketingJourneyStageValue,
  { label: string; emoji: string }
> = {
  CONCIENCIA: { label: "Conciencia", emoji: "🔴" },
  ESTRATEGIA: { label: "Estrategia", emoji: "🟡" },
  INSPIRACION: { label: "Inspiración", emoji: "🟢" },
};
export const USAGE_TARGET_META: Record<MarketingUsageTargetValue, { label: string }> = {
  PERSONAL: { label: "Uso personal" },
  SMARTEAM: { label: "Para Smarteam" },
};

/**
 * ¿El rol puede marcar una publicación como usada "para Smarteam" (vs. solo en
 * sus redes personales)? Regla "por equipo": el equipo de MARKETING (sobrevive a
 * rotación). Los demás roles aceptan siempre como PERSONAL. Client-safe (compara
 * strings, sin importar @prisma/client) — patrón lib/auth/sales-roles.ts.
 */
export function canPublishForSmarteam(role: string | null | undefined): boolean {
  return role === "MARKETING";
}

/**
 * Destino EFECTIVO de una aceptación (el server es la fuente de verdad, no el
 * body): SMARTEAM solo si el rol puede publicar para Smarteam Y lo pidió; en
 * cualquier otro caso, PERSONAL. Un no-marketing nunca queda como SMARTEAM.
 */
export function resolveUsageTarget(
  role: string | null | undefined,
  requested: MarketingUsageTargetValue | undefined,
): MarketingUsageTargetValue {
  return canPublishForSmarteam(role) && requested === "SMARTEAM" ? "SMARTEAM" : "PERSONAL";
}

// ── Inputs CRUD ────────────────────────────────────────────────────────────────

export const icpItemCreateSchema = z.object({
  section: z.enum(ICP_SECTIONS),
  label: z.string().trim().min(1).max(500),
});
export const icpItemPatchSchema = z.object({
  label: z.string().trim().min(1).max(500).optional(),
  order: z.number().int().min(0).optional(),
});

export const personaCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(160).nullish(),
  description: z.string().trim().min(1).max(4000),
  pains: z.string().trim().max(4000).nullish(),
  goals: z.string().trim().max(4000).nullish(),
});
export const personaPatchSchema = personaCreateSchema.partial().extend({
  active: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const pillarCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
});
export const pillarPatchSchema = pillarCreateSchema.partial().extend({
  active: z.boolean().optional(),
  isCampaign: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const sourceCreateSchema = z.object({
  profileUrl: z
    .string()
    .trim()
    .url()
    .max(400)
    .refine((u) => /linkedin\.com\//i.test(u), {
      message: "La fuente debe ser una URL de perfil de LinkedIn.",
    }),
  label: z.string().trim().max(160).nullish(),
});
export const sourcePatchSchema = z.object({
  profileUrl: sourceCreateSchema.shape.profileUrl.optional(),
  label: z.string().trim().max(160).nullish().optional(),
  active: z.boolean().optional(),
});

export const voicePutSchema = z.object({
  brandVoice: z.string().trim().min(1).max(8000),
});

// Crear una corrida. `empresaCount`/`personaCount` son OPCIONALES: los manda el mini-form de
// la pestaña Generación (CHAIN/GENERATE) para generar a medida; INGEST y el cron los omiten y
// caen a los defaults guardados en MarketingSettings. Si vienen, al menos uno ≥ 1 (no 0/0).
export const runCreateSchema = z
  .object({
    kind: z.enum(RUN_KINDS),
    empresaCount: z.number().int().min(0).max(MARKETING_GEN_LIMITS.maxEmpresa).optional(),
    personaCount: z.number().int().min(0).max(MARKETING_GEN_LIMITS.maxPersona).optional(),
  })
  .refine(
    (v) =>
      v.empresaCount === undefined && v.personaCount === undefined
        ? true
        : (v.empresaCount ?? 0) + (v.personaCount ?? 0) >= 1,
    { message: "Configurá al menos una pieza (Empresa o Persona)." },
  );

export const suggestionActionSchema = z.object({
  action: z.enum(["approve", "discard"]),
});
export const campaignPatchSchema = z.object({
  action: z.enum(["approve", "discard"]),
});

// PATCH de una idea: transiciones de estado (selected/used/discarded) y/o edición
// de campos. Todos opcionales pero al menos uno presente. Límites = los del agente.
export const ideaPatchSchema = z
  .object({
    used: z.boolean().optional(),
    selected: z.boolean().optional(),
    discarded: z.boolean().optional(),
    // Destino propuesto al aceptar (selected:true). El server decide el valor
    // EFECTIVO según el rol — un no-marketing nunca queda como SMARTEAM.
    acceptedFor: z.enum(MARKETING_USAGE_TARGETS).optional(),
    title: z.string().trim().min(1).max(300).optional(),
    copy: z.string().trim().min(1).max(4000).optional(),
    imageConcept: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nada que actualizar.",
  });

// Ajuste con IA del copy de una idea: instrucción libre (o un preset del front).
export const ideaAdjustSchema = z.object({
  instruction: z.string().trim().min(1).max(500),
});

// Enviar una idea a HubSpot como borrador social: canal(es) destino (channelKey).
export const hubspotDraftSchema = z.object({
  channelKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
});

// ── Estado derivado de una idea (client-safe) ──────────────────────────────────
// Prioridad: descartada (gana, reversible) → aprobada (usedAt) → seleccionada
// (selectedAt) → sugerida. Reabrir una descartada limpia discardedAt y la idea
// vuelve al estado previo que dictan selectedAt/usedAt.
export const CONTENT_IDEA_STATES = ["sugerida", "seleccionada", "aprobada", "descartada"] as const;
export type ContentIdeaState = (typeof CONTENT_IDEA_STATES)[number];

export function ideaState(idea: {
  selectedAt?: Date | string | null;
  usedAt?: Date | string | null;
  discardedAt?: Date | string | null;
}): ContentIdeaState {
  if (idea.discardedAt) return "descartada";
  if (idea.usedAt) return "aprobada";
  if (idea.selectedAt) return "seleccionada";
  return "sugerida";
}

// ── Output del agente de generación ────────────────────────────────────────────

/** Un ítem inválido se descarta (safeParse por ítem), no tumba la corrida. */
export const generatedContentIdeaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  copy: z.string().trim().min(1).max(4000),
  imageConcept: z.string().trim().min(1).max(2000),
  // Tipo de post (default seguro EMPRESA si el agente no lo etiqueta).
  postType: z.enum(MARKETING_POST_TYPES).catch("EMPRESA"),
  // Etapa del viaje semanal — solo en posts de EMPRESA; persona = null.
  journeyStage: z.enum(MARKETING_JOURNEY_STAGES).nullish(),
  pillarName: z.string().trim().max(160).nullish(),
  newPillarName: z.string().trim().max(160).nullish(),
  inspirationPostIds: z.array(z.string().trim()).max(20).default([]),
});

export const generatedPillarSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  rationale: z.string().trim().max(3000).nullish(),
});

export const generatedCampaignIdeaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  channel: z.enum(CAMPAIGN_CHANNELS).catch("OTHER"),
  description: z.string().trim().min(1).max(4000),
});

export type GeneratedContentIdea = z.infer<typeof generatedContentIdeaSchema>;
export type GeneratedPillarSuggestion = z.infer<typeof generatedPillarSuggestionSchema>;
export type GeneratedCampaignIdea = z.infer<typeof generatedCampaignIdeaSchema>;
