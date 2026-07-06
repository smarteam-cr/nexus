/**
 * lib/cs/load-account.ts
 *
 * Carga de la VISTA POR CUENTA de Customer Success (/customer-success/[clientId]):
 * proyectos con su summary determinístico (reuso loadPortfolio con where por id),
 * alertas vigentes, señales HubSpot, snapshot de Partner, resumen citado (brief)
 * y las últimas minutas de sesión (fuente citable con fecha).
 *
 * El acceso lo valida la PAGE (requireCapability seeAllClients + este where):
 * si el cliente no pasa el accessibleClientWhere del usuario, devuelve null.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio/load";
import { serializeAlert, type CsAlertRow } from "@/lib/cs/load-panel";

export interface AccountMinute {
  sessionId: string;
  sessionTitle: string;
  date: string;
  summary: string;
  risks: Array<{ text: string; severity?: string }>;
  agreements: Array<{ text: string }>;
}

export interface AccountPartner {
  fetchedAt: string;
  uusScore: number | null;
  uusTrend: number | null;
  activationScore: number | null;
  toolUsageScore: number | null;
  valueMetricsScore: number | null;
  consumptionScore: number | null;
  marketingScore: number | null;
  salesScore: number | null;
  serviceScore: number | null;
  commerceScore: number | null;
  seats: Record<string, { assigned: number | null; available: number | null; limit: number | null }> | null;
  marketingContactsLimit: number | null;
  marketingContactsUsed: number | null;
  mrrTotal: number | null;
  mrrManaged: number | null;
  mrrUpForRenewal: number | null;
  nextRenewalAt: string | null;
  renewalsByHub: Record<string, string | null> | null;
  managedExpiryAt: string | null;
  cancellationHubs: string | null;
  revenueSignal: string | null;
  revenueSignalDetail: string | null;
  hubEditions: Record<string, string | null> | null;
  activeProducts: string | null;
  hsCsmName: string | null;
  hsCsmEmail: string | null;
  hsGrowthName: string | null;
  hsGrowthEmail: string | null;
  cslImplementaciones: string | null;
  country: string | null;
}

export interface AccountBriefStatement {
  text: string;
  source: { kind: string; id: string; label: string; date: string | null };
}

export interface AccountProjectOps {
  hubspotPriority: string | null;
  hubspotStatus: string | null;
  hubspotBlockReason: string | null;
  hubspotBlockDetail: string | null;
  hubspotAdoptionState: string | null;
}

export interface CsAccountData {
  clientId: string;
  clientName: string;
  clientCompany: string | null;
  projects: PortfolioRow[];
  projectOps: Record<string, AccountProjectOps>; // by projectId
  alerts: CsAlertRow[];
  partner: AccountPartner | null; // null = sin snapshot (scope no autorizado o sin match)
  brief: {
    headline: string | null;
    statements: AccountBriefStatement[];
    generatedAt: string;
    staleAt: string | null;
  } | null;
  minutes: AccountMinute[];
  signals: {
    fetchedAt: string;
    lastEngagementAt: string | null;
    engagements90d: number | null;
    openTicketCount: number | null;
    ticketsSupported: boolean;
  } | null;
  /** CONFIDENCIALIDAD (términos de partner): uso/UUS/MRR solo CSL y SUPER_ADMIN.
   *  false = partner viene null y los statements del brief con fuente de partner
   *  se filtran; la UI oculta las secciones (sin mensaje de 403). */
  partnerVisible: boolean;
}

