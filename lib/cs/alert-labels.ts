/**
 * lib/cs/alert-labels.ts
 *
 * Los diccionarios de presentación de `CsAlert` — client-safe, sin Prisma en runtime.
 *
 * POR QUÉ VIVE ACÁ Y NO EN EL FEED: el mapa de categorías ya se desincronizó del enum una vez.
 * `STAGE_STALLED` se agregó al enum y nadie tocó el diccionario, así que la CSL veía el
 * identificador crudo en pantalla. Un mapa suelto dentro de un componente no tiene cómo avisar que
 * quedó corto; acá sí, porque el test de al lado recorre el enum de Prisma y exige un label por
 * valor. **El fix del bug es ese test — la línea que falta es la consecuencia.**
 *
 * Cuando se agregue una categoría nueva al enum, el test falla antes del build y te dice cuál.
 */

/** Severidad → etiqueta y clases del chip. */
export const SEV_META: Record<string, { label: string; chip: string; dot: string }> = {
  HIGH: { label: "Alta", chip: "text-red-600 bg-red-500/10 border-red-500/30", dot: "bg-red-500" },
  MEDIUM: { label: "Media", chip: "text-amber-600 bg-amber-500/10 border-amber-500/30", dot: "bg-amber-500" },
  LOW: { label: "Baja", chip: "text-sky-600 bg-sky-500/10 border-sky-500/30", dot: "bg-sky-500" },
};

/** Orden de triage: primero lo grave. */
export const SEV_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Categoría → cómo se lee en pantalla.
 *
 * Tiene que cubrir TODOS los valores de `CsAlertCategory`. Si agregás uno al enum y no lo agregás
 * acá, `alert-labels.test.ts` falla nombrando el que falta.
 */
export const CATEGORY_LABEL: Record<string, string> = {
  TIMELINE_OVERDUE: "Cronograma atrasado",
  TASK_MODIFICATION: "Cambio de tareas",
  SESSION_MISSED: "Sesión caída",
  PIPELINE_MISMATCH: "Pipeline desalineado",
  ENGAGEMENT_COLD: "Cliente frío",
  SUPPORT_TICKETS: "Tickets de soporte",
  RENEWAL_RISK: "Renovación",
  CHURN_RISK: "Riesgo de churn",
  EXPANSION_OPPORTUNITY: "Expansión",
  PROACTIVE_ACTION: "Acción proactiva",
  ADOPTION_RISK: "Adopción en riesgo",
  LICENSE_UNUSED: "Licencias sin usar",
  PROJECT_BLOCKED: "Bloqueado en HubSpot",
  STAGE_STALLED: "Etapa estancada",
  OTHER: "Otro",
};

/** "hoy" / "ayer" / "hace N días". */
export function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}
