import { cache, Suspense } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTeamMembers } from "@/lib/cache/team";
import { computeLastMeetingDates } from "@/lib/clients/meeting-dates";
import { computeClientActivityMap } from "@/lib/clients/last-interaction";
import { nombresAbiertos, proyectosAbiertos, resumirProyectos } from "@/lib/clients/resumen-proyectos";
import {
  proyectosInternosDe,
  ordenarProyectosInternos,
  type ProyectoInternoRow,
} from "@/lib/clients/proyectos-internos";
import { elegirEtapa, ordenarAvisos, type AvisoDeCartera } from "@/lib/clients/indice";
import { listarEmpresasTraibles } from "@/lib/hubspot/empresas-con-proyecto";
import { esProyectoDePipelineCS } from "@/lib/projects/scope";
import { altaEnCurso, EXPLICACION_DEL_PASO, siguientePaso } from "@/lib/projects/alta";
import { loadLifecycleBatch } from "@/lib/lifecycle";
import { etapaParaLaUI } from "@/lib/lifecycle/etapa-ui";
import { contarSesionesSinRevisar } from "@/lib/sessions/project-sources";
import { hayPropuestaParaRevisar } from "@/lib/timeline/borrador";
import { leerAutoriaDeLasPropuestas } from "@/lib/timeline/leer-autoria";
import { fraseDeAutoria } from "@/lib/timeline/autoria-de-la-propuesta";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { can } from "@/lib/auth/permissions/engine";
import type { OpcionDeEncargado } from "@/components/clients/CseEncargadoSelect";
import TraerDeHubspot, { BandejaDeHubspot } from "./TraerDeHubspot";
import type { requireUser } from "@/lib/auth/supabase";
import { Skeleton, SkeletonTabs, TableSkeleton } from "@/components/ui";
import ClientsGrid, { type ClientRow, type ActiveCse } from "./ClientsGrid";
import PanelDelIndice from "./PanelDelIndice";

/**
 * La ZONA LENTA de /clients — las queries pesadas (clients + team + meeting-dates + actividad)
 * dentro de un <Suspense> propio. Dos componentes la leen: la TABLA (columna izquierda) y el
 * PANEL «Qué sigue / Necesitan atención» (columna derecha, rediseño del 2026-10-04).
 *
 * Por qué el split ("push dynamic access down", patrón oficial de Next.js): el rol se
 * resuelve al toque en page.tsx (solo auth), así que el shell y el FALLBACK correcto
 * por rol pintan de inmediato — un loading.tsx estático no puede saber el rol (no lee
 * cookies) y reservaba la fila de pills que un SUPER_ADMIN nunca ve: su tabla real
 * arrancaba 32px más arriba que el skeleton.
 *
 * ⚠ Las dos columnas leen `consultarIndice`, envuelta en `cache()` de React: page.tsx les pasa
 * el MISMO `clientWhere` y el MISMO `sharedIds`, así que la consulta corre una vez por pedido
 * aunque la llamen dos componentes en dos <Suspense> distintos.
 */

type User = Awaited<ReturnType<typeof requireUser>>;
type ClientWhere = NonNullable<Parameters<typeof prisma.client.findMany>[0]>["where"] | null;

/** Lo que el índice sabe de la cartera, armado una vez por pedido. */
interface DatosDelIndice {
  rows: ClientRow[];
  proyectosInternos: ProyectoInternoRow[];
  /** Todos los avisos de las empresas visibles; el panel se queda con los del usuario. */
  avisos: AvisoDeCartera[];
  opcionesDeEncargado: OpcionDeEncargado[];
  puedeReasignar: boolean;
  puedeEliminar: boolean;
}

