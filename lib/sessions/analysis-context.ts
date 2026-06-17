/**
 * lib/sessions/analysis-context.ts
 *
 * Helper que dado un Client + filtros, devuelve:
 *   1. Las sesiones de FirefliesSession asociadas al Client que matchean los filtros
 *   2. El bloque de texto formateado listo para pasar a Claude como user message
 *
 * Reutiliza la cascada de matching de `lib/sessions/categorize.ts` para asociar
 * sesiones a Client por dominio de emailDomains o por manualClientId.
 */

import type { FirefliesSession, Client, TeamMember } from "@prisma/client";

const INTERNAL_DOMAIN = "smarteamcr.com";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AnalysisFilters {
  from?: string | null;          // ISO date inclusive
  to?: string | null;            // ISO date inclusive
  teamRoles?: string[];          // ["Ventas", "CSE", ...] — multi-select
  onlyWithContent?: boolean;     // default true: excluye sesiones sin transcript ni summary
}

export interface AnalysisContextResult {
  /** Sesiones que matchearon los filtros, ordenadas asc por fecha (cronológico) */
  sessions: Pick<
    FirefliesSession,
    "id" | "title" | "date" | "participants" | "transcript" | "summary"
  >[];
  /** Bloque de texto formateado listo para Claude */
  userMessage: string;
  /** Conteo rápido para preview en UI */
  count: number;
}

// ── Helper interno: ¿la sesión matchea al Client? ─────────────────────────────
// Usa la misma lógica que la sidebar (categorize.ts): manualClientId → emailDomains → title.
// Acá no necesitamos cascada completa porque ya estamos enfocados en UN client.

