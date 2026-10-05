/**
 * lib/marketing/marketing-ui.ts — las constantes y reglas puras de Marketing que también usa el navegador.
 *
 * Viven acá, sin zod, para que una pantalla no arrastre zod (~266 KB) al bundle solo para leer una etiqueta: la
 * regla C-24 de lib/auth/client-safe.test.ts (molde: lib/roles/roles-ui.ts). lib/marketing/schema.ts las
 * re-exporta, así que el servidor las sigue importando de donde siempre.
 */

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
