import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import SessionsClient from "./SessionsClient";
import {
  categorizeSessions,
  buildInternalDomainsSet,
  collectExternalDomains,
  computeAmbiguousNameTokens,
  type SessionGroup,
} from "@/lib/sessions/categorize";
import { cachedSearchCompaniesByDomains } from "@/lib/hubspot/companies";
import { getTeamMembers } from "@/lib/cache/team";
import { getSessionCategories } from "@/lib/cache/session-categories";

// ISR: re-validamos cada 30s. Mutaciones críticas pueden llamar revalidatePath("/sessions")
// si necesitan reflejarse inmediato.
// Render dinámico — depende de cookies de Supabase Auth (vía AppShell).
// Antes era ISR (revalidate = 30) cuando la sesión no dependía de cookies.
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  // ── 1. Cargar data base ────────────────────────────────────────────────────
  // Traemos TODAS las sesiones (incluso sin transcript) para mostrar empresas
  // con conteo total. La query secundaria nos dice cuáles tienen transcript
  // para construir el `hasTranscript` flag por sesión sin traer el blob.
  // teamMembers + categories vienen del cache (cambian poco, TTL 10 min).
  // sessions/transcriptIds/clients son live para reflejar cambios al instante.
  const now = new Date();
  const [sessions, transcriptIds, minutes, sessionProjectLinks, clientsWithActiveProjects, clients, teamMembers, categories] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { date: { lt: now } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        date: true,
        duration: true,
        participants: true,
        source: true,
        summary: true,
        enrichedAt: true,
        manualClientId: true,
      },
    }),
    prisma.firefliesSession.findMany({
      where: { date: { lt: now }, transcript: { not: null } },
      select: { id: true },
    }),
    prisma.sessionMinute.findMany({
      select: { sessionId: true, status: true },
    }),
    // F3-D: cuántos proyectos tiene asignados cada sesión (para badge "Sin proyecto")
    prisma.sessionProject.findMany({
      select: { sessionId: true },
    }),
    // F3-D fix: clientes que tienen al menos 1 proyecto activo (para distinguir
    // "sesión huérfana de proyecto pero el cliente tiene proyectos" vs
    // "cliente sin proyectos en general — no es culpa de la sesión").
    prisma.project.findMany({
      where: { status: "active", serviceType: { not: "__strategy__" } },
      select: { clientId: true },
      distinct: ["clientId"],
    }),
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true },
    }),
    getTeamMembers(),       // cacheado
    getSessionCategories(), // cacheado
  ]);

  // Set para lookup O(1) — ¿esta sesión tiene transcript?
  const withTranscriptSet = new Set(transcriptIds.map((t) => t.id));
  // Map sessionId → MinuteStatus para mostrar badge en sidebar
  const minuteStatusBySessionId = new Map(minutes.map((m) => [m.sessionId, m.status]));
  // F3-D: set de sesiones que ya tienen al menos un proyecto asignado
  const sessionsWithProject = new Set(sessionProjectLinks.map((l) => l.sessionId));
  // F3-D fix: clientes que tienen proyectos activos (para mostrar badge solo
  // cuando realmente es una sesión huérfana — no cuando el cliente no tiene proyectos)
  const clientsWithProjectsSet = new Set(clientsWithActiveProjects.map((p) => p.clientId));

  // ── 2. Pre-cálculos para categorización ────────────────────────────────────
  const internalDomains = buildInternalDomainsSet(categories);
  const externalDomains = collectExternalDomains(sessions, internalDomains);

  // ── 3. Lookup en HubSpot Companies por dominio (una sola llamada batched) ──
  // Si falla, seguimos con cache vacío — las sesiones caerán a "orphan" o
  // matcheen por otras vías. No bloqueamos la página por un error de HubSpot.
  let hubspotCompaniesByDomain = new Map();
  if (externalDomains.length > 0) {
    try {
      hubspotCompaniesByDomain = await cachedSearchCompaniesByDomains(externalDomains);
    } catch (err) {
      console.error(
        "[sessions/page] Error buscando companies en HubSpot, continuando sin enriquecimiento:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── 4. Lookup team member por email para identificar internos del equipo ──
  const memberByEmail = new Map(teamMembers.map((m) => [m.email.toLowerCase(), m]));

  // ── 5. Categorizar todas las sesiones ──────────────────────────────────────
  // Señal fuerte: company de HubSpot ligada → Client (paso 5), consistente con la
  // materialización `resolvedClientId`. Sin esto, /sessions agruparía esas sesiones
  // como "hubspotCompany" en vez de bajo el cliente.
  const clientsByHubspotCompanyId = new Map(
    clients
      .filter((c) => c.hubspotCompanyId)
      .map((c) => [c.hubspotCompanyId as string, { id: c.id, name: c.name, company: c.company }]),
  );
  const categorized = categorizeSessions(sessions, {
    clients,
    categories,
    hubspotCompaniesByDomain,
    internalDomains,
    clientsByHubspotCompanyId,
    groupUnlinkedHubspotCompany: true, // /sessions agrupa las empresas-HubSpot no-cliente
    ambiguousNameTokens: computeAmbiguousNameTokens(clients),
  });

  // ── 6. Enriquecer con team members + group ─────────────────────────────────
  const sessionsWithMeta = categorized.map((s) => {
    const matchedMembers = s.participants
      .map((email) => memberByEmail.get(email.toLowerCase()))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    const roles = [...new Set(matchedMembers.map((m) => m.area).filter(Boolean))] as string[];

    return {
      id: s.id,
      title: s.title,
      date: s.date.toISOString(),
      duration: s.duration,
      participants: s.participants,
      source: s.source,
      hasTranscript: withTranscriptSet.has(s.id),
      summary: s.summary as { keywords?: string[]; overview?: string; action_items?: string[] } | null,
      enrichedAt: s.enrichedAt?.toISOString() ?? null,
      manualClientId: s.manualClientId,
      group: s.group,
      // Legacy fields conservados para compatibilidad con la UI actual mientras refactor:
      clientId: s.group.kind === "client" ? s.group.id : null,
      teamMembers: matchedMembers.map((m) => ({ name: m.name, email: m.email, role: m.area })),
      teamRoles: roles,
      // F1: status de la minuta post-sesión (DRAFT/REVIEWED/EDITED) o null si nunca se generó
      minuteStatus: minuteStatusBySessionId.get(s.id) ?? null,
      // F3-D: ¿tiene proyecto asignado? (para badge "Sin proyecto" cuando está
      // matched a un cliente pero sin SessionProject row)
      hasProjectAssigned: sessionsWithProject.has(s.id),
      // F3-D fix: ¿el cliente matched tiene proyectos activos disponibles?
      // Si no, no mostramos badge "Sin proyecto" (no es accionable — el cliente
      // simplemente no tiene proyectos abiertos).
      clientHasActiveProjects:
        s.group.kind === "client" ? clientsWithProjectsSet.has(s.group.id) : false,
    };
  });

  // ── 7. Empresas HubSpot únicas (para sidebar) ──────────────────────────────
  const hubspotCompanies = [...hubspotCompaniesByDomain.values()];

  // ── 8. Preparar teamMembers ligeros para el panel de análisis ─────────────
  // Solo email + role — los necesita AnalysisPanel para el filtro multi-select
  // de roles (Sales/CSE/PM/etc).
  const teamMembersLite = teamMembers.map((m) => ({ email: m.email, role: m.area }));

  return (
    <SessionsClient
      sessions={sessionsWithMeta}
      clients={clients}
      categories={categories}
      hubspotCompanies={hubspotCompanies}
      teamMembers={teamMembersLite}
    />
  );
}

// Re-export para que SessionsClient pueda tipear sus props
export type { SessionGroup };