export async function loadCsAccount(
  clientId: string,
  clientWhere: Prisma.ClientWhereInput | null,
  includePartner = true,
): Promise<CsAccountData | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...(clientWhere ?? {}) },
    select: { id: true, name: true, company: true },
  });
  if (!client) return null;

  const [projects, alerts, partner, brief, csSignals, minuteSessions] = await Promise.all([
    loadPortfolio({ id: clientId }),
    prisma.csAlert.findMany({
      where: { clientId, status: { in: ["OPEN", "SEEN"] } },
      include: { client: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { lastDetectedAt: "desc" },
      take: 50,
    }),
    includePartner ? prisma.clientPartnerSnapshot.findUnique({ where: { clientId } }) : Promise.resolve(null),
    prisma.csAccountBrief.findUnique({ where: { clientId } }),
    prisma.clientCsSignals.findUnique({ where: { clientId } }),
    prisma.firefliesSession.findMany({
      where: {
        OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }],
        date: { lte: new Date() },
        minute: { isNot: null },
      },
      orderBy: { date: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        date: true,
        minute: { select: { summary: true, risks: true, agreements: true } },
      },
    }),
  ]);

  const projectIds = projects.map((p) => p.projectId);
  const ops = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true, hubspotPriority: true, hubspotStatus: true,
      hubspotBlockReason: true, hubspotBlockDetail: true, hubspotAdoptionState: true,
    },
  });
  const projectOps: Record<string, AccountProjectOps> = {};
  for (const o of ops) {
    projectOps[o.id] = {
      hubspotPriority: o.hubspotPriority,
      hubspotStatus: o.hubspotStatus,
      hubspotBlockReason: o.hubspotBlockReason,
      hubspotBlockDetail: o.hubspotBlockDetail,
      hubspotAdoptionState: o.hubspotAdoptionState,
    };
  }

  const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  return {
    clientId: client.id,
    clientName: client.name,
    clientCompany: client.company,
    projects,
    projectOps,
    alerts: alerts.map(serializeAlert),
    partner: partner
      ? {
          fetchedAt: partner.fetchedAt.toISOString(),
          uusScore: partner.uusScore,
          uusTrend: typeof partner.uusTrend === "number" ? partner.uusTrend : null,
          activationScore: partner.activationScore,
          toolUsageScore: partner.toolUsageScore,
          valueMetricsScore: partner.valueMetricsScore,
          consumptionScore: partner.consumptionScore,
          marketingScore: partner.marketingScore,
          salesScore: partner.salesScore,
          serviceScore: partner.serviceScore,
          commerceScore: partner.commerceScore,
          seats: partner.seats as AccountPartner["seats"],
          marketingContactsLimit: partner.marketingContactsLimit,
          marketingContactsUsed: partner.marketingContactsUsed,
          mrrTotal: partner.mrrTotal,
          mrrManaged: partner.mrrManaged,
          mrrUpForRenewal: partner.mrrUpForRenewal,
          nextRenewalAt: partner.nextRenewalAt?.toISOString() ?? null,
          renewalsByHub: partner.renewalsByHub as AccountPartner["renewalsByHub"],
          managedExpiryAt: partner.managedExpiryAt?.toISOString() ?? null,
          cancellationHubs: partner.cancellationHubs,
          revenueSignal: partner.revenueSignal,
          revenueSignalDetail: partner.revenueSignalDetail,
          hubEditions: partner.hubEditions as AccountPartner["hubEditions"],
          activeProducts: partner.activeProducts,
          hsCsmName: partner.hsCsmName,
          hsCsmEmail: partner.hsCsmEmail,
          hsGrowthName: partner.hsGrowthName,
          hsGrowthEmail: partner.hsGrowthEmail,
          cslImplementaciones: partner.cslImplementaciones,
          country: partner.country,
        }
      : null,
    brief: brief
      ? {
          headline: brief.headline,
          // Sin acceso a partner: los statements citados con esa fuente se filtran
          // (contienen UUS/MRR — confidenciales por términos de partner).
          statements: asArray<AccountBriefStatement>(brief.statements).filter(
            (s) => includePartner || s.source?.kind !== "hubspot_partner",
          ),
          generatedAt: brief.generatedAt.toISOString(),
          staleAt: brief.staleAt?.toISOString() ?? null,
        }
      : null,
    minutes: minuteSessions.map((s) => ({
      sessionId: s.id,
      sessionTitle: s.title,
      date: s.date.toISOString(),
      summary: s.minute?.summary ?? "",
      risks: asArray<{ text: string; severity?: string }>(s.minute?.risks),
      agreements: asArray<{ text: string }>(s.minute?.agreements),
    })),
    signals: csSignals
      ? {
          fetchedAt: csSignals.fetchedAt.toISOString(),
          lastEngagementAt: csSignals.lastEngagementAt?.toISOString() ?? null,
          engagements90d: csSignals.engagements90d,
          openTicketCount: csSignals.openTicketCount,
          ticketsSupported: csSignals.ticketsSupported,
        }
      : null,
    partnerVisible: includePartner,
  };
}
