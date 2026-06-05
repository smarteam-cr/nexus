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

  // PERF #1: en vez de cargar TODAS las sesiones (~16k) y matchear en JS, leemos el
  // match materializado (FirefliesSession.resolvedClientId) con dos queries indexadas
  // distinct-on (índice [resolvedClientId, date desc]):
  //   - última sesión PASADA por cliente (date<=now → la más reciente)
  //   - próxima sesión FUTURA por cliente (date>now → la más cercana)
  // resolvedClientId == el resultado de categorizeSession (verificado: backfill changed=0),
  // así que el resultado funcional es idéntico al loop anterior.
  const now = Date.now();
  const nowDate = new Date(now);
  const [projects, stageNotesMax, agentRunsMax, pastSessions, futureSessions] =
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
        where: { resolvedClientId: { in: clientIds }, date: { lte: nowDate } },
        distinct: ["resolvedClientId"],
        orderBy: [{ resolvedClientId: "asc" }, { date: "desc" }],
        select: { resolvedClientId: true, date: true, title: true },
      }),
      prisma.firefliesSession.findMany({
        where: { resolvedClientId: { in: clientIds }, date: { gt: nowDate } },
        distinct: ["resolvedClientId"],
        orderBy: [{ resolvedClientId: "asc" }, { date: "asc" }],
        select: { resolvedClientId: true, date: true, title: true },
      }),
    ]);

  const sessionPastByClient = new Map<string, { date: Date; title: string }>();
  for (const s of pastSessions) {
    if (s.resolvedClientId) sessionPastByClient.set(s.resolvedClientId, { date: s.date, title: s.title });
  }
  const sessionFutureByClient = new Map<string, { date: Date; title: string }>();
  for (const s of futureSessions) {
    if (s.resolvedClientId) sessionFutureByClient.set(s.resolvedClientId, { date: s.date, title: s.title });
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
