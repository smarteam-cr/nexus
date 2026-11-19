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
  /**
   * El título o la nota cruzan la frontera (citan la fuente, traen un monto, una fecha, un plazo, un
   * correo o copian una frase del material interno). Lo pone la RUTA con `marcarFugas`
   * (lib/contexto/frontera-del-cronograma.ts) sobre las huellas del material que leyó el agente —
   * nunca este parser, que no ve el material. Solo avisa en la curación; no bloquea nada.
   */
  fuga?: { campo: "titulo" | "nota"; motivo: string } | null;
  /**
   * Por qué está «por validar» cuando NO es la típica que la IA no sacó de ninguna fuente. Hoy solo
   * lo ponen las tareas fijas de la Semana 0 (`tareasFijasDeSemanaCero`); este parser nunca: sin
   * él, el tooltip de la curación dice el de la típica (`motivoDePorValidar`).
   */
  motivoPorValidar?: string | null;
  /**
   * Las horas estimadas de la tarea (2026-11-18): las pide el bloque de lo vendido (lib/timeline/lo-vendido.ts) desde las
   * actividades de los casos vendidos. Sin dato (o fuera de rango), no va: la tarea queda sin horas.
   */
  horas?: number;
}

/** Las horas que devolvió el modelo para una tarea, o undefined: un número de 0,25 a 200, redondeado a 0,25. */
export function leerHorasDeTarea(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0.25 || n > 200) return undefined;
  return Math.round(n * 4) / 4;
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
    const horas = leerHorasDeTarea(t.horas);
    out.push({
      title: sanitizeTaskTitle(titleRaw),
      weekIndex,
      order,
      notes: typeof t.notes === "string" && t.notes.trim() ? t.notes.trim() : null,
      needsValidation: t.porValidar === true,
      party,
      type,
      ...(horas !== undefined ? { horas } : {}),
    });
  }
  return out;
}
