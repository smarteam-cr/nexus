/**
 * lib/timeline/historial-del-cronograma.ts — la FORMA del cronograma que compara y muestra el historial de versiones
 * (21 nov; DECISIONS «Historial de versiones»). Puro y client-safe.
 *
 * El cronograma no guarda copias nuevas: su historial ya existía. Cada cambio con motivo (aplicar lo de la IA o del
 * chat, crear la primera fase, mover el arranque, el re-anclaje) deja su foto en `TimelineChange`, y cada publicación
 * con otra estructura deja la suya en `TimelineBaseline`. Las tres (esas dos y el cronograma vivo) se reducen a la
 * misma forma: la fecha de arranque y cada fase con sus semanas, sus sesiones y sus tareas por semana. El avance y las
 * fechas reales no entran: no son una versión, son lo que pasó.
 */

export interface TareaDeLaVersion {
  titulo: string;
  semana: number;
}

export interface FaseDeLaVersion {
  nombre: string;
  semanas: number;
  /** La semana en que arranca si va en paralelo; null: sigue a la anterior. */
  inicio: number | null;
  sesiones: number | null;
  tareas: TareaDeLaVersion[];
}

export interface CronogramaDeLaVersion {
  /** AAAA-MM-DD, o null sin fecha de arranque. */
  arranque: string | null;
  fases: FaseDeLaVersion[];
}

function numero(v: unknown, def: number | null): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/**
 * La forma desde una foto de `TimelineChange` o `TimelineBaseline`, o desde las filas vivas (las tres traen
 * `{ anchorStartDate, phases: [{ name, order, durationWeeks, startWeek, sessionCount, tasks: [{ title, weekIndex, order }] }] }`).
 * null: la foto no tiene fases (el cambio de la fecha de arranque del autoguardado solo guarda la fecha).
 */
export function cronogramaDeLaFoto(foto: unknown): CronogramaDeLaVersion | null {
  if (!foto || typeof foto !== "object") return null;
  const f = foto as { anchorStartDate?: unknown; phases?: unknown };
  if (!Array.isArray(f.phases)) return null;
  const arranque = typeof f.anchorStartDate === "string" ? f.anchorStartDate.slice(0, 10) : f.anchorStartDate instanceof Date ? f.anchorStartDate.toISOString().slice(0, 10) : null;
  const fases = (f.phases as unknown[])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p, i) => ({ p, orden: numero(p.order, i) ?? i }))
    .sort((a, b) => a.orden - b.orden)
    .map(({ p }) => ({
      nombre: typeof p.name === "string" ? p.name : "",
      semanas: numero(p.durationWeeks, 1) ?? 1,
      inicio: numero(p.startWeek, null),
      sesiones: numero(p.sessionCount, null),
      tareas: (Array.isArray(p.tasks) ? (p.tasks as unknown[]) : [])
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({ titulo: typeof t.title === "string" ? t.title : "", semana: numero(t.weekIndex, 0) ?? 0, orden: numero(t.order, 0) ?? 0 }))
        .sort((a, b) => a.semana - b.semana || a.orden - b.orden)
        .map(({ titulo, semana }) => ({ titulo, semana })),
    }));
  return { arranque, fases };
}
