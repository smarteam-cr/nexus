/**
 * lib/clients/last-interaction.ts
 *
 * Calcula, por cliente, la fecha de "última interacción real" combinando
 * múltiples fuentes:
 *   - última sesión (FirefliesSession / Google Meet) matched al cliente
 *   - última nota del consultor (StageNote.updatedAt)
 *   - última ejecución de agente (AgentRun.createdAt)
 *   - próxima sesión agendada (Project.nextSessionDate) — futura, hace que
 *     clientes con reunión próxima suban en la lista
 *
 * El resultado: Map<clientId, Date> con el MAX de todas las fuentes.
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

/**
 * Fuente que produjo el "último contacto" para un cliente. Útil para mostrar
 * un tooltip explicativo en la UI ("hace 2 días · reunión 'Hand Off | X'").
 */
export type LastInteractionSource =
  | "session_past"
  | "session_future"
  | "note"
  | "agent_run";

export interface LastInteraction {
  date: Date;
  source: LastInteractionSource;
  label?: string;
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
 * Devuelve un Map<clientId, LastInteraction> con la última interacción de
 * cada cliente. Los clientes sin ninguna interacción no aparecen en el map.
 *
 * Esta función ejecuta queries optimizadas (groupBy + 1 findMany de sesiones).
 * Costo aproximado: O(n_sessions + n_stage_notes + n_agent_runs) en memoria.
 *
 * Para uso en /clients (lista) y sidebar.
 */
export async function computeLastInteractionMap(
  clients: ClientLite[]
): Promise<Map<string, LastInteraction>> {
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) return new Map();

  // 1. Próxima sesión agendada por proyecto → max por cliente
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

  // 2. Construir context de matching (reusa categorizeSession)
  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };

  // 3. Buscar la sesión PASADA más reciente de cada cliente (sessions vienen DESC)
  //    y opcionalmente registrar también una sesión futura (la próxima programada).
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
    const targetMap = isPast ? sessionPastByClient : sessionFutureByClient;

    // Solo guardar la primera (más reciente para pasadas, o la "más arriba" en
    // DESC para futuras — luego abajo elegimos la PRÓXIMA más cercana).
    if (!targetMap.has(group.id)) {
      targetMap.set(group.id, { date: s.date, title: s.title });
    } else if (!isPast) {
      // Para futuras: queremos la MÁS CERCANA (mín en futuro), no la más lejana
      const current = targetMap.get(group.id)!;
      if (s.date.getTime() < current.date.getTime()) {
        targetMap.set(group.id, { date: s.date, title: s.title });
      }
    }
  }

  // 4. Indexar stage notes y agent runs por clientId
  const notesMaxByClient = new Map<string, Date>();
  for (const n of stageNotesMax) {
    if (n._max.updatedAt) notesMaxByClient.set(n.clientId, n._max.updatedAt);
  }
  const runsMaxByClient = new Map<string, Date>();
  for (const r of agentRunsMax) {
    if (r._max.createdAt) runsMaxByClient.set(r.clientId, r._max.createdAt);
  }

  // 5. Próxima sesión agendada manual por cliente (Project.nextSessionDate)
  //    Tomamos la más cercana en el futuro de todos sus proyectos.
  const manualNextByClient = new Map<string, Date>();
  for (const p of projects) {
    if (!p.nextSessionDate || p.nextSessionDate.getTime() <= now) continue;
    const current = manualNextByClient.get(p.clientId);
    if (!current || p.nextSessionDate.getTime() < current.getTime()) {
      manualNextByClient.set(p.clientId, p.nextSessionDate);
    }
  }

  // 6. Combinar todo: para cada cliente, el MAX de las fuentes pasadas + la
  //    próxima futura más cercana (cualquiera sea más reciente).
  const result = new Map<string, LastInteraction>();
  for (const c of clients) {
    const pastSession = sessionPastByClient.get(c.id);
    const futureSession = sessionFutureByClient.get(c.id);
    const note = notesMaxByClient.get(c.id) ?? null;
    const run = runsMaxByClient.get(c.id) ?? null;
    const manualNext = manualNextByClient.get(c.id) ?? null;

    // Mejor "actividad pasada" (max de todas las pasadas)
    const pastSessionDate = pastSession?.date ?? null;
    const pastMax = maxDate(maxDate(pastSessionDate, note), run);

    // Próxima futura (la más cercana). Combinamos sesión real futura + manual.
    const futureSessionDate = futureSession?.date ?? null;
    const nextFuture =
      futureSessionDate && manualNext
        ? futureSessionDate.getTime() < manualNext.getTime()
          ? futureSessionDate
          : manualNext
        : (futureSessionDate ?? manualNext);

    // Elegir la representativa: si hay próxima futura, gana (es la más relevante
    // para "qué hago hoy"). Si no, la pasada más reciente.
    let chosen: { date: Date; source: LastInteractionSource; label?: string } | null = null;

    if (nextFuture) {
      // Determinar si vino de session futura o manual
      const fromSession = futureSession && futureSession.date.getTime() === nextFuture.getTime();
      chosen = {
        date: nextFuture,
        source: "session_future",
        label: fromSession ? futureSession.title : "Próxima sesión agendada",
      };
    } else if (pastMax) {
      // Decidir la fuente correcta del max
      if (pastSessionDate && pastSessionDate.getTime() === pastMax.getTime()) {
        chosen = { date: pastMax, source: "session_past", label: pastSession!.title };
      } else if (run && run.getTime() === pastMax.getTime()) {
        chosen = { date: pastMax, source: "agent_run" };
      } else if (note && note.getTime() === pastMax.getTime()) {
        chosen = { date: pastMax, source: "note" };
      }
    }

    if (chosen) result.set(c.id, chosen);
  }

  return result;
}
