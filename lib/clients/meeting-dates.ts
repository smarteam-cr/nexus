/**
 * lib/clients/meeting-dates.ts
 *
 * Calcula, por cliente, la fecha de la última reunión donde participó alguien
 * del equipo de Ventas y la última donde participó alguien de CSE.
 *
 * No requiere cambios de schema: las sesiones (`FirefliesSession`) no guardan
 * un `clientId`, así que el cliente se resuelve en memoria con la misma cascada
 * determinista que usa el módulo de sesiones (`categorizeSession`).
 */

import {
  categorizeSession,
  buildInternalDomainsSet,
  type CategorizeContext,
} from "@/lib/sessions/categorize";
import type { Client, SessionCategory } from "@prisma/client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MeetingDates {
  /** Última sesión donde participó un TeamMember con role="Sales". */
  sales?: Date;
  /** Última sesión donde participó un TeamMember con role="CSE". */
  cse?: Date;
}

interface SessionLite {
  date: Date;
  participants: string[];
  manualClientId: string | null;
  title: string;
}

interface TeamMemberLite {
  email: string;
  role: string | null;
}

type ClientLite = Pick<Client, "id" | "name" | "company" | "emailDomains">;
type CategoryLite = Pick<
  SessionCategory,
  "id" | "name" | "slug" | "domains" | "kind" | "color"
>;

// ── Función principal ──────────────────────────────────────────────────────────

/**
 * Devuelve un Map clientId → { sales?, cse? }.
 *
 * IMPORTANTE: `sessions` debe venir ordenado por fecha DESCENDENTE — así el
 * primer hit por (cliente, rol) ya es la fecha más reciente y no hace falta
 * comparar.
 */
export function computeLastMeetingDates(params: {
  sessions: SessionLite[];
  clients: ClientLite[];
  categories: CategoryLite[];
  teamMembers: TeamMemberLite[];
}): Map<string, MeetingDates> {
  const { sessions, clients, categories, teamMembers } = params;

  // Contexto de matching. hubspotCompaniesByDomain vacío a propósito: omite el
  // lookup costoso de HubSpot (paso 5), que solo produce resultados no-cliente.
  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };

  const salesEmails = new Set(
    teamMembers
      .filter((m) => m.role === "Sales")
      .map((m) => m.email.toLowerCase())
  );
  const cseEmails = new Set(
    teamMembers
      .filter((m) => m.role === "CSE")
      .map((m) => m.email.toLowerCase())
  );

  const result = new Map<string, MeetingDates>();

  for (const s of sessions) {
    const group = categorizeSession(
      { participants: s.participants, manualClientId: s.manualClientId, title: s.title },
      ctx
    );
    if (group.kind !== "client") continue;

    const clientId = group.id;
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
