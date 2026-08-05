import { prisma } from "@/lib/db/prisma";
import { getTeamMembers } from "@/lib/cache/team";
import { computeLastMeetingDates } from "@/lib/clients/meeting-dates";
import { computeClientActivityMap } from "@/lib/clients/last-interaction";
import { resumirProyectos } from "@/lib/clients/resumen-proyectos";
import {
  proyectosInternosDe,
  ordenarProyectosInternos,
  type ProyectoInternoRow,
} from "@/lib/clients/proyectos-internos";
import type { requireUser } from "@/lib/auth/supabase";
import { Skeleton, SkeletonTabs, TableSkeleton } from "@/components/ui";
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
        kind: true,
        tamUsd: true,
        /**
         * ⚠ SIN `where`. La barra de filtros del índice se calcula sobre ESTE array: acotarlo
         * "para aliviar el payload" haría que las cuatro píldoras cuenten sobre un subconjunto
         * y mientan las cuatro a la vez, sin romper tipos ni pintar nada raro. Hay guarda.
         *
         * Los 7 campos nuevos son los que exige `ProyectoParaFiltro` — cero queries nuevas: la
         * relación ya se cargaba para resolver los owners. Al browser NO viaja este array,
         * viaja el resumen de 3 escalares.
         */
        projects: {
          select: {
            hubspotOwnerName: true,
            hubspotOwnerEmail: true,
            status: true,
            serviceType: true,
            hubspotServiceId: true,
            hubspotPipelineId: true,
            proyectoInterno: true,
            hermanoCsProjectId: true,
            altaEstado: true,
            // Solo para las filas de la pestaña «Proyectos internos», que muestra proyectos y
            // no empresas. Son 3 campos más sobre una relación que ya se cargaba.
            id: true,
            name: true,
            hubspotPipelineStageLabel: true,
          },
        },
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
      kind: c.kind,
      // Decimal(12,2) → number en la frontera server→client (no es serializable).
      tamUsd: c.tamUsd === null ? null : Number(c.tamUsd),
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
      /**
       * Reemplaza a `_count.projects`, que contaba los contenedores «Información del cliente»:
       * había fichas mostrando "1 proyecto" con cero. Con la barra de filtros nueva eso pasaba
       * de ser un detalle a una contradicción visible — la píldora diría «Sin proyecto abierto»
       * y la columna de esa misma fila mostraría 1.
       */
      resumen: resumirProyectos(c.projects),
      isShared: sharedIds.has(c.id),
    };
  });

  /**
   * Las filas de la pestaña «Proyectos internos» — un PROYECTO por fila, no una empresa.
   *
   * Se arma acá y no en el browser porque sale del mismo array de proyectos que ya vino para
   * el resumen: cero queries nuevas. Y va aplanada, así el cliente no recibe los proyectos de
   * las 165 empresas para quedarse con tres.
   *
   * ⚠ El orden se fija ACÁ. El que devuelve la base no es estable entre llamadas, y una lista
   * que se reordena sola ya nos hizo colgar un proyecto del hermano equivocado (C11).
   */
  const proyectosInternos: ProyectoInternoRow[] = ordenarProyectosInternos(
    clients.flatMap((c) => proyectosInternosDe(c, c.projects)),
  );

  // Ordenar por última actividad PASADA DESC. Los clientes sin actividad pasada
  // van al final (ordenados entre sí por createdAt DESC).
  rows.sort((a, b) => {
    const aDate = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bDate = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    if (aDate !== bDate) return bDate - aDate;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <ClientsGrid clients={rows} activeCse={activeCse} proyectosInternos={proyectosInternos} />
  );
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
      {/* Eje 1 — Clientes · Prospectos · Aliados · Proyectos internos: la ve todo rol */}
      <SkeletonTabs count={4} variant="pill" className="gap-1.5 flex-wrap" />
      {/* Eje 2 — pertenencia: solo CSE */}
      {showPills && <SkeletonTabs count={3} variant="pill" className="gap-1.5 flex-wrap" />}
      {/* Eje 3 — el toolbar, que ahora lo monta ClientsGrid y ya NO <Table>: por eso el
          TableSkeleton pierde su `toolbar`. Si quedara, se pintarían dos buscadores en la
          carga y uno solo después — que es el salto de 32px que este archivo documenta arriba.
          La línea de verdad NO va acá: en la primera pintura nada filtra, así que no existe. */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Skeleton className="h-9 w-full sm:w-72 rounded-lg" />
        <SkeletonTabs count={3} variant="pill" className="gap-2 flex-wrap sm:ml-3" />
        <Skeleton className="h-9 w-36 rounded-lg ml-auto" />
      </div>
      {/* Cliente · Última actividad · Próxima reunión · CSE · Reunión ventas · Sesión CSE · TAM · Proyectos · acciones */}
      <TableSkeleton columns={9} rows={9} />
    </div>
  );
}
