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
import { resolvePartnerState, type PartnerState } from "@/lib/cs/partner-state";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { cargarCuentas, hoyEnCostaRica, ultimoContactoDeUnCliente } from "./cartera";
import { alertaDeLaCuenta, motivosDeLaCuenta, type CuentaDeCartera, type Motivo } from "./cartera-reglas";
import { estadoDeLaCuenta, type Lectura } from "./ficha-reglas";
import { leerPartner } from "./lectura-partner";
import { leerResultadosDelHandoff, porValidar, sinConfirmar, sinDato } from "@/lib/handoff/resultados-medibles";
import type { SemanaDeUso } from "./adopcion";

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
  fetchStatus: string; // "ok" | "partial" (corrida degradada sin asociaciones)
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
  portalLink: string | null; // hs_account_link — deep-link al portal del cliente en HubSpot
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
  partner: AccountPartner | null; // null = sin snapshot; la CAUSA la dice partnerState
  /** Por qué partner viene null (o "ok" si hay datos) — ver lib/cs/partner-state.ts.
   *  La UI muestra el mensaje de la causa REAL en vez del texto ambiguo de antes. */
  partnerState: PartnerState;
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
  /**
   * La ficha rediseñada (2026-10-04) lee la MISMA cuenta armada que el índice de la CSL
   * (`lib/cs/cartera.ts`): sus motivos, su estado y la lectura completa de Partner Clients.
   * `partner` (arriba) se queda con su forma vieja porque lo lee el resumen citado.
   */
  hoy: string;
  cuenta: CuentaDeCartera;
  motivos: Motivo[];
  estado: Lectura[];
  /** Las personas del cliente en HubSpot (copia de señales). */
  contactos: Array<{ nombre: string; cargo: string | null; email: string | null; ultimoContacto: string | null }>;
  resultados: Array<{
    proyecto: string;
    id: string;
    resultado: string;
    metrica: string;
    /** "" = sin línea base (falta pedírsela al cliente). */
    lineaBase: string;
    meta: string;
    plazo: string;
    quienLoNecesita: string | null;
    retos: string[];
    porValidar: boolean;
    confirmado: boolean;
  }>;
  /**
   * El uso semanal de HubSpot Partner, de la semana más vieja a la más nueva (hasta 13 semanas;
   * la pestaña Adopción lo grafica). Vacío sin acceso a partner o si la copia diaria no corrió:
   * cada corrida guarda la foto de su semana.
   */
  historialDeUso: SemanaDeUso[];
  /** Las desviaciones del plan que movieron fechas (particularidades confirmadas), la más nueva primero. */
  desvios: Array<{ proyecto: string; titulo: string; quien: string; semanas: number; fecha: string }>;
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

  const [projects, alerts, partner, brief, csSignals, anySnapshotCount, syncStatusRow, minuteSessions, historial] = await Promise.all([
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
    // Para distinguir las TRES causas de "sin datos de partner" (no_scope /
    // never_synced / no_match) en vez del mensaje ambiguo de antes:
    includePartner ? prisma.clientPartnerSnapshot.count() : Promise.resolve(0),
    includePartner
      ? prisma.cronJobState.findUnique({ where: { id: "cs-partner-sync-status" }, select: { lastResult: true } })
      : Promise.resolve(null),
    prisma.firefliesSession.findMany({
      where: {
        ...whereBelongsToClient(clientId),
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
    // El uso semanal (confidencial como el resto de partner: solo con acceso).
    includePartner
      ? prisma.partnerUsageSnapshot.findMany({
          where: { clientId },
          orderBy: { weekKey: "desc" },
          take: 13,
          select: { weekKey: true, uusScore: true, marketingScore: true, salesScore: true, serviceScore: true },
        })
      : Promise.resolve([]),
  ]);

  const projectIds = projects.map((p) => p.projectId);
  const ops = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true, hubspotPriority: true, hubspotStatus: true,
      hubspotBlockReason: true, hubspotBlockDetail: true, hubspotAdoptionState: true,
      name: true, handoffResultados: true,
    },
  });
  // Los resultados que el cliente necesita alcanzar, por proyecto (salen del handoff).
  const resultados = ops.flatMap((o) =>
    (leerResultadosDelHandoff(o.handoffResultados)?.resultados ?? []).map((r) => ({
      proyecto: o.name,
      id: r.id,
      resultado: r.resultado,
      metrica: r.metrica,
      lineaBase: sinDato(r.lineaBase) ? "" : r.lineaBase,
      meta: r.meta,
      plazo: r.plazo,
      quienLoNecesita: r.quienLoNecesita ?? null,
      retos: r.retos ?? [],
      porValidar: porValidar(r),
      confirmado: !sinConfirmar(r),
    })),
  );
  // Por qué se movió el plan: las desviaciones confirmadas que corrieron fechas.
  const particularidades = await prisma.particularidad.findMany({
    where: { timeline: { projectId: { in: projectIds } }, needsValidation: false, weeksImpact: { gt: 0 } },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: { title: true, party: true, weeksImpact: true, occurredAt: true, timeline: { select: { project: { select: { name: true } } } } },
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

  // La cuenta armada como en el índice. Si no entra a la cartera (sin proyecto activo ni
  // suscripción activa), igual se arma con lo que haya: la ficha no puede quedar vacía. Las alertas
  // ya están cargadas arriba y se leen con la misma regla del índice: con una lista vacía, la ficha
  // decía «Ninguna alerta abierta» de una cuenta que sí las tenía.
  const hoy = hoyEnCostaRica();
  const [armada] = await cargarCuentas(clientWhere, { clientIds: [clientId], filas: projects }).catch(() => []);
  /* El último contacto de la de respaldo sale de la MISMA regla que el índice (reuniones con el
     cliente o HubSpot). Con solo HubSpot, una cuenta fuera de la cartera con una reunión la semana
     pasada decía «Sin contacto registrado» (D16). Si la lectura falla, queda HubSpot. */
  const ultimoHubspot = csSignals?.lastEngagementAt ?? null;
  const ultimoContactoDeRespaldo = armada
    ? null
    : await ultimoContactoDeUnCliente(clientId, ultimoHubspot).catch(() => ultimoHubspot?.toISOString() ?? null);
  const cuenta: CuentaDeCartera = armada ?? {
    clientId,
    nombre: client.company || client.name,
    partner: includePartner && partner ? leerPartner(partner.properties) : null,
    proyectos: [],
    ultimoContacto: ultimoContactoDeRespaldo,
    ticketsAbiertos: csSignals?.ticketsSupported ? csSignals.openTicketCount : null,
    alertas: alerts.map(alertaDeLaCuenta),
    facturacion: null,
    licenciasManuales: [],
  };
  if (!includePartner) cuenta.partner = null;
  const engagement = (csSignals?.engagement ?? null) as { contactos?: unknown } | null;
  const contactos = asArray<{ nombre?: string; cargo?: string | null; email?: string | null; ultimoContacto?: string | null }>(engagement?.contactos).map((c) => ({
    nombre: c.nombre ?? "Sin nombre",
    cargo: c.cargo ?? null,
    email: c.email ?? null,
    ultimoContacto: c.ultimoContacto ?? null,
  }));

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
          fetchStatus: partner.fetchStatus,
          uusScore: partner.uusScore,
          uusTrend: partner.uusTrend,
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
          portalLink: partner.portalLink,
        }
      : null,
    partnerState: resolvePartnerState({
      hasSnapshot: !!partner,
      anySnapshots: anySnapshotCount > 0,
      lastSync: (() => {
        const lr = (syncStatusRow?.lastResult ?? null) as { supported?: boolean } | null;
        return lr && typeof lr.supported === "boolean" ? { supported: lr.supported } : null;
      })(),
    }),
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
    hoy,
    cuenta,
    motivos: motivosDeLaCuenta(cuenta, hoy),
    estado: estadoDeLaCuenta(cuenta, hoy),
    contactos,
    resultados,
    historialDeUso: [...historial].reverse().map((h) => ({
      semana: h.weekKey,
      uso: h.uusScore,
      // El historial guarda Marketing, Sales y Service: Commerce no tiene columna semanal.
      porHub: { marketing: h.marketingScore, sales: h.salesScore, service: h.serviceScore },
    })),
    desvios: particularidades.map((x) => ({
      proyecto: x.timeline.project.name,
      titulo: x.title,
      quien: x.party,
      semanas: x.weeksImpact ?? 0,
      fecha: x.occurredAt.toISOString(),
    })),
  };
}
