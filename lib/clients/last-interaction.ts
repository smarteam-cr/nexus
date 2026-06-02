/**
 * lib/clients/last-interaction.ts
 *
 * Calcula, por cliente, dos métricas separadas:
 *
 *   - lastActivity: la actividad PASADA más reciente — última sesión, nota o
 *     ejecución de agente. Es lo que llamamos "Última actividad" en la UI.
 *
 *   - nextMeeting: la PRÓXIMA reunión agendada (futura), tomando el mínimo
 *     entre `Project.nextSessionDate` y la próxima `FirefliesSession` futura
 *     matched al cliente.
 *
 * Reusa el matching cascade existente (`lib/sessions/categorize.ts`) para
 * vincular sesiones → clientes, evitando duplicar lógica.
 */

import { prisma } from "@/lib/db/prisma";
import {
  categorizeSession,
  buildInternalDomainsSet,
  type CategorizeContext,
} from "@/lib/sessions/categorize";
import type { Client, SessionCategory } from "@prisma/client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ClientLite = Pick<Client, "id" | "name" | "company" | "emailDomains">;
type CategoryLite = Pick<
  SessionCategory,
  "id" | "name" | "slug" | "domains" | "kind" | "color"
>;

export type LastActivitySource = "session_past" | "note" | "agent_run";

export interface ClientActivitySummary {
  /** Última actividad PASADA del cliente — null si nunca tuvo. */
  lastActivity: {
    date: Date;
    source: LastActivitySource;
    label?: string;
  } | null;
  /** Próxima reunión FUTURA agendada — null si no hay nada en agenda. */
  nextMeeting: {
    date: Date;
    label?: string;
  } | null;
}

// ── Helper interno: max de Date | null ───────────────────────────────────────

function maxDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Devuelve un Map<clientId, ClientActivitySummary> con la actividad pasada
 * más reciente Y la próxima reunión agendada, separadas. Los clientes sin
 * ninguna de las dos no aparecen en el map.
 *
 * Para uso en /clients (lista) y sidebar.
 */
export async function computeClientActivityMap(
  clients: ClientLite[],
): Promise<Map<string, ClientActivitySummary>> {
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) return new Map();

  const [projects, stageNotesMax, agentRunsMax, allSessions, categories] =
    await Promise.all([
      prisma.project.findMany({
        where: { clientId: { in: clientIds }, nextSessionDate: { not: null } },
        select: { clientId: true, nextSessionDate: true },
      }),
      prisma.stageNote.groupBy({
        by: ["clientId"],
        where: { clientId: { in: clientIds } },
        _max: { updatedAt: true },
      }),
      prisma.agentRun.groupBy({
        by: ["clientId"],
        where: { clientId: { in: clientIds } },
        _max: { createdAt: true },
      }),
      prisma.firefliesSession.findMany({
        select: {
          date: true,
          title: true,
          participants: true,
          manualClientId: true,
        },
        orderBy: { date: "desc" },
      }),
      prisma.sessionCategory.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          domains: true,
          kind: true,
          color: true,
        },
      }),
    ]);

  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };

  // Buscar sesión pasada más reciente + próxima futura más cercana, por cliente
  const now = Date.now();
  const sessionPastByClient = new Map<string, { date: Date; title: string }>();
  const sessionFutureByClient = new Map<string, { date: Date; title: string }>();

  for (const s of allSessions) {
    const group = categorizeSession(
      {
        participants: s.participants,
        manualClientId: s.manualClientId,
        title: s.title,
      },
      ctx,
    );
    if (group.kind !== "client") continue;

    const isPast = s.date.getTime() <= now;
    if (isPast) {
      // Las sesiones vienen DESC → la primera es la más reciente
      if (!sessionPastByClient.has(group.id)) {
        sessionPastByClient.set(group.id, { date: s.date, title: s.title });
      }
    } else {
      // Para futuras: queremos la MÁS CERCANA (mín en futuro)
      const current = sessionFutureByClient.get(group.id);
      if (!current || s.date.getTime() < current.date.getTime()) {
        sessionFutureByClient.set(group.id, { date: s.date, title: s.title });
      }
    }
  }

  // Indexar stage notes y agent runs por clientId
  const notesMaxByClient = new Map<string, Date>();
  for (const n of stageNotesMax) {
    if (n._max.updatedAt) notesMaxByClient.set(n.clientId, n._max.updatedAt);
  }
  const runsMaxByClient = new Map<string, Date>();
  for (const r of agentRunsMax) {
    if (r._max.createdAt) runsMaxByClient.set(r.clientId, r._max.createdAt);
  }

  // Próxima sesión agendada manual por cliente (Project.nextSessionDate)
  const manualNextByClient = new Map<string, Date>();
  for (const p of projects) {
    if (!p.nextSessionDate || p.nextSessionDate.getTime() <= now) continue;
    const current = manualNextByClient.get(p.clientId);
    if (!current || p.nextSessionDate.getTime() < current.getTime()) {
      manualNextByClient.set(p.clientId, p.nextSessionDate);
    }
  }

  // Componer el resultado: dos campos SEPARADOS por cliente
  const result = new Map<string, ClientActivitySummary>();
  for (const c of clients) {
    const pastSession = sessionPastByClient.get(c.id);
    const futureSession = sessionFutureByClient.get(c.id);
    const note = notesMaxByClient.get(c.id) ?? null;
    const run = runsMaxByClient.get(c.id) ?? null;
    const manualNext = manualNextByClient.get(c.id) ?? null;

    // ── lastActivity: max de (sesión pasada, nota, agent run) ──────────────
    const pastSessionDate = pastSession?.date ?? null;
    const pastMax = maxDate(maxDate(pastSessionDate, note), run);

    let lastActivity: ClientActivitySummary["lastActivity"] = null;
    if (pastMax) {
      if (pastSessionDate && pastSessionDate.getTime() === pastMax.getTime()) {
        lastActivity = { date: pastMax, source: "session_past", label: pastSession!.title };
      } else if (run && run.getTime() === pastMax.getTime()) {
        lastActivity = { date: pastMax, source: "agent_run" };
      } else if (note && note.getTime() === pastMax.getTime()) {
        lastActivity = { date: pastMax, source: "note" };
      }
    }

    // ── nextMeeting: min de (sesión futura real, manual agendada) ──────────
    const futureSessionDate = futureSession?.date ?? null;
    let nextMeeting: ClientActivitySummary["nextMeeting"] = null;
    if (futureSessionDate && manualNext) {
      // Ambas existen — la más cercana gana, con label apropiado
      if (futureSessionDate.getTime() <= manualNext.getTime()) {
        nextMeeting = { date: futureSessionDate, label: futureSession!.title };
      } else {
        nextMeeting = { date: manualNext, label: "Próxima sesión agendada" };
      }
    } else if (futureSessionDate) {
      nextMeeting = { date: futureSessionDate, label: futureSession!.title };
    } else if (manualNext) {
      nextMeeting = { date: manualNext, label: "Próxima sesión agendada" };
    }

    if (lastActivity || nextMeeting) {
      result.set(c.id, { lastActivity, nextMeeting });
    }
  }

  return result;
}
