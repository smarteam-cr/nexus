/**
 * lib/timeline/proposal-deltas.ts
 *
 * Deltas POR ÍTEM de una propuesta de cronograma (`ProjectTimeline.pendingProposal`) contra las
 * fases actuales — funciones PURAS, client-safe (sin Prisma). Es la matemática única del modelo
 * "diff EN el Gantt real": la propuesta (que el handoff re-emite ya reconciliada por id, sin
 * `tasks`) se descompone en sugerencias discretas que el CSE acepta o descarta una por una,
 * en vez de un swap todo-o-nada del Gantt.
 *
 * Tipos de delta:
 *  - ADD_PHASE     → fase propuesta sin id (no matcheó ninguna existente): fila fantasma.
 *  - MODIFY_PHASE  → fase existente cuyo contenido difiere (nombre/duración/inicio/tipo/
 *                    sesiones/notas): badge "Sugerencia" en la fila real.
 *  - SET_ANCHOR    → la propuesta trae fecha de inicio y el cronograma no tenía (derivada del
 *                    kickoff); sin esto el cambio se aplicaba invisible.
 *
 * Las TAREAS nunca producen deltas acá: la propuesta del handoff no las trae (`tasks` ausente =
 * "no tocar", contrato del PUT) — por eso el viejo contador "−70 tareas" mentía.
 * Una fase propuesta con un id que YA no existe (el CSE la borró después de generarse la
 * propuesta) se DESCARTA en silencio: re-crearla sería deshacer una decisión humana.
 */

export interface CurrentPhaseLike {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
}

export interface ProposalPhaseLike {
  id?: string | null;
  name: string;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
  /** La propuesta del handoff nunca las trae; se ignoran siempre (phase-level only). */
  tasks?: unknown;
}

export interface ProposalLike {
  anchorStartDate: string | null;
  phases: ProposalPhaseLike[];
}

export type PhaseField = "name" | "durationWeeks" | "startWeek" | "sessionCount" | "notes" | "activityType";

export interface PhaseFieldChange {
  field: PhaseField;
  from: string | number | null;
  to: string | number | null;
}

export type ProposalDelta =
  | { key: string; kind: "ADD_PHASE"; index: number; phase: ProposalPhaseLike }
  | { key: string; kind: "MODIFY_PHASE"; phaseId: string; name: string; changes: PhaseFieldChange[] }
  | { key: "anchor"; kind: "SET_ANCHOR"; from: string | null; to: string };

const FIELDS: PhaseField[] = ["name", "durationWeeks", "startWeek", "sessionCount", "notes", "activityType"];

const val = (p: CurrentPhaseLike | ProposalPhaseLike, f: PhaseField): string | number | null => {
  const v = p[f];
  return v === undefined ? null : v;
};

/** Fecha comparable (solo día): la propuesta guarda ISO completo; el canvas usa YYYY-MM-DD. */
const day = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

/**
 * Descompone la propuesta en deltas por ítem. `currentAnchor` = anchor guardado (ISO o
 * YYYY-MM-DD o null). Propuesta idéntica → [] (el caller puede descartarla como no-op).
 */
export function computeProposalDeltas(
  current: CurrentPhaseLike[],
  proposal: ProposalLike,
  currentAnchor: string | null,
): ProposalDelta[] {
  const out: ProposalDelta[] = [];
  const byId = new Map(current.map((p) => [p.id, p]));

  proposal.phases.forEach((p, i) => {
    if (!p.id) {
      out.push({ key: `add:${i}`, kind: "ADD_PHASE", index: i, phase: p });
      return;
    }
    const cur = byId.get(p.id);
    if (!cur) return; // la fase fue borrada por un humano después de la propuesta → delta stale
    const changes: PhaseFieldChange[] = [];
    for (const f of FIELDS) {
      const from = val(cur, f);
      const to = val(p, f);
      if (from !== to) changes.push({ field: f, from, to });
    }
    if (changes.length > 0) {
      out.push({ key: `mod:${p.id}`, kind: "MODIFY_PHASE", phaseId: p.id, name: cur.name, changes });
    }
  });

  const toAnchor = day(proposal.anchorStartDate);
  const fromAnchor = day(currentAnchor);
  if (toAnchor && toAnchor !== fromAnchor) {
    out.push({ key: "anchor", kind: "SET_ANCHOR", from: fromAnchor, to: toAnchor });
  }

  return out;
}

/** Etiqueta humana de un cambio de campo (para el badge "Sugerencia" del Gantt). */
export function describeChange(c: PhaseFieldChange): string {
  switch (c.field) {
    case "durationWeeks":
      return `${c.from ?? "?"} → ${c.to ?? "?"} semanas`;
    case "startWeek":
      return `inicio S${c.from ?? "auto"} → S${c.to ?? "auto"}`;
    case "name":
      return `renombrar a «${c.to}»`;
    case "sessionCount":
      return `${c.from ?? "?"} → ${c.to ?? "?"} sesiones`;
    case "activityType":
      return `tipo → ${c.to ?? "sin tipo"}`;
    case "notes":
      return "notas actualizadas";
  }
}
