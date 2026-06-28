/**
 * lib/business-cases/schema.ts
 *
 * Tipos + validación (Zod) del módulo de Ventas. Define el `content` estructurado
 * por blockType (el bloque guarda Json, no texto libre), el orden canónico de los
 * bloques, los bloques fijos (PARTNER/CTA) y los bodies de la API.
 */
import { z } from "zod";
import type { BusinessCaseBlockType } from "@prisma/client";

// ── Content por blockType (Json estructurado) ────────────────────────────────

export const HeroContent = z.object({
  clientLogoUrl: z.string().nullish(),
  smarteamLogoUrl: z.string().nullish(),
  headline: z.string(),
  subhead: z.string().nullish(),
  tags: z.array(z.string()).default([]),
});
export const PainPointsContent = z.object({
  items: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
});
export const BeforeAfterContent = z.object({
  rows: z
    .array(z.object({ aspect: z.string(), before: z.string(), after: z.string() }))
    .default([]),
});
export const SolutionContent = z.object({
  hubs: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  useCases: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
});
export const RoiMetricsContent = z.object({
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        unit: z.string().nullish(),
        note: z.string().nullish(),
      }),
    )
    .default([]),
});
export const TimelineContent = z.object({
  phases: z
    .array(
      z.object({
        name: z.string(),
        weeks: z.number().nullish(),
        deliverables: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export const InvestmentContent = z.object({
  licenses: z
    .array(
      z.object({
        name: z.string(),
        tier: z.string().nullish(),
        seats: z.number().nullish(),
        price: z.string().nullish(),
      }),
    )
    .default([]),
  services: z.array(z.object({ name: z.string(), price: z.string().nullish() })).default([]),
  total: z.string().nullish(),
});
export const PartnerContent = z.object({
  headline: z.string(),
  credentials: z.array(z.string()).default([]),
  badges: z.array(z.string()).default([]),
});
export const CtaContent = z.object({
  headline: z.string(),
  buttonLabel: z.string(),
  contact: z.string().nullish(),
});

/** blockType → schema Zod de su `content`. */
export const BLOCK_CONTENT_SCHEMAS = {
  HERO: HeroContent,
  PAIN_POINTS: PainPointsContent,
  BEFORE_AFTER: BeforeAfterContent,
  SOLUTION: SolutionContent,
  ROI_METRICS: RoiMetricsContent,
  TIMELINE: TimelineContent,
  INVESTMENT: InvestmentContent,
  PARTNER: PartnerContent,
  CTA: CtaContent,
} satisfies Record<BusinessCaseBlockType, z.ZodTypeAny>;

/** Orden canónico de los bloques (no se reordena). */
export const BLOCK_ORDER: BusinessCaseBlockType[] = [
  "HERO",
  "PAIN_POINTS",
  "BEFORE_AFTER",
  "SOLUTION",
  "ROI_METRICS",
  "TIMELINE",
  "INVESTMENT",
  "PARTNER",
  "CTA",
];

/** Bloques con contenido FIJO de marca (siempre incluidos). */
export const FIXED_BLOCKS: Partial<Record<BusinessCaseBlockType, Record<string, unknown>>> = {
  PARTNER: {
    headline: "Smarteam — Elite HubSpot Partner en LATAM",
    credentials: [
      "Elite HubSpot Solutions Partner",
      "Equipo certificado en los Hubs de Marketing, Sales, Service y Operations",
      "Implementaciones, migraciones y desarrollo a la medida en toda la región",
    ],
    badges: [],
  },
  CTA: {
    headline: "¿Avanzamos juntos?",
    buttonLabel: "Agendar una conversación",
    contact: null,
  },
};

// ── Bodies de la API (Zod en fronteras) ──────────────────────────────────────

export const CreateBusinessCaseBody = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  hubspotCompanyId: z.string().trim().nullish(),
});
export const UpdateBusinessCaseBody = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  hubspotCompanyId: z.string().trim().nullish(),
});
export const PastedTranscriptBody = z.object({
  source: z.literal("PASTED"),
  rawText: z.string().trim().min(1, "El transcript no puede estar vacío"),
  fileName: z.string().nullish(),
});
export const BlockEditBody = z.object({
  content: z.record(z.string(), z.unknown()).optional(),
  isVisible: z.boolean().optional(),
  status: z.enum(["DRAFT", "CONFIRMED"]).optional(),
  undo: z.boolean().optional(),
});
export const AiEditBody = z.object({
  instruction: z.string().trim().min(1, "Indicá qué cambiar"),
});
// Recrear un bloque eliminado (deshacer un delete). blockType validado contra los tipos canónicos
// (BLOCK_ORDER es el runtime de BusinessCaseBlockType) → la salida tipa como el enum, sin `as` en Prisma.
export const BlockRecreateBody = z.object({
  blockType: z.enum(BLOCK_ORDER as [BusinessCaseBlockType, ...BusinessCaseBlockType[]]),
  content: z.record(z.string(), z.unknown()),
  isVisible: z.boolean().optional(),
  status: z.enum(["DRAFT", "CONFIRMED"]).optional(),
  needsValidation: z.boolean().optional(),
});

/** Un bloque tal como lo emite el agente generador. */
export type GeneratedBlock = {
  blockType: BusinessCaseBlockType;
  content: Record<string, unknown>;
  needsValidation: boolean;
};