export const consultarIndice = cache(async (
  user: User,
  clientWhere: ClientWhere,
  sharedIds: Set<string>,
): Promise<DatosDelIndice> => {
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
         * "para aliviar el payload" haría que TODAS las píldoras —las de categoría y las de
         * vista— cuenten sobre un subconjunto y mientan todas a la vez, sin romper tipos ni
         * pintar nada raro. Hay guarda.
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
            // no empresas, y para la línea de proyectos abiertos debajo del nombre.
            id: true,
            name: true,
            hubspotPipelineStageLabel: true,
          },
        },
      },
    }),
    getTeamMembers(),
  ]);

  /**
   * Quién puede reasignar el CSE de una cuenta, y a quién se puede elegir.
   *
   * ⚠ El permiso se resuelve en el SERVIDOR y viaja como booleano: la ruta
   * `/api/clients/[id]/cse-encargado` lo vuelve a exigir igual, así que esto solo decide si se
   * pinta el desplegable — no es el candado.
   *
   * ⭐ Las opciones son TODO el equipo activo, sin filtrar por rol (decisión de Elías,
   * 2026-08-21). Acotarlo a `roleEnum === "CSE"` dejaría fuera a los CSL, que hoy llevan cuentas.
   */
  const puedeReasignar = user.teamMember
    ? await can(user.teamMember, "proyectos", "reasignarEncargado")
    : false;
  /* Eliminar una empresa pide `clientes.delete` en la API (`guardCapability("deleteClients")`). Se
     resuelve acá para no ofrecer en el menú «⋯» algo que va a rebotar en silencio. */
  const puedeEliminar = user.teamMember ? await can(user.teamMember, "clientes", "delete") : false;
  /* ⚠ Consulta aparte y no `getTeamMembers()`: ese loader trae los DESACTIVADOS a propósito
     (alimenta análisis histórico de sesiones) y su comentario dice, textual, que "los selectores
     de personas filtran deactivatedAt por su cuenta". Ofrecer a alguien que ya no está sería
     reasignarle una cuenta a quien se fue. Solo se pide cuando el desplegable se va a pintar. */
  const opcionesDeEncargado: OpcionDeEncargado[] = puedeReasignar
    ? (
        await prisma.teamMember.findMany({
          where: { deactivatedAt: null },
          select: { email: true, name: true },
          orderBy: { name: "asc" },
        })
      ).map((m) => ({ email: m.email, name: m.name }))
    : [];

  const clientIds = clients.map((c) => c.id);

  /* Los proyectos ABIERTOS de cada empresa, con el criterio de la columna «Proyectos» (lo decide
     `resumen-proyectos.ts`, que ya lo declara). De acá salen la línea de nombres, la etapa y los
     avisos: si cada uno filtrara por su cuenta, podrían contar historias distintas. */
  const abiertosPorCliente = new Map(clients.map((c) => [c.id, proyectosAbiertos(c.projects)]));
  const abiertos = clients.flatMap((c) => (abiertosPorCliente.get(c.id) ?? []).map((p) => ({ ...p, clientId: c.id, empresa: c.name })));
  const implementacionesAbiertas = abiertos.filter(esProyectoDePipelineCS);
  /* Las reuniones sin revisar solo importan con 2+ proyectos abiertos: con uno, una reunión de la
     empresa no puede caer en el proyecto equivocado. Es la misma condición del chip de la ficha. */
  const deEmpresasMultiproyecto = abiertos.filter((p) => (abiertosPorCliente.get(p.clientId)?.length ?? 0) >= 2);

  // Fechas de última reunión ventas/CSE + actividad (pasado/futuro) por cliente.
  // Ambos usan el match materializado FirefliesSession.resolvedClientId — queries
  // chicas e indexadas, no se cargan las ~16k sesiones en cada render.
  // La etapa sale del MISMO cargador que la ficha (`loadLifecycleBatch` + `etapaParaLaUI`):
  // el índice y el widget del proyecto no pueden decir etapas distintas.
  const [meetingDates, activityMap, lifecycles, timelines, sinRevisar] = await Promise.all([
    computeLastMeetingDates({ clientIds, teamMembers }),
    computeClientActivityMap(clients),
    loadLifecycleBatch(implementacionesAbiertas.map((p) => p.id)),
    abiertos.length
      ? prisma.projectTimeline.findMany({
          where: { projectId: { in: abiertos.map((p) => p.id) }, pendingProposal: { not: Prisma.DbNull } },
          select: { projectId: true, pendingProposal: true, pendingProposalRunId: true },
        })
      : Promise.resolve([]),
    contarSesionesSinRevisar(deEmpresasMultiproyecto.map((p) => ({ id: p.id, clientId: p.clientId }))),
  ]);

  const rows: ClientRow[] = clients.map((c) => {
    const md = meetingDates.get(c.id);
    const activity = activityMap.get(c.id);
    /**
     * ⭐ SOLO los proyectos del pipeline de Customer Success — nunca los "development"/
     * "sitios-web" que cuelgan como hijos de una implementación (`hermanoCsProjectId`).
     *
     * Elías, 2026-08-21: *"Los customer success del pipeline de implementación de hubspot
     * son los customer success de la cuenta... las cuentas tienen que estar en el
     * ownership de las personas del pipeline de hubspot."* Antes esta columna mezclaba el
     * owner de CUALQUIER proyecto: kölbi mostraba "Breiner Salas Salas +1" — el
     * desarrollador de su integración de Desarrollo, antepuesto al CSE real de la cuenta.
     */
    const proyectosDeCS = c.projects.filter(esProyectoDePipelineCS);
    const cseNames = [
      ...new Set(
        proyectosDeCS
          .map((p) => p.hubspotOwnerName)
          .filter((n): n is string => !!n && n.trim().length > 0)
      ),
    ];
    const cseEmails = [
      ...new Set(
        proyectosDeCS
          .map((p) => p.hubspotOwnerEmail)
          .filter((e): e is string => !!e && e.trim().length > 0)
          .map((e) => e.toLowerCase())
      ),
    ];

    // La etapa del proyecto de implementación (con 2+, el que va más atrás: `elegirEtapa`).
    const etapa = elegirEtapa(
      implementacionesAbiertas
        .filter((p) => p.clientId === c.id)
        .map((p) => etapaParaLaUI(lifecycles.get(p.id) ?? null)),
    );

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
      proyectosAbiertos: nombresAbiertos(c.projects),
      etapa,
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

  /* ── Necesitan atención ─────────────────────────────────────────────────────────────
     Lo que hoy solo se ve entrando a cada ficha, juntado para toda la cartera visible. Las tres
     señales son las de la ficha, con su misma regla: la propuesta de cronograma
     (`hayPropuestaParaRevisar`, que descarta el borrador vacío), el alta a medio hacer
     (`altaEnCurso`, porque «listo» también se guarda) y las reuniones que asignó la IA y nadie
     revisó. */
  const conPropuesta = timelines.filter((t) => hayPropuestaParaRevisar(t.pendingProposal));
  const autorias = await leerAutoriaDeLasPropuestas(
    conPropuesta.map((t) => ({ token: t.pendingProposalRunId, guardado: t.pendingProposal })),
  );
  const proyectoPorId = new Map(abiertos.map((p) => [p.id, p]));
  const avisos: AvisoDeCartera[] = [];
  conPropuesta.forEach((t, i) => {
    const p = proyectoPorId.get(t.projectId);
    if (!p) return;
    const autoria = autorias[i];
    avisos.push({
      tipo: "propuesta",
      clientId: p.clientId,
      empresa: p.empresa,
      projectId: p.id,
      proyecto: p.name,
      detalle: autoria ? `Llegó ${fraseDeAutoria(autoria)}. No se aplica sola.` : "No se aplica sola: espera tu decisión.",
      chip: "Propuesta por revisar",
      accion: "Revisar",
      href: `/clients/${p.clientId}?tab=${encodeURIComponent(p.id)}&canvas=timeline#cronograma-gantt`,
      delAgente: true,
    });
  });
  for (const p of abiertos) {
    const paso = altaEnCurso(p.altaEstado as Parameters<typeof altaEnCurso>[0]) ? siguientePaso(p.altaEstado as Parameters<typeof siguientePaso>[0]) : null;
    if (!paso) continue;
    avisos.push({
      tipo: "alta",
      clientId: p.clientId,
      empresa: p.empresa,
      projectId: p.id,
      proyecto: p.name,
      detalle: `${EXPLICACION_DEL_PASO[paso].titulo}: no cobra, no suma a la cartera y no se le publica nada hasta terminarlo.`,
      chip: "Alta a medio hacer",
      accion: "Retomar",
      href: urlDeProyecto(p.clientId, p.id),
      delAgente: false,
    });
  }
  for (const [projectId, n] of sinRevisar) {
    const p = proyectoPorId.get(projectId);
    if (!p || n === 0) continue;
    avisos.push({
      tipo: "sesiones",
      clientId: p.clientId,
      empresa: p.empresa,
      projectId: p.id,
      proyecto: p.name,
      detalle: "La IA las asignó a este proyecto y nadie las confirmó: podrían ser de otro proyecto de la empresa.",
      chip: n === 1 ? "1 reunión sin revisar" : `${n} reuniones sin revisar`,
      accion: "Revisar",
      href: urlDeProyecto(p.clientId, p.id),
      delAgente: false,
    });
  }

  return {
    rows,
    proyectosInternos,
    avisos: ordenarAvisos(avisos),
    opcionesDeEncargado,
    puedeReasignar,
    puedeEliminar,
  };
});

