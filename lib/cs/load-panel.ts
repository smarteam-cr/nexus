/**
 * lib/cs/load-panel.ts
 *
 * Carga BATCH del panel de Éxito del cliente: cartera (reuso de loadPortfolio),
 * alertas vigentes del watchdog y snapshot de señales HubSpot por cliente.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio/load";
// El orden de triage vive con los demás diccionarios de presentación, para que el feed y el
// panel no puedan divergir en cómo priorizan.
import { SEV_ORDER } from "@/lib/cs/alert-labels";
import { CLIENTE_NO_EXCLIENTE_WHERE } from "@/lib/cs/exclientes";

export interface CsAlertRow {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  category: string;
  title: string;
  reason: string;
  suggestedAction: string | null;
  evidence: Record<string, unknown>;
  status: "OPEN" | "SEEN" | "RESOLVED" | "DISMISSED";
  occurrences: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  createdAt: string;
  /** Cuándo y quién la cerró, y qué anotó (lib/cs/alertas-reglas.ts). null mientras está abierta. */
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  resolutionNote: string | null;
}

export interface ClientSignalsRow {
  clientId: string;
  /** Nombre del cliente (para clientes con señales pero sin fila en la cartera). */
  clientName: string;
  fetchedAt: string;
  fetchStatus: string;
  lastEngagementAt: string | null;
  engagements90d: number | null;
  openTicketCount: number | null;
  ticketsSupported: boolean;
  nextRenewalCloseAt: string | null;
  openExpansionAmount: number | null;
  openDealCount: number | null;
  /** Deals crudos (open/renewals/expansion) para la sección de expansión. */
  deals: Record<string, unknown> | null;
}

export interface CsPanelData {
  rows: PortfolioRow[];
  alerts: CsAlertRow[];
  signalsByClient: Record<string, ClientSignalsRow>;
}

export function serializeAlert(a: {
  id: string;
  clientId: string;
  client?: { name: string } | null;
  projectId: string | null;
  project?: { name: string } | null;
  severity: string;
  category: string;
  title: string;
  reason: string;
  suggestedAction: string | null;
  evidence: Prisma.JsonValue;
  status: string;
  occurrences: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  createdAt: Date;
  resolvedAt?: Date | null;
  resolvedByEmail?: string | null;
  resolutionNote?: string | null;
}): CsAlertRow {
  return {
    id: a.id,
    clientId: a.clientId,
    clientName: a.client?.name ?? "",
    projectId: a.projectId,
    projectName: a.project?.name ?? null,
    severity: a.severity as CsAlertRow["severity"],
    category: a.category,
    title: a.title,
    reason: a.reason,
    suggestedAction: a.suggestedAction,
    evidence: (a.evidence && typeof a.evidence === "object" && !Array.isArray(a.evidence)
      ? (a.evidence as Record<string, unknown>)
      : {}),
    status: a.status as CsAlertRow["status"],
    occurrences: a.occurrences,
    firstDetectedAt: a.firstDetectedAt.toISOString(),
    lastDetectedAt: a.lastDetectedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    resolvedByEmail: a.resolvedByEmail ?? null,
    resolutionNote: a.resolutionNote ?? null,
  };
}


export async function loadCsPanel(
  clientWhere: Prisma.ClientWhereInput | null,
  /** Portfolio ya cargado por el caller (la page lo comparte con loadCsDashboard). */
  portfolioRows?: PortfolioRow[],
): Promise<CsPanelData> {
  // El clientWhere se aplica a las TRES queries — hoy el panel es solo para roles
  // con seeAllClients (where null), pero si mañana un rol acotado gana acceso, no
  // puede ver alertas ni montos de deals fuera de su scope.
  const [rows, alerts, signals] = await Promise.all([
    portfolioRows ? Promise.resolve(portfolioRows) : loadPortfolio(clientWhere),
    prisma.csAlert.findMany({
      // Sin las de un excliente (lib/cs/exclientes.ts).
      where: { status: { in: ["OPEN", "SEEN"] }, client: clientWhere ? { AND: [clientWhere, CLIENTE_NO_EXCLIENTE_WHERE] } : CLIENTE_NO_EXCLIENTE_WHERE },

      include: { client: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { lastDetectedAt: "desc" },
      take: 200,
    }),
    prisma.clientCsSignals.findMany({
      ...(clientWhere ? { where: { client: clientWhere } } : {}),
      include: { client: { select: { name: true } } },
    }),
  ]);

  const sortedAlerts = alerts
    .map(serializeAlert)
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.lastDetectedAt.localeCompare(a.lastDetectedAt));

  const signalsByClient: Record<string, ClientSignalsRow> = {};
  for (const s of signals) {
    signalsByClient[s.clientId] = {
      clientId: s.clientId,
      clientName: s.client?.name ?? s.clientId,
      fetchedAt: s.fetchedAt.toISOString(),
      fetchStatus: s.fetchStatus,
      lastEngagementAt: s.lastEngagementAt?.toISOString() ?? null,
      engagements90d: s.engagements90d,
      openTicketCount: s.openTicketCount,
      ticketsSupported: s.ticketsSupported,
      nextRenewalCloseAt: s.nextRenewalCloseAt?.toISOString() ?? null,
      openExpansionAmount: s.openExpansionAmount,
      openDealCount: s.openDealCount,
      deals: (s.deals && typeof s.deals === "object" && !Array.isArray(s.deals)
        ? (s.deals as Record<string, unknown>)
        : null),
    };
  }

  return { rows, alerts: sortedAlerts, signalsByClient };
}
