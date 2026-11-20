/**
 * lib/plan-general/foto.ts — la foto del plan general que ve el cliente. Client-safe y puro.
 *
 * Tiene la forma del cronograma compartible (ExternalTimelineData): la página del cliente la pinta con el MISMO render
 * (TimelineLanding → TimelineSection). Se congela al «Publicar» (AccesoAlPlanGeneral.publicado) y la página externa
 * pinta SOLO eso, nunca lo vivo. `FORMATO` sube cuando cambia la forma; una foto de otro formato no se sirve (la del
 * formato 1, de antes del 19 nov, era un gantt propio y solo existió en bases locales).
 */
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";
import { normalizePublishedTimeline } from "@/lib/external/snapshot-normalize";

export const FORMATO_DE_LA_FOTO = 2;

export type FotoDelPlan = ExternalTimelineData & { formato: number };

export function fotoDelPlan(data: ExternalTimelineData): FotoDelPlan {
  return { formato: FORMATO_DE_LA_FOTO, ...data };
}

/** La foto guardada, o null si no hay o es de otro formato. Saneada como el cronograma publicado. */
export function leerFoto(raw: unknown): ExternalTimelineData | null {
  if (!raw || typeof raw !== "object" || (raw as { formato?: unknown }).formato !== FORMATO_DE_LA_FOTO) return null;
  return normalizePublishedTimeline(raw) as unknown as ExternalTimelineData;
}

/** ¿Lo de hoy es distinto de lo publicado? Sin foto, hay algo que publicar si hoy hay fases. */
export function hayCambiosSinPublicar(hoy: ExternalTimelineData, publicada: ExternalTimelineData | null): boolean {
  if (!publicada) return hoy.phases.length > 0;
  // Con las claves ordenadas: la foto vuelve de un JSONB, y Postgres no conserva el orden de las claves.
  const forma = (d: ExternalTimelineData) => JSON.stringify(ordenado({ a: d.anchorStartDate, f: d.phases }));
  return forma(hoy) !== forma(publicada);
}

function ordenado(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenado);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, ordenado(x)]),
    );
  }
  return v;
}

/** ¿Hay algo que mostrar? Al menos un loop (como el cronograma: sin el detalle confirmado, el cliente ve las fases). */
export function tieneLoops(d: ExternalTimelineData): boolean {
  return d.phases.length > 0;
}
