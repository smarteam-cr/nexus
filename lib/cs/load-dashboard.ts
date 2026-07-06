/**
 * lib/cs/load-dashboard.ts
 *
 * Agregaciones SERVER para el dashboard visual de Customer Success (charts).
 * Reusa loadPortfolio (salud/summary por proyecto) y le suma las propiedades
 * operativas del 0-970 (prioridad/status/motivo de bloqueo/adopción) y los
 * snapshots de Partner Clients (uso/licencias/MRR/renovaciones).
 *
 * REGLA DE PROCEDENCIA: los contadores distinguen la fuente — "atrasado según
 * HubSpot" (hs_status) ≠ "atrasado según cronograma" (ProjectSummary). Cada
 * bloque del shape lleva su frescura para los SourceChip de la UI.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio/load";

export interface CsDashboardData {
  byCse: Array<{
    cse: string;
    activeCount: number;
    byPriority: { high: number; medium: number; low: number; none: number };
  }>;
  byStage: Array<{ stageLabel: string; total: number; byCse: Record<string, number> }>;
  counters: {
    delayedHs: number; // hs_status = delayed | at_risk (fuente: HubSpot)
    overdueTimeline: number; // fases/tareas vencidas según cronograma (fuente: Nexus)
    blocked: number; // hs_status = blocked O etapa "Bloqueado"
    openAlerts: number;
    renewals90d: number; // renovaciones ≤90 días (fuente: HubSpot Partner)
  };
  blockReasons: Array<{
    reason: string;
    count: number;
    projects: Array<{ projectId: string; projectName: string; clientId: string; clientName: string; detail: string | null }>;
  }>;
  adoptionStates: Array<{ state: string; count: number }>; // estado_de_adopcion por proyecto
  adoption: Array<{
    clientId: string;
    clientName: string;
    uusScore: number | null;
    marketingScore: number | null;
    salesScore: number | null;
    serviceScore: number | null;
    trend: number | null; // tendencia 4 semanas (negativa = cayendo)
    nextRenewalAt: string | null;
    mrrTotal: number | null;
    mrrUpForRenewal: number | null;
  }>;
  freshness: {
    partnerSupported: boolean;
    partnerFetchedAt: string | null; // el más reciente
    stageSyncedAt: string | null; // sync de proyectos más reciente (hubspotStageSyncedAt)
  };
  /** CONFIDENCIALIDAD (términos de partner de HubSpot): los datos de uso/UUS/MRR
   *  solo se muestran a CSL y SUPER_ADMIN. false = la UI OCULTA las secciones de
   *  partner por completo (sin mensaje de 403 — el rol simplemente no las tiene). */
  partnerVisible: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** ¿El proyecto está "bloqueado"? hs_status O la etapa del pipeline (el tablero
 *  de HubSpot usa la ETAPA "Bloqueado"; hs_status es la property estándar). */
function isBlocked(p: { hubspotStatus: string | null; stageLabel: string | null }): boolean {
  return p.hubspotStatus === "blocked" || /bloquead/i.test(p.stageLabel ?? "");
}

