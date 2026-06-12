/**
 * lib/clients/meeting-dates.ts
 *
 * Calcula, por cliente, la fecha de la última reunión donde participó alguien
 * del equipo de Ventas y la última donde participó alguien de CSE.
 *
 * PERF: igual que lib/clients/last-interaction.ts — usa el match materializado
 * `FirefliesSession.resolvedClientId` (índice [resolvedClientId, date desc]) en
 * vez de cargar TODAS las sesiones (~16k) y re-matchear con categorizeSession
 * en JS. Solo se transfieren las sesiones ya vinculadas a los clientes pedidos.
 */

import { prisma } from "@/lib/db/prisma";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MeetingDates {
  /** Última sesión donde participó un TeamMember de Ventas. */
  sales?: Date;
  /** Última sesión donde participó un TeamMember de CSE. */
  cse?: Date;
}

interface TeamMemberLite {
  email: string;
  /** LEGACY string libre ("Sales"/"CSE"/…) — puede venir null. */
  role: string | null;
  /** Enum nuevo (TeamRole). Se acepta cualquiera de los dos para el match. */
  roleEnum?: string | null;
}

// ── Función principal ──────────────────────────────────────────────────────────

/**
 * Devuelve un Map clientId → { sales?, cse? }.
 * Las sesiones se leen ordenadas por fecha DESC: el primer hit por
 * (cliente, rol) ya es la fecha más reciente.
 */
export async function computeLastMeetingDates(params: {
  clientIds: string[];
  teamMembers: TeamMemberLite[];
}): Promise<Map<string, MeetingDates>> {
  const { clientIds, teamMembers } = params;
  if (clientIds.length === 0) return new Map();

  const isSales = (m: TeamMemberLite) => m.roleEnum === "SALES" || m.role === "Sales";
  const isCse = (m: TeamMemberLite) => m.roleEnum === "CSE" || m.role === "CSE";

  const salesEmails = new Set(teamMembers.filter(isSales).map((m) => m.email.toLowerCase()));
  const cseEmails = new Set(teamMembers.filter(isCse).map((m) => m.email.toLowerCase()));
  if (salesEmails.size === 0 && cseEmails.size === 0) return new Map();

  // Solo sesiones pasadas YA matcheadas a los clientes pedidos — usa el índice
  // [resolvedClientId, date desc]; no carga títulos ni sesiones huérfanas/internas.
  const sessions = await prisma.firefliesSession.findMany({
    where: { resolvedClientId: { in: clientIds }, date: { lte: new Date() } },
    orderBy: { date: "desc" },
    select: { resolvedClientId: true, date: true, participants: true },
  });

  const result = new Map<string, MeetingDates>();

  for (const s of sessions) {
    const clientId = s.resolvedClientId;
    if (!clientId) continue;

    const entry = result.get(clientId) ?? {};
    // Saltar si ya tenemos ambas fechas para este cliente
    if (entry.sales !== undefined && entry.cse !== undefined) continue;

    const emails = s.participants.map((e) => e.toLowerCase());
    let changed = false;

    if (entry.sales === undefined && emails.some((e) => salesEmails.has(e))) {
      entry.sales = s.date;
      changed = true;
    }
    if (entry.cse === undefined && emails.some((e) => cseEmails.has(e))) {
      entry.cse = s.date;
      changed = true;
    }

    if (changed) result.set(clientId, entry);
  }

  return result;
}
