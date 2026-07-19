import { prisma } from "@/lib/db/prisma";
import { getTeamMembers } from "@/lib/cache/team";
import { computeLastMeetingDates } from "@/lib/clients/meeting-dates";
import { computeClientActivityMap } from "@/lib/clients/last-interaction";
import type { requireUser } from "@/lib/auth/supabase";
import { SkeletonTabs, TableSkeleton } from "@/components/ui";
import ClientsGrid, { type ClientRow, type ActiveCse } from "./ClientsGrid";

/**
 * La ZONA LENTA de /clients — server component async que corre las queries pesadas
 * (clients + team + meeting-dates + actividad) dentro de un <Suspense> propio.
 *
 * Por qué el split ("push dynamic access down", patrón oficial de Next.js): el rol se
 * resuelve al toque en page.tsx (solo auth), así que el shell y el FALLBACK correcto
 * por rol pintan de inmediato — un loading.tsx estático no puede saber el rol (no lee
 * cookies) y reservaba la fila de pills que un SUPER_ADMIN nunca ve: su tabla real
 * arrancaba 32px más arriba que el skeleton.
 */

type User = Awaited<ReturnType<typeof requireUser>>;

export async function ClientsTable({
  user,
  activeCse,
  clientWhere,
  sharedIds,
}: {
  user: User;
  activeCse: ActiveCse;
  clientWhere: NonNullable<Parameters<typeof prisma.client.findMany>[0]>["where"] | null;
  sharedIds: Set<string>;
}) {
  void user; // la identidad ya gateó en page.tsx; acá solo se consumen sus derivados

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

  return <ClientsGrid clients={rows} activeCse={activeCse} />;
}

/**
 * Fallback de la zona — lo elige page.tsx, que YA sabe el rol: con pills para quien
 * las ve (CSE), sin pills para SUPER_ADMIN. Misma cáscara que ClientsGrid
 * (`space-y-3` + pills + tabla con toolbar de buscador y 2 acciones).
 * loading.tsx lo reusa con la variante mayoritaria (pills) para la ventana pre-auth.
 */
export function ClientsTableZoneSkeleton({ showPills }: { showPills: boolean }) {
  return (
    <div className="space-y-3">
      {showPills && <SkeletonTabs count={3} variant="pill" className="gap-1.5 flex-wrap" />}
      {/* Cliente · Última actividad · Próxima reunión · CSE · Reunión ventas · Sesión CSE · Proyectos · acciones */}
      <TableSkeleton columns={8} rows={9} toolbar toolbarActions={2} />
    </div>
  );
}
