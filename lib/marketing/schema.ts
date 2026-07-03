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

export const runCreateSchema = z.object({
  kind: z.enum(RUN_KINDS),
});

export const suggestionActionSchema = z.object({
  action: z.enum(["approve", "discard"]),
});
export const campaignPatchSchema = z.object({
  action: z.enum(["approve", "discard"]),
});

// ── Output del agente de generación ────────────────────────────────────────────

/** Un ítem inválido se descarta (safeParse por ítem), no tumba la corrida. */
export const generatedContentIdeaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  copy: z.string().trim().min(1).max(4000),
  imageConcept: z.string().trim().min(1).max(2000),
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
