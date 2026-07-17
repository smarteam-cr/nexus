/**
 * lib/timeline/publish-diff.ts
 *
 * Sugerencia de "razón del cambio" al «Subir al cliente» — diff DETERMINISTA (no IA) entre la
 * última foto publicada (`publishedSnapshot`) y la que se va a publicar (`readClientTimeline`).
 * Describe EXACTAMENTE lo que el cliente verá distinto: tareas agregadas/quitadas, fases
 * agregadas/quitadas, particularidades que se hicieron visibles/se ocultaron, y si se movió el
 * arranque. Función PURA (sin Prisma), para precargar el textarea del modal (editable).
 */
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";

// ── Claves de identidad para los diffs de conjunto ──────────────────────────────
// Las tareas del snapshot externo NO tienen id → clave por (fase|título|semana).
const taskKeys = (data: ExternalTimelineData): Set<string> => {
  const keys = new Set<string>();
  for (const ph of data.phases ?? []) {
    for (const t of ph.tasks ?? []) keys.add(`${ph.id}|${t.title}|${t.weekIndex}`);
  }
  return keys;
};
// Particularidades VISIBLES por (título|fecha) — el snapshot solo trae las visibles.
const partKeys = (data: ExternalTimelineData): Set<string> => {
  const keys = new Set<string>();
  for (const p of data.particularidades ?? []) keys.add(`${p.title}|${p.occurredAt}`);
  return keys;
};

/** Cardinal de A \ B (elementos de A que no están en B). */
const countMissing = (a: Set<string>, b: Set<string>): number => {
  let n = 0;
  for (const k of a) if (!b.has(k)) n++;
  return n;
};

const tareas = (n: number) => `${n} ${n === 1 ? "tarea" : "tareas"}`;
const fases = (n: number) => `${n} ${n === 1 ? "fase" : "fases"}`;
const parts = (n: number) => `${n} ${n === 1 ? "particularidad" : "particularidades"}`;

/** Une fragmentos con comas y "y" antes del último; capitaliza la primera letra + punto final. */
function joinSentence(fragments: string[]): string {
  if (fragments.length === 0) return "";
  let body: string;
  if (fragments.length === 1) body = fragments[0];
  else body = `${fragments.slice(0, -1).join(", ")} y ${fragments[fragments.length - 1]}`;
  const s = body.charAt(0).toUpperCase() + body.slice(1);
  return s.endsWith(".") ? s : `${s}.`;
}

/**
 * Frase sugerida para el modal de publicación. `prev` = último snapshot publicado (null si es la
 * primera vez, aunque ese caso no abre el modal); `next` = lo que se va a publicar. String vacío si
 * no hay cambios visibles para el cliente (el placeholder del textarea queda).
 */
export function suggestPublishReason(
  prev: ExternalTimelineData | null,
  next: ExternalTimelineData,
): string {
  if (!prev) return "";
  const fragments: string[] = [];

  // Tareas
  const prevTasks = taskKeys(prev);
  const nextTasks = taskKeys(next);
  const tasksAdded = countMissing(nextTasks, prevTasks);
  const tasksRemoved = countMissing(prevTasks, nextTasks);
  if (tasksAdded > 0) fragments.push(`se ${tasksAdded === 1 ? "agregó" : "agregaron"} ${tareas(tasksAdded)}`);
  if (tasksRemoved > 0) fragments.push(`se ${tasksRemoved === 1 ? "quitó" : "quitaron"} ${tareas(tasksRemoved)}`);

  // Fases (por id)
  const prevPhaseIds = new Set((prev.phases ?? []).map((p) => p.id));
  const nextPhaseIds = new Set((next.phases ?? []).map((p) => p.id));
  const phasesAdded = countMissing(nextPhaseIds, prevPhaseIds);
  const phasesRemoved = countMissing(prevPhaseIds, nextPhaseIds);
  if (phasesAdded > 0) fragments.push(`se ${phasesAdded === 1 ? "agregó" : "agregaron"} ${fases(phasesAdded)}`);
  if (phasesRemoved > 0) fragments.push(`se ${phasesRemoved === 1 ? "quitó" : "quitaron"} ${fases(phasesRemoved)}`);

  // Particularidades visibles
  const prevParts = partKeys(prev);
  const nextParts = partKeys(next);
  const partsShown = countMissing(nextParts, prevParts);
  const partsHidden = countMissing(prevParts, nextParts);
  if (partsShown > 0) fragments.push(`se ${partsShown === 1 ? "hizo visible" : "hicieron visibles"} ${parts(partsShown)}`);
  if (partsHidden > 0) fragments.push(`se ${partsHidden === 1 ? "ocultó" : "ocultaron"} ${parts(partsHidden)}`);

  // Fecha de arranque
  if ((prev.anchorStartDate ?? null) !== (next.anchorStartDate ?? null)) {
    fragments.push("se movió la fecha de arranque");
  }

  return joinSentence(fragments);
}
