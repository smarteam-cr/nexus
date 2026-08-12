import { isDevIntegrationPhaseName } from "./phase-names";

/**
 * lib/timeline/compute-detail-tasks.ts
 *
 * Extraído de app/api/clients/[id]/analyze/route.ts (Tanda N) — era una función interna sin
 * test, en un archivo de 3000+ líneas. Puro (sin DB): computa las tareas de detalle de UNA
 * fase desde el JSON crudo del agente de detalle, con el mismo criterio para persistencia y
 * para preview (regen por fase y regen de todas las fases).
 */

/**
 * La marca "por validar" vive SOLO en la columna needsValidation: si el modelo
 * desobedece y mete el marcador en el título, se limpia acá — el título cruza
 * al cliente tal cual cuando el CSE confirma el detalle.
 */
export function sanitizeTaskTitle(raw: string): string {
  const cleaned = raw
    .replace(/^\s*(?:⚠️?\s*)*(?:\[?\s*por\s+validar\s*\]?\s*[:—–-]?\s*)/i, "")
    .trim();
  return cleaned || raw.trim();
}

export interface ComputedDetailTask {
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  needsValidation: boolean;
  party: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV";
  type: "SESSION" | "TASK";
}

/**
 * Computa las tareas de UNA fase desde el JSON crudo del agente de detalle: clamp de weekIndex,
 * order incremental por semana, party validado (con gate DEV para la fase técnica) o fallback por
 * activityType, type validado, título saneado. Puro (sin DB) → reusado por la persistencia y por el
 * PREVIEW (regen por fase y regen de todas las fases). `skipTitles` deduplica por título
 * normalizado (modo "keep"). El party nunca es null (último fallback SMARTEAM).
 */
export function computeDetailTasksForPhase(
  phaseName: string,
  durationWeeks: number,
  effectiveActivity: string | null,
  tasksRaw: unknown[],
  skipTitles?: Set<string> | null,
): ComputedDetailTask[] {
  const isTechPhase = isDevIntegrationPhaseName(phaseName);
  const perWeekCount = new Map<number, number>();
  const out: ComputedDetailTask[] = [];
  for (const tRaw of tasksRaw) {
    if (!tRaw || typeof tRaw !== "object") continue;
    const t = tRaw as Record<string, unknown>;
    const titleRaw = typeof t.title === "string" ? t.title.trim() : "";
    if (!titleRaw) continue;
    if (skipTitles && skipTitles.has(titleRaw.toLowerCase())) continue;
    const wRaw = typeof t.weekIndex === "number" && Number.isInteger(t.weekIndex) ? t.weekIndex : 0;
    const weekIndex = Math.min(Math.max(wRaw, 0), Math.max(durationWeeks - 1, 0));
    const order = perWeekCount.get(weekIndex) ?? 0;
    perWeekCount.set(weekIndex, order + 1);
    const partyRaw = typeof t.party === "string" ? t.party.toUpperCase() : "";
    const party: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" =
      partyRaw === "DEV" && isTechPhase
        ? "DEV"
        : partyRaw === "CLIENTE" || partyRaw === "SMARTEAM" || partyRaw === "AMBOS"
          ? partyRaw
          : effectiveActivity === "CONFIGURACION"
            ? "SMARTEAM"
            : effectiveActivity
              ? "AMBOS"
              : "SMARTEAM";
    const typeRaw = typeof t.type === "string" ? t.type.toUpperCase() : "";
    const type: "SESSION" | "TASK" = typeRaw === "SESSION" ? "SESSION" : "TASK";
    out.push({
      title: sanitizeTaskTitle(titleRaw),
      weekIndex,
      order,
      notes: typeof t.notes === "string" && t.notes.trim() ? t.notes.trim() : null,
      needsValidation: t.porValidar === true,
      party,
      type,
    });
  }
  return out;
}
