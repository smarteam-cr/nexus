import { redirect } from "next/navigation";
import Link from "next/link";
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
import { accessibleClientWhere, sharedClientIdsFor } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import ClientsGrid, { type ClientRow } from "./ClientsGrid";

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
  const roleEnum = user.teamMember?.roleEnum;
  // Acceso al área de Ventas (Business Cases) — mismo gate que /business-cases (ventas.read).
  const canSeeSales = user.teamMember ? await can(user.teamMember, "ventas", "read") : false;
  const activeCse = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: roleEnum ?? "Miembro",
    isSuperAdmin: roleEnum === "SUPER_ADMIN",
    // Permiso EFECTIVO "ve todo" (default VENTAS/DEV/CSL/MARKETING/SA) → el índice
    // abre en "Todos" y reordena las pestañas. CSE (sin el permiso) queda igual que siempre.
    canSeeAll: user.teamMember ? await can(user.teamMember, "clientes", "viewAll") : false,
  };

  // Filtro de acceso server-side: CSE ve solo sus clientes (owner) + compartidos;
  // roles con visibilidad total → null (sin filtro). Ya no es cosmético en el browser.
  // sharedIds = los compartidos con él (GRANT) → alimenta la pestaña "Compartidos conmigo".
  const [clientWhere, sharedIds] = await Promise.all([
    accessibleClientWhere(user),
    sharedClientIdsFor(user),
  ]);

  const [clients, teamMembers] = await Promise.all([
    prisma.client.findMany({
      where: clientWhere ?? undefined,
      orderBy: { createdAt: "desc" }, // fallback secundario; el orden real se aplica abajo
      select: {
        id: true,
        name: true,
        company: true,
        emailDomains: true,
        createdAt: true,
        projects: { select: { hubspotOwnerName: true, hubspotOwnerEmail: true } },
        _count: { select: { projects: true } },
      },
    }),
    getTeamMembers(),
  ]);

  const clientIds = clients.map((c) => c.id);

  // Fechas de última reunión ventas/CSE + actividad (pasado/futuro) por cliente.
  // Ambos usan el match materializado FirefliesSession.resolvedClientId — queries
  // chicas e indexadas, no se cargan las ~16k sesiones en cada render.
  const [meetingDates, activityMap] = await Promise.all([
    computeLastMeetingDates({ clientIds, teamMembers }),
    computeClientActivityMap(clients),
  ]);

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
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      createdAt: c.createdAt.toISOString(),
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
      isShared: sharedIds.has(c.id),
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
      <div className="px-6 py-8">
        <PageHeader
          title="Clientes"
          description={
            rows.length === 0
              ? "Sin clientes aún"
              : `${rows.length} cliente${rows.length !== 1 ? "s" : ""}`
          }
          action={
            canSeeSales ? (
              <Link
                href="/business-cases"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 3 3 5-6" />
                </svg>
                Business cases
              </Link>
            ) : undefined
          }
        />

        <ClientsGrid clients={rows} activeCse={activeCse} />
      </div>
    </AppShell>
  );
}