export async function ClientsTable({
  user,
  activeCse,
  clientWhere,
  sharedIds,
}: {
  user: User;
  activeCse: ActiveCse;
  clientWhere: ClientWhere;
  sharedIds: Set<string>;
}) {
  const datos = await consultarIndice(user, clientWhere, sharedIds);
  return (
    <ClientsGrid
      clients={datos.rows}
      activeCse={activeCse}
      proyectosInternos={datos.proyectosInternos}
      opcionesDeEncargado={datos.opcionesDeEncargado}
      puedeReasignarEncargado={datos.puedeReasignar}
      puedeEliminar={datos.puedeEliminar}
    />
  );
}

/**
 * La columna derecha del índice: «Qué sigue», «Necesitan atención» y la bandeja de HubSpot.
 *
 * Los avisos se recortan acá a los del usuario: un CSE ve los de SUS cuentas (las que lleva y las
 * compartidas con él); quien ve la cartera entera, los de todas. Es la misma pregunta que el
 * filtro «Mis clientes» de la tabla, con la misma regla de dueño (los proyectos de implementación).
 */
export async function PanelDeLaCartera({
  user,
  activeCse,
  clientWhere,
  sharedIds,
}: {
  user: User;
  activeCse: ActiveCse;
  clientWhere: ClientWhere;
  sharedIds: Set<string>;
}) {
  const datos = await consultarIndice(user, clientWhere, sharedIds);
  const veTodo = activeCse.isSuperAdmin || activeCse.canSeeAll;
  const miEmail = activeCse.email.toLowerCase();
  const miNombre = activeCse.name.toLowerCase();
  const mias = new Set(
    datos.rows
      .filter(
        (r) =>
          r.isShared ||
          r.cseEmails.includes(miEmail) ||
          r.cseNames.some((n) => n.toLowerCase() === miNombre),
      )
      .map((r) => r.id),
  );
  const avisos = veTodo ? datos.avisos : datos.avisos.filter((a) => mias.has(a.clientId));
  return (
    <PanelDelIndice
      avisos={avisos}
      alcance={veTodo ? "cartera" : "tuyas"}
      bandeja={
        /* En su PROPIO Suspense. Ver el comentario de SlotTraerDeHubspot: contar las empresas
           cuesta ~2,4 s de HubSpot, y el panel no puede esperar por eso para decir qué sigue. */
        <Suspense fallback={<SkeletonDeLaBandeja />}>
          <SlotTraerDeHubspot />
        </Suspense>
      }
    />
  );
}

