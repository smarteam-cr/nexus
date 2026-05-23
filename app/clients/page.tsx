import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { getTeamMembers } from "@/lib/cache/team";
import { computeLastMeetingDates } from "@/lib/clients/meeting-dates";
import ClientsGrid, { type ClientRow } from "./ClientsGrid";
import ICPSection from "./ICPSection";

// ISR 60s — la página cruza sesiones × equipo para las fechas de reunión;
// no es necesario recalcular en cada request.
export const revalidate = 60;

export default async function ClientsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const now = new Date();

  const [clients, sessions, categories, teamMembers] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        company: true,
        emailDomains: true,
        hubspotCompanyId: true,
        createdAt: true,
        hubspotAccount: { select: { hubName: true } },
        projects: { select: { hubspotOwnerName: true } },
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

  // Fechas de última reunión (ventas / CSE) calculadas en memoria — sin schema nuevo.
  const meetingDates = computeLastMeetingDates({ sessions, clients, categories, teamMembers });

  const rows: ClientRow[] = clients.map((c) => {
    const md = meetingDates.get(c.id);
    const cseNames = [
      ...new Set(
        c.projects
          .map((p) => p.hubspotOwnerName)
          .filter((n): n is string => !!n && n.trim().length > 0)
      ),
    ];
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      createdAt: c.createdAt.toISOString(),
      hasHubspot: !!c.hubspotAccount || !!c.hubspotCompanyId,
      cseNames,
      lastSalesMeeting: md?.sales ? md.sales.toISOString() : null,
      lastCseMeeting: md?.cse ? md.cse.toISOString() : null,
      projectCount: c._count.projects,
    };
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

        <ClientsGrid clients={rows} />
        <ICPSection />
      </div>
    </AppShell>
  );
}
