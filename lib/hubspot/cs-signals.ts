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
import { fetchCompanyContacts, type ContactoDeEmpresa } from "./company-contacts";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";

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

/** Un ítem del registro de actividad tal como lo guarda la copia (`engagement.lastItems`). */
type ItemDeActividad = { type: string; title: string; date: string | null; ts: number; resumen: string };

/** Lo que guardó la última copia de señales y se conserva cuando una lectura de HubSpot FALLA. */
interface CopiaAnterior {
  contactos: ContactoDeEmpresa[];
  lastEngagementAt: Date | null;
  engagements90d: number;
  engagementItems: ItemDeActividad[];
  ticketsSupported: boolean;
  openTicketCount: number;
  ticketsJson: Prisma.InputJsonValue | null;
}

/**
 * La última copia de señales. Se usa cuando la lectura de HubSpot falla, para no pisar a las personas
 * con una lista vacía, los tickets abiertos con un cero ni la última actividad con «nunca» (el cliente
 * se vería frío). Si tampoco se puede leer la copia (o no hay), null: se escribe lo poco que se sabe
 * (la escritura de abajo va a la misma base y fallaría igual).
 */
async function leerCopiaAnterior(clientId: string): Promise<CopiaAnterior | null> {
  try {
    const previa = await prisma.clientCsSignals.findUnique({
      where: { clientId },
      select: {
        engagement: true,
        tickets: true,
        lastEngagementAt: true,
        engagements90d: true,
        openTicketCount: true,
        ticketsSupported: true,
      },
    });
    if (!previa) return null;
    const eng = (previa.engagement ?? null) as { contactos?: unknown; lastItems?: unknown } | null;
    const personas = eng?.contactos;
    const items = eng?.lastItems;
    const ultima = previa.lastEngagementAt ? new Date(previa.lastEngagementAt) : null;
    return {
      contactos: Array.isArray(personas) ? (personas as ContactoDeEmpresa[]) : [],
      lastEngagementAt: ultima && !isNaN(ultima.getTime()) ? ultima : null,
      engagements90d: previa.engagements90d ?? 0,
      engagementItems: Array.isArray(items) ? (items as ItemDeActividad[]) : [],
      ticketsSupported: previa.ticketsSupported ?? false,
      openTicketCount: previa.openTicketCount ?? 0,
      ticketsJson:
        previa.tickets && typeof previa.tickets === "object" ? (previa.tickets as unknown as Prisma.InputJsonValue) : null,
    };
  } catch {
    return null;
  }
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
  // La copia anterior se lee UNA vez y solo si alguna lectura de HubSpot falla.
  let copia: Promise<CopiaAnterior | null> | undefined;
  const copiaAnterior = () => (copia ??= leerCopiaAnterior(clientId));

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
  // `resumen`: las primeras líneas de la nota o llamada (2026-10-04). Las lee el agente vigía: el
  // registro de la empresa en HubSpot cuenta cosas que no pasan por las reuniones de Nexus.
  let engagementItems: ItemDeActividad[] = [];
  try {
    const items = (await fetchCompanyTimelineItems(hs, client.hubspotCompanyId)).filter(
      (i) => i.ts <= now,
    );
    engagementItems = items.map((i) => ({ type: i.type, title: i.title, date: i.date, ts: i.ts, resumen: i.body.slice(0, 280) }));
    const latest = items[0]?.ts;
    if (latest) lastEngagementAt = new Date(latest);
    engagements90d = items.filter((i) => i.ts >= now - 90 * DAY_MS).length;
  } catch (e) {
    // ⛔ El registro de HubSpot FALLÓ (fetchCompanyTimelineItems lanza ante un 500, un 429 o la red):
    // se conserva la última actividad de la copia anterior. Escribir «nunca» haría ver frío al cliente.
    errors.push(`engagement: ${e instanceof Error ? e.message : "error"}`);
    const previa = await copiaAnterior();
    if (previa) {
      lastEngagementAt = previa.lastEngagementAt;
      engagements90d = previa.engagements90d;
      engagementItems = previa.engagementItems;
    }
  }
  // Complemento: la última sesión REAL del cliente (Meet/Fireflies) — reuniones
  // que no pasan por HubSpot no deben marcar al cliente como "frío".
  try {
    const lastSession = await prisma.firefliesSession.findFirst({
      where: {
        ...whereBelongsToClient(clientId),
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

  // ── 2b. Contactos de la empresa (2026-10-04) ──────────────────────────────
  // Quiénes son y cuándo se habló con cada uno: el agente vigía nota si el sponsor dejó de aparecer.
  // Van DENTRO de `engagement` (Json que ya existe): una columna nueva sería DDL por un dato que
  // solo lee el agente.
  // ⛔ Si la lectura FALLA (fetchCompanyContacts lanza ante un 500, un 429 o la red) se conservan los
  // de la copia anterior: escribir una lista vacía le diría al vigía que el sponsor dejó de aparecer.
  let contactos: ContactoDeEmpresa[] = [];
  try {
    const c = await fetchCompanyContacts(hs, client.hubspotCompanyId);
    contactos = c.contactos;
  } catch (e) {
    errors.push(`contactos: ${e instanceof Error ? e.message : "error"}`);
    contactos = (await copiaAnterior())?.contactos ?? [];
  }

  // ── 3. Tickets (degradación de scope) ──────────────────────────────────────
  // 403 = sin permiso → `supported: false` (no es error). ⛔ Si la lectura FALLA (fetchCompanyTickets
  // lanza ante un 500, un 429 o la red) se conservan los de la copia anterior: escribir «0 abiertos»
  // haría ver tranquilo a un cliente con fricción.
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
    const previa = await copiaAnterior();
    if (previa) {
      ticketsSupported = previa.ticketsSupported;
      openTicketCount = previa.openTicketCount;
      if (previa.ticketsJson) ticketsJson = previa.ticketsJson;
    }
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
        contactos: contactos as unknown as Prisma.InputJsonValue,
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
        contactos: contactos as unknown as Prisma.InputJsonValue,
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
    where: { ...CS_CLIENT_WHERE, hubspotCompanyId: { not: null } },
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
