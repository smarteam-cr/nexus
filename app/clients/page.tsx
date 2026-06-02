import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { getTeamMembers } from "@/lib/cache/team";
import { computeLastMeetingDates } from "@/lib/clients/meeting-dates";
import { computeClientActivityMap } from "@/lib/clients/last-interaction";
import {
  requireUser,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/supabase";
import ClientsGrid, { type ClientRow } from "./ClientsGrid";
import ICPSection from "./ICPSection";

// Render dinámico — la página depende del usuario logueado (sesión Supabase
// vía cookies), así que no puede cachearse con ISR como antes.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  // Identidad del usuario logueado (Supabase Auth + AppUser).
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/");
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  // Shape compatible con el viejo ActiveCse para el ClientsGrid client component.
  const activeCse = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: user.teamMember?.roleEnum ?? "Miembro",
    isSuperAdmin: user.teamMember?.roleEnum === "SUPER_ADMIN",
  };

  const now = new Date();

  const [clients, sessions, categories, teamMembers] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: "desc" }, // fallback secundario; el orden real se aplica abajo
      select: {
        id: true,
        name: true,
        company: true,
        emailDomains: true,
        hubspotCompanyId: true,
        createdAt: true,
        hubspotAccount: { select: { hubName: true } },
        projects: { select: { hubspotOwnerName: true, hubspotOwnerEmail: true } },
        _count: { select: { projects: true } },
      },
    }),
    prisma.firefliesSession.findMany({
      where: { date: { lt: now } },
      orderBy: { date: "desc" },
      select: { date: true, participants: true, manualClientId: true, title: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
    getTeamMembers(),
  ]);

  // Fechas de última reunión (ventas / CSE) — separadas, para mostrar en columnas.
  const meetingDates = computeLastMeetingDates({ sessions, clients, categories, teamMembers });

  // Actividad por cliente: lastActivity (pasado) + nextMeeting (futuro).
  // Cada uno se muestra en su propia columna y el orden se hace por lastActivity.
  const activityMap = await computeClientActivityMap(clients);

  const rows: ClientRow[] = clients.map((c) => {
    const md = meetingDates.get(c.id);
    const activity = activityMap.get(c.id);
    const cseNames = [
      ...new Set(
        c.projects
          .map((p) => p.hubspotOwnerName)
          .filter((n): n is string => !!n && n.trim().length > 0)
      ),
    ];
    const cseEmails = [
      ...new Set(
        c.projects
          .map((p) => p.hubspotOwnerEmail)
          .filter((e): e is string => !!e && e.trim().length > 0)
          .map((e) => e.toLowerCase())
      ),
    ];
    // Estado HubSpot — distingue:
    //   - "connected_account": cliente conectó SU portal HubSpot a Nexus (OAuth) — caso raro
    //   - "in_crm": cliente existe como Company en el portal HubSpot de Smarteam — caso común
    //   - "none": ninguno
    const hubspotStatus: "connected_account" | "in_crm" | "none" = c.hubspotAccount
      ? "connected_account"
      : c.hubspotCompanyId
      ? "in_crm"
      : "none";

    return {
      id: c.id,
      name: c.name,
      company: c.company,
      createdAt: c.createdAt.toISOString(),
      hubspotStatus,
      cseNames,
      cseEmails,
      lastSalesMeeting: md?.sales ? md.sales.toISOString() : null,
      lastCseMeeting: md?.cse ? md.cse.toISOString() : null,
      // Última actividad pasada (sesión, nota, agent run)
      lastActivityAt: activity?.lastActivity?.date.toISOString() ?? null,
      lastActivitySource: activity?.lastActivity?.source ?? null,
      lastActivityLabel: activity?.lastActivity?.label ?? null,
      // Próxima reunión agendada (futura)
      nextMeetingAt: activity?.nextMeeting?.date.toISOString() ?? null,
      nextMeetingLabel: activity?.nextMeeting?.label ?? null,
      projectCount: c._count.projects,
    };
  });

  // Ordenar por última actividad PASADA DESC. Los clientes sin actividad pasada
  // van al final (ordenados entre sí por createdAt DESC).
  rows.sort((a, b) => {
    const aDate = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bDate = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    if (aDate !== bDate) return bDate - aDate;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <PageHeader
          title="Clientes"
          description={
            rows.length === 0
              ? "Sin clientes aún"
              : `${rows.length} cliente${rows.length !== 1 ? "s" : ""}`
          }
        />

        <ClientsGrid clients={rows} activeCse={activeCse} />
        <ICPSection />
      </div>
    </AppShell>
  );
}