/**
 * Las empresas con proyecto que le faltan a Nexus — la bandeja del panel y el modal de `?traer=`.
 *
 * ⚠ VIVE EN SU PROPIO `<Suspense>`, y no es un detalle. Contarlas cuesta 5 llamadas a HubSpot
 * (~2,4 s medidos). Awaitearlo junto al resto hacía que **la tabla de clientes entera esperara
 * a HubSpot**: el trabajo de la pantalla —ver los clientes— quedaba detrás de un botón
 * accesorio, y un día lento de la API se sentía como que Nexus está caído.
 *
 * Con su propia frontera, la tabla llega cuando está lista y la bandeja aparece después.
 *
 * `null` = HubSpot no contestó → la bandeja lo dice y el modal no se ofrece. Ofrecer traer sin
 * saber qué hay es peor que no ofrecer.
 */
async function SlotTraerDeHubspot() {
  const universo = await listarEmpresasTraibles().catch(() => null);
  return (
    <>
      <BandejaDeHubspot universo={universo} />
      {/* El modal queda para el enlace de /sessions (`?traer=`): se abre solo con la empresa
          preseleccionada. Sin ese parámetro no se pinta nada. */}
      <TraerDeHubspot cuantas={universo?.traibles.length ?? 0} soloPreseleccion />
    </>
  );
}

function SkeletonDeLaBandeja() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="space-y-1">
        {/* La clase de ROTULO_DEL_SISTEMA escrita acá: ese módulo es "use client" y este es del servidor. */}
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted">Falta traer de HubSpot</p>
        <Skeleton className="h-3 w-56" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
      ))}
    </div>
  );
}

/**
 * Fallback de la zona — lo elige page.tsx, que YA sabe el rol: con pertenencia para quien
 * la ve (CSE), sin ella para SUPER_ADMIN. Misma cáscara que ClientsGrid: pestañas subrayadas,
 * fila de segmentados + buscador, y la tabla de 6 columnas + acciones.
 * loading.tsx lo reusa con la variante mayoritaria (pertenencia) para la ventana pre-auth.
 */
export function ClientsTableZoneSkeleton({ showPills }: { showPills: boolean }) {
  return (
    <div className="space-y-5">
      {/* Clientes · Prospectos · Aliados · Proyectos internos: la ve todo rol */}
      <SkeletonTabs count={4} />
      {/* Segmentados (de quién es · qué tiene) y buscador. La línea de verdad NO va acá: en la
          primera pintura nada filtra, así que no existe. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {showPills && <Skeleton className="h-[34px] w-64 rounded-[10px]" />}
          <Skeleton className="h-[34px] w-80 rounded-[10px]" />
        </div>
        <Skeleton className="h-[34px] w-[260px] rounded-lg" />
      </div>
      {/* Empresa · Etapa · CSE · Última actividad · Próxima reunión · TAM · acciones */}
      <TableSkeleton columns={7} rows={9} />
    </div>
  );
}

/** Fallback de la columna derecha: «Qué sigue» y dos tarjetas de aviso. */
export function PanelDeLaCarteraSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="space-y-2 rounded-xl border border-info-line bg-info-surface p-3.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-3 w-40" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
