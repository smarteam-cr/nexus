/**
 * lib/hubspot/cs-signals.ts
 *
 * SEÑALES de Éxito del cliente por Client, cacheadas en ClientCsSignals:
 *   1. Deals — renovaciones próximas y expansión abierta (heurística determinística
 *      sobre fetchCompanyDeals; no hay API de Partner, ver plan).
 *   2. Engagement/frialdad — último contacto (timeline de HubSpot ∪ última
 *      FirefliesSession del cliente: un cliente con Meets fuera de HubSpot NO es frío).
 *   3. Tickets — volumen/abiertos (fetcher nuevo con degradación de scope).
 *   4. Etapa del pipeline CS — YA vive en Project.hubspotPipelineStageLabel
 *      (sync-projects); acá no se re-fetchea, el panel/watchdog la cruzan en runtime.
 *
 * `refreshAllCsSignals` es SECUENCIAL con pausa entre clientes (rate limits de
 * HubSpot — nunca Promise.all contra el CRM) y salta snapshots frescos.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getSystemHubspotClient } from "./client";
import { fetchCompanyDeals, type AvailableDeal } from "./deals";
import { fetchCompanyTimelineItems } from "./company-timeline";
import { fetchCompanyTickets } from "./tickets";

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_WINDOW_DAYS = 90; // renovaciones "próximas" = closedate dentro de esta ventana
const PAUSE_BETWEEN_CLIENTS_MS = 400;

// Heurística de clasificación de deals (nombre O pipeline). Se calibra con datos
// reales — pregunta abierta del plan: ¿Smarteam nombra renovaciones consistente?
const RENEWAL_RE = /renov|renew/i;
const EXPANSION_RE = /expans|upsell|upgrade|ampliaci|add[- ]?on|cross[- ]?sell|crecimiento/i;

function matches(re: RegExp, deal: AvailableDeal): boolean {
  return re.test(deal.name) || (deal.pipeline ? re.test(deal.pipeline) : false);
}

function parseAmount(a: string | null): number {
  const n = a ? parseFloat(a) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export interface ClientSignalsSummary {
  clientId: string;
  fetchStatus: "ok" | "partial" | "error";
  errors: string[];
}

/** Calcula y persiste (upsert) las señales de UN cliente. Lanza solo si el
 *  cliente no existe o no tiene company de HubSpot — los fallos por señal
 *  degradan a fetchStatus "partial"/"error" sin tumbar el refresh global. */
