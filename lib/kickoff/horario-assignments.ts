/**
 * lib/kickoff/horario-assignments.ts
 *
 * Overlay VIVO de la asignación franja→sesión de "Sesiones y horarios" del kickoff.
 * Funciones PURAS (sin Prisma, client-safe): las usan el chokepoint externo
 * (lib/external/kickoff-view.ts), el adaptador interno y la server action del cliente.
 *
 * POR QUÉ UN OVERLAY Y NO EL BLOQUE:
 *   La asignación es COORDINACIÓN, no contenido. El bloque CARD de la sección viaja
 *   congelado en `ProjectCanvas.publishedSnapshot` (el cliente ve lo último "Subido"),
 *   pero la franja que el cliente elige tiene que verse al instante en las DOS puntas,
 *   sin publicar. Por eso vive aparte, en `Project.kickoffHorarioAssignments` — mismo
 *   patrón que `Project.hiddenKickoffKeys`.
 *
 *   El bloque sigue siendo la fuente de la DEFINICIÓN (intro, franjas, sesiones); su
 *   `sessions[].optionId` queda como semilla histórica y deja de leerse una vez que
 *   el overlay existe.
 *
 * EXCLUSIVIDAD: una franja asignada se consume — no puede estar en dos sesiones a la
 * vez, y desaparece de "Franjas que ofrecemos". `assign` lo garantiza limpiando
 * cualquier otra sesión que la tuviera.
 */

/** `{ [sessionId]: optionId | null }`. `null` = sesión sin franja (explícito). */
export type HorarioAssignments = Record<string, string | null>;

/** Json crudo de la DB → mapa tipado. `null` si nunca se sembró (kickoff pre-feature). */
export function normalizeAssignments(raw: unknown): HorarioAssignments | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: HorarioAssignments = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v === null) out[k] = null;
  }
  return out;
}

/** Semilla del overlay a partir de los `sessions[].optionId` del bloque (migración perezosa). */
export function seedAssignments(horariosData: unknown): HorarioAssignments {
  const sessions = sessionsOf(horariosData);
  const out: HorarioAssignments = {};
  for (const s of sessions) out[s.id] = typeof s.optionId === "string" ? s.optionId : null;
  return out;
}

/**
 * Devuelve la data de horarios con `sessions[].optionId` tomado del overlay.
 * Con `assignments === null` (aún sin sembrar) devuelve la data tal cual: el bloque
 * sigue siendo la verdad hasta la primera escritura.
 */
export function applyAssignments(horariosData: unknown, assignments: HorarioAssignments | null): unknown {
  if (!assignments || !horariosData || typeof horariosData !== "object") return horariosData;
  const d = horariosData as Record<string, unknown>;
  const sessions = sessionsOf(horariosData);
  if (!sessions.length) return horariosData;
  return {
    ...d,
    sessions: sessions.map((s) => ({
      ...s,
      // Sesión nueva (agregada después del último overlay) → conserva lo del bloque.
      optionId: s.id in assignments ? assignments[s.id] : (s.optionId ?? null),
    })),
  };
}

/**
 * Aplica UNA asignación sobre el overlay, respetando la exclusividad de la franja.
 * Devuelve un mapa nuevo (no muta). `optionId === null` = desasignar.
 */
export function assign(
  assignments: HorarioAssignments,
  sessionId: string,
  optionId: string | null,
): HorarioAssignments {
  const next: HorarioAssignments = { ...assignments };
  if (optionId) {
    // La franja se consume: sacarla de cualquier otra sesión que la tuviera.
    for (const [sid, oid] of Object.entries(next)) if (oid === optionId && sid !== sessionId) next[sid] = null;
  }
  next[sessionId] = optionId;
  return next;
}

/** Ids válidos de la data de horarios — para validar el body de una escritura del cliente. */
export function idsOf(horariosData: unknown): { sessionIds: Set<string>; optionIds: Set<string> } {
  const d = (horariosData ?? {}) as Record<string, unknown>;
  const options = Array.isArray(d.options) ? d.options : [];
  return {
    sessionIds: new Set(sessionsOf(horariosData).map((s) => s.id)),
    optionIds: new Set(
      options
        .filter((o): o is { id: string } => !!o && typeof (o as { id?: unknown }).id === "string")
        .map((o) => o.id),
    ),
  };
}

type RawSession = { id: string; optionId?: unknown };
function sessionsOf(horariosData: unknown): RawSession[] {
  const d = (horariosData ?? {}) as Record<string, unknown>;
  const sessions = Array.isArray(d.sessions) ? d.sessions : [];
  return sessions.filter((s): s is RawSession => !!s && typeof (s as RawSession).id === "string");
}

/** Key de la sección de horarios en el canvas Kickoff. */
export const HORARIOS_KEY = "horarios";
