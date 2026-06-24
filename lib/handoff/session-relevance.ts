/**
 * lib/handoff/session-relevance.ts
 *
 * Relevancia de una sesión para el HANDOFF (Sales→CS). Regla: una sesión alimenta el
 * handoff si su título es de HANDOFF o KICKOFF, O si participó alguien de VENTAS en la
 * sala. El resto (levantamientos/diagnósticos semanales, implementación, review, etc.)
 * son ENTREGA DE SERVICIO y NO alimentan — aunque tengan "Sales/Marketing/Service" en el
 * título o un CSE como organizador. (Para clientes donde no se grabaron sesiones de
 * ventas, el handoff y el kickoff son la fuente; las llamadas de venta reales se cubren
 * por "Ventas en la sala".)
 *
 * Fuente ÚNICA de las listas de keywords — la usan la generación (analyze, vía su
 * classifyForHandoff inline) y la revisión de sesiones (A2 · session-candidates).
 */

// Títulos de entrega/CS que NUNCA alimentan el handoff. Se chequean PRIMERO (ganan).
export const HANDOFF_EXCLUDE_TITLE_KEYWORDS = [
  "implementacion", "implementation",
  "adopcion", "adoption",
  "capacitacion", "training",
  "review", "revision",
  "retro", "retrospectiva",
  "sesion semanal", "weekly",
  "stand up", "standup",
  "qbr", "business review",
];

// Títulos que SÍ alimentan el handoff: solo handoff y kickoff (entran aunque no haya
// Ventas formal en la sala). Lo demás depende de si hubo Ventas presente.
export const HANDOFF_INCLUDE_TITLE_KEYWORDS = [
  "hand off", "handoff", "hand-off",
  "traspaso",
  "kickoff", "kick-off", "kick off",
];

/** Insensitive a mayúsculas y acentos (NFD + remover marcas combinantes U+0300–U+036F). */
function normalizeTitle(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * ¿Esta sesión alimenta el handoff? Excluir-por-título gana; luego incluir-por-título;
 * si el título es neutro, incluye sólo si hay Ventas en la sala (participants u organizer).
 */
export function classifyHandoffSession(
  title: string,
  participants: string[],
  organizerEmail: string | null,
  salesEmails: Set<string>,
): { include: boolean; reason: string } {
  const t = normalizeTitle(title || "");
  const excludeHit = HANDOFF_EXCLUDE_TITLE_KEYWORDS.find((kw) => t.includes(kw));
  if (excludeHit) return { include: false, reason: `título de entrega/CS ("${excludeHit}")` };
  const includeHit = HANDOFF_INCLUDE_TITLE_KEYWORDS.find((kw) => t.includes(kw));
  if (includeHit) return { include: true, reason: `título de venta ("${includeHit}")` };
  const all = organizerEmail ? [...participants, organizerEmail] : participants;
  if (all.some((p) => salesEmails.has(p.toLowerCase()))) return { include: true, reason: "Ventas en la sala" };
  return { include: false, reason: "sin Ventas y título neutro" };
}