export async function loadCsDashboard(
  clientWhere: Prisma.ClientWhereInput | null,
  /** Portfolio ya cargado por el caller (evita correr loadPortfolio — la query
   *  más pesada de la app — DOS veces en la misma page). */
  portfolioRows?: PortfolioRow[],
  /** false = rol sin acceso a datos de partner (confidenciales): ni siquiera se
   *  consultan — adoption vacío, renewals90d=0, partnerVisible=false. */
  includePartner = true,
): Promise<CsDashboardData> {
  const rows = portfolioRows ?? (await loadPortfolio(clientWhere));
  const active = rows.filter((r) => r.status === "active");
  const projectIds = active.map((r) => r.projectId);

  const [ops, snapshots, openAlerts, anySnapshotCount] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        hubspotPriority: true,
        hubspotStatus: true,
        hubspotBlockReason: true,
        hubspotBlockDetail: true,
        hubspotAdoptionState: true,
        hubspotStageSyncedAt: true,
      },
    }),
    includePartner
      ? prisma.clientPartnerSnapshot.findMany({
          where: { clientId: { not: null }, ...(clientWhere ? { client: clientWhere } : {}) },
          include: { client: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.csAlert.count({
      where: { status: "OPEN", ...(clientWhere ? { client: clientWhere } : {}) },
    }),
    // SIN filtros: distingue "el scope nunca funcionó" (0 snapshots en toda la DB)
    // de "este usuario no ve snapshots vinculados" — el mensaje de 403 solo aplica
    // al primer caso.
    includePartner ? prisma.clientPartnerSnapshot.count() : Promise.resolve(0),
  ]);
  const opsById = new Map(ops.map((o) => [o.id, o]));

  // ── Por CSE: activos + apilado por prioridad ────────────────────────────
  const cseMap = new Map<string, CsDashboardData["byCse"][number]>();
  for (const r of active) {
    const cse = r.cseName ?? "Sin CSE";
    let entry = cseMap.get(cse);
    if (!entry) {
      entry = { cse, activeCount: 0, byPriority: { high: 0, medium: 0, low: 0, none: 0 } };
      cseMap.set(cse, entry);
    }
    entry.activeCount++;
    const prio = opsById.get(r.projectId)?.hubspotPriority;
    if (prio === "high" || prio === "medium" || prio === "low") entry.byPriority[prio]++;
    else entry.byPriority.none++;
  }
  const byCse = [...cseMap.values()].sort((a, b) => b.activeCount - a.activeCount);

  // ── Por etapa del pipeline (por CSE) ────────────────────────────────────
  const stageMap = new Map<string, CsDashboardData["byStage"][number]>();
  for (const r of active) {
    const stage = r.stageLabel ?? "Sin etapa";
    let entry = stageMap.get(stage);
    if (!entry) {
      entry = { stageLabel: stage, total: 0, byCse: {} };
      stageMap.set(stage, entry);
    }
    entry.total++;
    const cse = r.cseName ?? "Sin CSE";
    entry.byCse[cse] = (entry.byCse[cse] ?? 0) + 1;
  }
  const byStage = [...stageMap.values()].sort((a, b) => b.total - a.total);

  // ── Contadores (cada uno con su FUENTE) ─────────────────────────────────
  const now = Date.now();
  let delayedHs = 0;
  let blocked = 0;
  let overdueTimeline = 0;
  for (const r of active) {
    const o = opsById.get(r.projectId);
    if (o?.hubspotStatus === "delayed" || o?.hubspotStatus === "at_risk") delayedHs++;
    if (o && isBlocked({ hubspotStatus: o.hubspotStatus, stageLabel: r.stageLabel })) blocked++;
    if (r.summary.overduePhases > 0 || r.summary.overdueTasks > 0) overdueTimeline++;
  }
  // Solo FUTURAS ≤90d (una renovación vencida sin actualizar no es "próxima" —
  // se ve en la tabla de adopción con su fecha en el pasado).
  const renewals90d = snapshots.filter(
    (s) => s.nextRenewalAt && s.nextRenewalAt.getTime() <= now + 90 * DAY_MS && s.nextRenewalAt.getTime() >= now,
  ).length;

  // ── Razones de bloqueo (motivo_de_bloqueo + detalle, con drill) ─────────
  const reasonMap = new Map<string, CsDashboardData["blockReasons"][number]>();
  for (const r of active) {
    const o = opsById.get(r.projectId);
    if (!o?.hubspotBlockReason) continue;
    let entry = reasonMap.get(o.hubspotBlockReason);
    if (!entry) {
      entry = { reason: o.hubspotBlockReason, count: 0, projects: [] };
      reasonMap.set(o.hubspotBlockReason, entry);
    }
    entry.count++;
    entry.projects.push({
      projectId: r.projectId,
      projectName: r.projectName,
      clientId: r.clientId,
      clientName: r.clientName,
      detail: o.hubspotBlockDetail,
    });
  }
  const blockReasons = [...reasonMap.values()].sort((a, b) => b.count - a.count);

  // ── Adopción por proyecto (estado_de_adopcion) ──────────────────────────
  const adoptionMap = new Map<string, number>();
  for (const r of active) {
    const state = opsById.get(r.projectId)?.hubspotAdoptionState ?? "Sin valor";
    adoptionMap.set(state, (adoptionMap.get(state) ?? 0) + 1);
  }
  const adoptionStates = [...adoptionMap.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  // ── Adopción/uso por CUENTA (Partner Clients) ───────────────────────────
  const adoption = snapshots
    .map((s) => ({
      clientId: s.clientId as string,
      clientName: s.client?.name ?? (s.clientId as string),
      uusScore: s.uusScore,
      marketingScore: s.marketingScore,
      salesScore: s.salesScore,
      serviceScore: s.serviceScore,
      trend: typeof s.uusTrend === "number" ? s.uusTrend : null,
      nextRenewalAt: s.nextRenewalAt?.toISOString() ?? null,
      mrrTotal: s.mrrTotal,
      mrrUpForRenewal: s.mrrUpForRenewal,
    }))
    .sort((a, b) => (a.uusScore ?? 999) - (b.uusScore ?? 999)); // los de menor uso primero (accionables)

  const partnerFetchedAt =
    snapshots.length > 0
      ? new Date(Math.max(...snapshots.map((s) => s.fetchedAt.getTime()))).toISOString()
      : null;
  const stageSyncTimes = ops.map((o) => o.hubspotStageSyncedAt?.getTime() ?? 0).filter((t) => t > 0);
  const stageSyncedAt = stageSyncTimes.length > 0 ? new Date(Math.max(...stageSyncTimes)).toISOString() : null;

  return {
    byCse,
    byStage,
    counters: { delayedHs, overdueTimeline, blocked, openAlerts, renewals90d },
    blockReasons,
    adoptionStates,
    adoption,
    freshness: {
      // "el sync de partner corrió alguna vez con scope OK" (conteo global sin
      // filtros) — NO "este usuario ve snapshots".
      partnerSupported: anySnapshotCount > 0,
      partnerFetchedAt,
      stageSyncedAt,
    },
    partnerVisible: includePartner,
  };
}