function sessionMatchesClient(
  session: Pick<FirefliesSession, "manualClientId" | "participants" | "title">,
  client: Pick<Client, "id" | "name" | "company" | "emailDomains">
): boolean {
  // 1. Manual override
  if (session.manualClientId === client.id) return true;

  // 2. Email domain matching
  const participantDomains = session.participants
    .map((p) => p.split("@")[1]?.toLowerCase())
    .filter((d): d is string => !!d);
  if (client.emailDomains?.some((d) => participantDomains.includes(d.toLowerCase()))) {
    return true;
  }

  // 3. Title matching (palabras ≥4 chars)
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const titleWords = new Set(
    normalize(session.title).split(/[\s|&,.()\[\]!?*\-_]+/).filter((w) => w.length >= 4)
  );
  if (titleWords.size === 0) return false;
  const nameParts = normalize(client.name).split(/\s+/).filter((p) => p.length >= 4);
  const compParts = client.company
    ? normalize(client.company).split(/[\s.\-_]+/).filter((p) => p.length >= 4)
    : [];
  return (
    nameParts.some((p) => titleWords.has(p)) ||
    compParts.some((p) => titleWords.has(p))
  );
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Filtra las sesiones de un Client según filtros y devuelve el contexto formateado.
 *
 * @param allSessions Todas las FirefliesSession candidatas (debe traer transcript + summary).
 *                    Caller decide el universo (típicamente: sesiones de los últimos 2 años).
 * @param client      Client de Nexus al que se acota el análisis.
 * @param teamMembers Lista completa de TeamMember (para resolver filtro de roles).
 * @param filters     Filtros del usuario.
 */
export function buildAnalysisContext(
  allSessions: Pick<
    FirefliesSession,
    "id" | "title" | "date" | "participants" | "transcript" | "summary" | "manualClientId"
  >[],
  client: Pick<Client, "id" | "name" | "company" | "emailDomains">,
  teamMembers: Pick<TeamMember, "email" | "area">[],
  filters: AnalysisFilters
): AnalysisContextResult {
  const fromDate = filters.from ? new Date(filters.from) : null;
  const toDate = filters.to ? new Date(filters.to) : null;
  const onlyWithContent = filters.onlyWithContent !== false; // default true
  const teamRolesSet = new Set((filters.teamRoles ?? []).map((r) => r.toLowerCase()));

  // Pre-calcular: emails del team que tienen los roles seleccionados
  const teamEmailsByRole = new Set<string>();
  if (teamRolesSet.size > 0) {
    for (const m of teamMembers) {
      if (m.area && teamRolesSet.has(m.area.toLowerCase())) {
        teamEmailsByRole.add(m.email.toLowerCase());
      }
    }
  }

  // Filtrar
  const matched = allSessions.filter((s) => {
    // a) Asociación con el Client
    if (!sessionMatchesClient(s, client)) return false;

    // b) Rango de fechas
    if (fromDate && s.date < fromDate) return false;
    if (toDate && s.date > toDate) return false;

    // c) Filtro de equipo (al menos 1 participante en los roles seleccionados)
    if (teamEmailsByRole.size > 0) {
      const hasRole = s.participants.some((p) => teamEmailsByRole.has(p.toLowerCase()));
      if (!hasRole) return false;
    }

    // d) Solo con contenido (transcript o summary)
    if (onlyWithContent) {
      const hasTranscript = !!s.transcript;
      const hasSummary = !!s.summary;
      if (!hasTranscript && !hasSummary) return false;
    }

    return true;
  });

  // Ordenar cronológicamente (asc) para que Claude vea la evolución temporal
  const sorted = matched.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Construir userMessage
  const blocks = sorted.map((s, i) => {
    const externalParticipants = s.participants
      .filter((p) => !p.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`))
      .join(", ") || "sin información";

    const dateStr = s.date.toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric",
    });

    // Si hay transcript: usar el transcript (truncado). Sino, usar summary.
    let content = "";
    if (s.transcript) {
      content = `Transcript:\n${s.transcript.trim().slice(0, 12000)}`;
    } else if (s.summary) {
      const summaryObj = s.summary as { overview?: string; keywords?: string[]; action_items?: string[] };
      const parts: string[] = ["Resumen (sin transcript completo):"];
      if (summaryObj.overview) parts.push(summaryObj.overview);
      if (summaryObj.keywords?.length) parts.push(`Temas: ${summaryObj.keywords.join(", ")}`);
      if (summaryObj.action_items?.length) parts.push(`Acciones:\n${summaryObj.action_items.map((a) => `- ${a}`).join("\n")}`);
      content = parts.join("\n\n");
    } else {
      content = "(Sin transcript ni resumen)";
    }

    return [
      `---`,
      `[Sesión ${i + 1}] ${s.title}`,
      `Fecha: ${dateStr}`,
      `Participantes externos: ${externalParticipants}`,
      ``,
      content,
    ].join("\n");
  });

  const header = [
    `Analizá las siguientes ${sorted.length} sesión${sorted.length === 1 ? "" : "es"} con el cliente "${client.name}"${client.company ? ` (${client.company})` : ""}.`,
    `Sigan estricamente la estructura JSON del system prompt — exactamente 7 cards en el orden y con los canvasSection especificados.`,
    ``,
  ].join("\n");

  const userMessage = header + "\n" + blocks.join("\n\n");

  return {
    sessions: sorted,
    userMessage,
    count: sorted.length,
  };
}

/**
 * Versión liviana: solo cuenta las sesiones matching (para preview en UI sin traer transcripts).
 * Usar este helper en el endpoint que el cliente llama al cambiar filtros.
 */
export function countMatchingSessions(
  allSessions: Pick<
    FirefliesSession,
    "id" | "title" | "date" | "participants" | "transcript" | "summary" | "manualClientId"
  >[],
  client: Pick<Client, "id" | "name" | "company" | "emailDomains">,
  teamMembers: Pick<TeamMember, "email" | "area">[],
  filters: AnalysisFilters
): number {
  return buildAnalysisContext(allSessions, client, teamMembers, filters).count;
}