export async function computeClientSignals(clientId: string): Promise<ClientSignalsSummary> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, hubspotCompanyId: true },
  });
  if (!client) throw new Error(`Cliente ${clientId} no existe`);
  if (!client.hubspotCompanyId) throw new Error(`Cliente ${clientId} sin hubspotCompanyId`);

  const hs = await getSystemHubspotClient();
  const errors: string[] = [];
  const now = Date.now();

  // ── 1. Deals ────────────────────────────────────────────────────────────────
  let deals: AvailableDeal[] = [];
  try {
    deals = await fetchCompanyDeals(hs, client.hubspotCompanyId);
  } catch (e) {
    errors.push(`deals: ${e instanceof Error ? e.message : "error"}`);
  }
  const open = deals.filter((d) => !d.isClosed);
  const renewals = open.filter((d) => matches(RENEWAL_RE, d));
  const expansion = open.filter((d) => matches(EXPANSION_RE, d) && !matches(RENEWAL_RE, d));
  const upcomingRenewalDates = renewals
    .map((d) => (d.closedate ? new Date(d.closedate) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()))
    .filter((d) => d.getTime() >= now - 7 * DAY_MS && d.getTime() <= now + RENEWAL_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => a.getTime() - b.getTime());
  const openExpansionAmount = expansion.reduce((sum, d) => sum + parseAmount(d.amount), 0);

  // ── 2. Engagement / frialdad ───────────────────────────────────────────────
  // SOLO cuenta el PASADO: el timeline de HubSpot trae reuniones AGENDADAS (ts
  // futuro) y hay FirefliesSessions con fecha corrupta (2037+, anomalía conocida
  // del sync) — una "última actividad" futura rompería la señal de frialdad.
  let lastEngagementAt: Date | null = null;
  let engagements90d = 0;
  let engagementItems: { type: string; title: string; date: string | null; ts: number }[] = [];
  try {
    const items = (await fetchCompanyTimelineItems(hs, client.hubspotCompanyId)).filter(
      (i) => i.ts <= now,
    );
    engagementItems = items.map((i) => ({ type: i.type, title: i.title, date: i.date, ts: i.ts }));
    const latest = items[0]?.ts;
    if (latest) lastEngagementAt = new Date(latest);
    engagements90d = items.filter((i) => i.ts >= now - 90 * DAY_MS).length;
  } catch (e) {
    errors.push(`engagement: ${e instanceof Error ? e.message : "error"}`);
  }
  // Complemento: la última sesión REAL del cliente (Meet/Fireflies) — reuniones
  // que no pasan por HubSpot no deben marcar al cliente como "frío".
  try {
    const lastSession = await prisma.firefliesSession.findFirst({
      where: {
        OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }],
        date: { lte: new Date(now) },
      },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (lastSession && (!lastEngagementAt || lastSession.date > lastEngagementAt)) {
      lastEngagementAt = lastSession.date;
    }
  } catch (e) {
    errors.push(`sessions: ${e instanceof Error ? e.message : "error"}`);
  }

  // ── 3. Tickets (degradación de scope) ──────────────────────────────────────
  let ticketsSupported = false;
  let openTicketCount = 0;
  let ticketsJson: Prisma.InputJsonValue = { supported: false, open: [], recent: [] };
  try {
    const t = await fetchCompanyTickets(hs, client.hubspotCompanyId);
    ticketsSupported = t.supported;
    const openTickets = t.tickets.filter((x) => !x.closedAt);
    openTicketCount = openTickets.length;
    ticketsJson = {
      supported: t.supported,
      open: openTickets.slice(0, 20) as unknown as Prisma.InputJsonValue,
      recent: t.tickets.slice(0, 20) as unknown as Prisma.InputJsonValue,
    };
  } catch (e) {
    errors.push(`tickets: ${e instanceof Error ? e.message : "error"}`);
  }

  const fetchStatus: "ok" | "partial" | "error" =
    errors.length === 0 ? "ok" : errors.length >= 3 ? "error" : "partial";

  await prisma.clientCsSignals.upsert({
    where: { clientId },
    create: {
      clientId,
      fetchedAt: new Date(),
      fetchStatus,
      errors: errors.length ? errors : undefined,
      deals: {
        open: open as unknown as Prisma.InputJsonValue,
        renewals: renewals as unknown as Prisma.InputJsonValue,
        expansion: expansion as unknown as Prisma.InputJsonValue,
      },
      engagement: {
        lastAt: lastEngagementAt?.toISOString() ?? null,
        count90d: engagements90d,
        lastItems: engagementItems.slice(0, 10) as unknown as Prisma.InputJsonValue,
      },
      tickets: ticketsJson,
      lastEngagementAt,
      engagements90d,
      openTicketCount,
      ticketsSupported,
      nextRenewalCloseAt: upcomingRenewalDates[0] ?? null,
      openExpansionAmount,
      openDealCount: open.length,
    },
    update: {
      fetchedAt: new Date(),
      fetchStatus,
      errors: errors.length ? errors : Prisma.DbNull,
      deals: {
        open: open as unknown as Prisma.InputJsonValue,
        renewals: renewals as unknown as Prisma.InputJsonValue,
        expansion: expansion as unknown as Prisma.InputJsonValue,
      },
      engagement: {
        lastAt: lastEngagementAt?.toISOString() ?? null,
        count90d: engagements90d,
        lastItems: engagementItems.slice(0, 10) as unknown as Prisma.InputJsonValue,
      },
      tickets: ticketsJson,
      lastEngagementAt,
      engagements90d,
      openTicketCount,
      ticketsSupported,
      nextRenewalCloseAt: upcomingRenewalDates[0] ?? null,
      openExpansionAmount,
      openDealCount: open.length,
    },
  });

  return { clientId, fetchStatus, errors };
}

export interface RefreshAllResult {
  refreshed: ClientSignalsSummary[];
  skippedFresh: number;
  skippedNoCompany: number;
  failed: { clientId: string; error: string }[];
}

/** Refresca las señales de TODOS los clientes reales (no prospectos) con company
 *  de HubSpot. Secuencial con pausa (rate limits); salta snapshots más frescos
 *  que `maxAgeHours` salvo `force`. */
export async function refreshAllCsSignals(
  opts: { maxAgeHours?: number; force?: boolean } = {},
): Promise<RefreshAllResult> {
  const maxAgeHours = opts.maxAgeHours ?? 20;
  const clients = await prisma.client.findMany({
    where: { isProspect: false, hubspotCompanyId: { not: null } },
    select: { id: true, csSignals: { select: { fetchedAt: true } } },
    orderBy: { name: "asc" },
  });

  const result: RefreshAllResult = { refreshed: [], skippedFresh: 0, skippedNoCompany: 0, failed: [] };
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

  for (const c of clients) {
    if (!opts.force && c.csSignals && c.csSignals.fetchedAt.getTime() > cutoff) {
      result.skippedFresh++;
      continue;
    }
    try {
      result.refreshed.push(await computeClientSignals(c.id));
    } catch (e) {
      result.failed.push({ clientId: c.id, error: e instanceof Error ? e.message : "error" });
    }
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_CLIENTS_MS));
  }
  return result;
}
