import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import { withProjectAccess } from "@/lib/api";
import { withDbRetry } from "@/lib/db/retry";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";
import { computeBookends, type FrontSession, type SessionBookends } from "@/lib/sessions/bookends";
import { loadProjectSetup } from "@/lib/portfolio/project-setup";
import { canvasOfNested, onlyEnabled } from "@/lib/pieces/canvas-query";
import { resolverDuenioDelHandoff } from "@/lib/handoff/duenio";
import { getProjectLifecycle } from "@/lib/lifecycle";
import { etapaParaLaUI } from "@/lib/lifecycle/etapa-ui";
import { loadCanvasesConContenido } from "@/lib/pieces/piece-content";
import { buildCanvasChips } from "@/lib/flow/canvas-chips";
import { frentesDeProyecto, hechosDeProyecto, type EquipoDeFrente } from "@/lib/projects/kind";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { evaluarFrescura } from "@/lib/projects/brief-vencido";

// Sesiones del cliente (Google Meet + Fireflies legacy) → próxima futura y última
// pasada, a nivel proyecto y POR FRENTE (Ventas / CSE).
//
// PERF #1 (la dieta del GPS): antes esto cargaba las ~16.000 FirefliesSession con
// su blob `summary` y corría el cascade de matching + enrichClient (4-8 llamadas
// HubSpot EN VIVO) en cada render del widget: ~6s y el peor consumidor del pool.
// Ahora consulta por `resolvedClientId` — el matching YA materializado (con índice
// `[resolvedClientId, date desc]`, mantenido por resolve-sessions), el MISMO dato
// del que depende /clients para "última actividad".
//
// ⚠ La pertenencia se pregunta con `whereBelongsToClient`, igual que el resto del repo. Acá vivía
// la forma "el override manda" (`manualClientId` apunta acá O —sin override— la automática), que
// suena más correcta y es una trampa: solo funciona si `manualClientId` apunta siempre a un
// cliente vivo, y no lo garantiza nadie —no es clave foránea, así que borrar un cliente lo deja
// colgando—. Con un override colgado la sesión falla las DOS ramas y el widget dice "Sin agendar"
// con la reunión agendada. Es el síntoma del incidente del 2026-08-04, y estaba en producción.
async function getClientSessionBookends(
  clientId: string,
  /** A quién mira el frente de ENTREGA de este proyecto (lib/projects/kind.ts). */
  equipoDeEntrega: EquipoDeFrente,
): Promise<SessionBookends> {
  const [team, sessions] = await Promise.all([
    prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } }),
    prisma.firefliesSession.findMany({
      where: whereBelongsToClient(clientId),
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        googleEventId: true,
        googleDocId: true,
        summary: true,
      },
      orderBy: { date: "desc" },
    }),
  ]);

  /* A QUIÉN mira el frente de entrega lo declara la tabla, no este archivo.
     · `"entrega"` (Customer Success, Sitios web) = CSE ∪ Development, igual que
       lib/timeline/delivery-sessions.ts: una integración que lleva solo un Dev/SA ES una
       sesión de entrega, y con solo `cseEmails` el widget mostraba "Sin agendar" con la
       reunión ya agendada.
     · `"desarrollo"` = solo Development, para el pipeline que tiene frente técnico propio.
       Sin esto, el frente rotulado "Desarrollo" traía las sesiones del CSE del proyecto
       hermano —ganan por fecha— y el rótulo mentía. */
  const emails = classifyTeamEmailsByArea(team);
  const porEquipo: Record<EquipoDeFrente, Set<string>> = {
    ventas: emails.salesEmails,
    entrega: emails.deliveryEmails,
    desarrollo: emails.devEmails,
  };

  return computeBookends(sessions, Date.now(), emails.salesEmails, porEquipo[equipoDeEntrega]);
}

/* La consulta EN VIVO a HubSpot por la etapa se retiró (2026-07-30). Estaba acá porque el
   widget mostraba la etapa como texto suelto y quería el valor más fresco posible; costaba
   un round-trip por apertura y hubo que taparla con un cap de 1.5s porque un HubSpot lento
   colgaba el widget entero. Hoy la etapa la sirve `etapaParaLaUI`, que lee el label YA
   SINCRONIZADO (`Project.hubspotPipelineStageLabel`) — el mismo dato, sin la llamada. El
   sync lo refresca, y desde O2 sus caches vencen a los 10 min, así que "más fresco" ya no
   justifica pagar la latencia. Si alguien la extraña: el problema real sería un sync
   atrasado, y se arregla en el sync. */

// GET: obtener datos del GPS del proyecto
export const GET = withProjectAccess(async (
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) => withDbRetry(async () => {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      name: true,
      nextSessionDate: true,
      nextSessionNote: true,
      lastSessionSummary: true,
      salesNextSessionDate: true,
      salesNextSessionNote: true,
      csNextSessionDate: true,
      csNextSessionNote: true,
      pendingItems: true,
      currentStage: true,
      currentStep: true,
      serviceType: true,
      hubspotServiceId: true,
      hubspotPipelineStageLabel: true,
      hubspotStageSyncedAt: true,
      hubspotOwnerName: true,
      hubspotOwnerEmail: true,
      hubspotCreatedAt: true,
      hubspotPipelineName: true,
      hubspotPipelineId: true,
      // Los tags deciden qué piezas le corresponden al proyecto (`piezaAplica`).
      tags: true,
      // De qué clase es el proyecto: decide qué FRENTES muestra el widget y con qué rótulo.
      proyectoInterno: true,
      hermanoCsProjectId: true,
      altaEstado: true,
      // El diagnóstico del alta trabada, para el cartel con "Reintentar" dentro del widget.
      altaError: true,
      altaUltimoIntentoAt: true,
      altaActorEmail: true,
      altaIntentos: true,
      createdAt: true,
      // Tanda M — si el handoff dejó una propuesta de cronograma sin revisar.
      timeline: { select: { pendingProposal: true } },
    },
  });

  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  /* La ETAPA, normalizada para pintar (lib/lifecycle/etapa-ui.ts): sirve igual para la que
     manda el pipeline de HubSpot y para el ciclo de 8 etapas de un proyecto sin pipeline. Se
     mudó acá desde su propia sección + su propio endpoint, así que el widget dejó de ser un
     segundo lugar donde leer la etapa y pasó a ser el único. */
  const etapa = etapaParaLaUI(await getProjectLifecycle(projectId));

  // Estado actual (HubSpot first, fallback a stage/step internos)
  let currentState: string;
  if (project.hubspotServiceId) {
    /* ⚠ YA NO se pinta: lo reemplazó el bloque "Etapa", que sale de la etapa materializada.
       El campo se conserva para no romper una respuesta cacheada vieja, pero SIN la llamada
       en vivo a HubSpot que hacía antes: era un round-trip por cada render del widget para
       mostrar, al lado del otro bloque, un rótulo que podía no coincidir con él. Con el
       vencimiento de los caches del sync (O2), el materializado está a lo sumo 10 min viejo. */
    currentState = project.hubspotPipelineStageLabel ?? "Sin etapa";
  } else {
    const stageSteps = getStageSteps(project.serviceType);
    const stageLabel = STAGE_LABELS[project.currentStage] ?? `Etapa ${project.currentStage}`;
    const steps = stageSteps[project.currentStage] ?? [];
    const stepLabel = steps[project.currentStep]?.label ?? `Paso ${project.currentStep + 1}`;
    currentState = `${stageLabel} → ${stepLabel}`;
  }

  /* QUÉ frentes se pintan, con qué rótulo y A QUIÉN mira cada uno lo decide el servidor
     desde la tabla de lib/projects/kind.ts. Se resuelve ANTES de buscar las sesiones porque
     el frente de entrega decide de qué equipo son las que se muestran. */
  const frentes = frentesDeProyecto(hechosDeProyecto(project));
  const frenteDeEntrega = frentes.find((f) => f.key === "cs");

  // Auto-rellenado de próxima y última sesión desde FirefliesSession (Google Meet + legacy)
  const sessionBookends = await getClientSessionBookends(
    project.clientId,
    frenteDeEntrega?.equipo ?? "entrega",
  );

  // Resolver con override manual (si Project.* está seteado, prevalece) — campos legacy.
  const manualNextDate = project.nextSessionDate?.toISOString() ?? null;
  const manualLastSummary = project.lastSessionSummary ?? null;

  const nextSession = {
    date: manualNextDate ?? sessionBookends.next?.date ?? null,
    title: sessionBookends.next?.title ?? null,
    note: project.nextSessionNote ?? null,
    googleEventId: sessionBookends.next?.googleEventId ?? null,
    source: (manualNextDate
      ? "manual"
      : sessionBookends.next
      ? "auto"
      : null) as "manual" | "auto" | null,
  };

  const lastSession = {
    date: sessionBookends.last?.date ?? null,
    title: sessionBookends.last?.title ?? null,
    summary: manualLastSummary ?? sessionBookends.last?.summary ?? null,
    googleDocId: sessionBookends.last?.googleDocId ?? null,
    source: (manualLastSummary
      ? "manual"
      : sessionBookends.last
      ? "auto"
      : null) as "manual" | "auto" | null,
  };

  // ── Frentes (Ventas / CSE): por frente la PRÓXIMA (override manual precede al auto si
  //    es futuro) y la ÚLTIMA (siempre auto). Para que la columna Última y Próxima del
  //    widget muestren ambos frentes agrupados. ──
  const nowMs = Date.now();
  const mkNext = (
    manualDate: Date | null,
    manualNote: string | null,
    auto: FrontSession | null,
  ) => {
    // El manual aplica como "próxima" solo si es futuro; si ya pasó, cae al auto.
    if (manualDate && manualDate.getTime() > nowMs) {
      return {
        date: manualDate.toISOString(),
        title: null as string | null,
        note: manualNote ?? null,
        mixed: false,
        googleDocId: null as string | null,
        googleEventId: null as string | null,
        source: "manual" as const,
      };
    }
    if (auto) {
      return {
        date: auto.date,
        title: auto.title,
        note: null as string | null,
        mixed: auto.mixed,
        googleDocId: auto.googleDocId,
        googleEventId: auto.googleEventId,
        source: "auto" as const,
      };
    }
    return null;
  };
  const mkLast = (auto: FrontSession | null) =>
    auto
      ? {
          date: auto.date,
          title: auto.title,
          summary: auto.summary,
          mixed: auto.mixed,
          googleDocId: auto.googleDocId,
          source: "auto" as const,
        }
      : null;

  const fronts = {
    ventas: {
      next: mkNext(project.salesNextSessionDate, project.salesNextSessionNote, sessionBookends.fronts.ventas.next),
      last: mkLast(sessionBookends.fronts.ventas.last),
    },
    cs: {
      next: mkNext(project.csNextSessionDate, project.csNextSessionNote, sessionBookends.fronts.cs.next),
      last: mkLast(sessionBookends.fronts.cs.last),
    },
  };

  /* `fronts` sigue trayendo los dos pares —es el mapa de datos, cuesta lo mismo— y `frentes`
     (resuelto arriba) es lo que se muestra. El widget solo pinta la lista que recibe: así el
     cuarto pipeline es una fila de la tabla y no un `if` adentro de React. */

  // ── Info del proyecto (propiedades de HubSpot + base) ────────────────────
  const projectInfo = {
    name: project.name,
    pipelineName: project.hubspotPipelineName,
    cseEncargado: project.hubspotOwnerName,
    cseEncargadoEmail: project.hubspotOwnerEmail,
    createdAt: (project.hubspotCreatedAt ?? project.createdAt)?.toISOString() ?? null,
    createdAtSource: project.hubspotCreatedAt ? "hubspot" : "nexus",
  };

  // ── ActionItems del proyecto (tabla nueva, reemplaza el Json legacy) ─────
  const actionItemSelect = {
    id: true,
    text: true,
    ownerEmail: true,
    dueDate: true,
    status: true,
    done: true,
    deletedAt: true,
    source: true,
    sessionId: true,
    session: { select: { id: true, title: true, date: true } },
  } as const;

  type ActionItemRow = {
    id: string;
    text: string;
    ownerEmail: string | null;
    dueDate: Date | null;
    status: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
    done: boolean;
    deletedAt: Date | null;
    source: string | null;
    sessionId: string | null;
    session: { id: string; title: string | null; date: Date | null } | null;
  };

  const toCompat = (a: ActionItemRow) => ({
    text: a.text,
    done: a.done,
    source: a.source ?? undefined,
    addedAt: undefined,
    // Campos extra para que el UI nuevo aproveche si quiere
    id: a.id,
    ownerEmail: a.ownerEmail,
    dueDate: a.dueDate?.toISOString() ?? null,
    status: a.status,
    deletedAt: a.deletedAt?.toISOString() ?? null,
    sessionId: a.sessionId,
    sessionTitle: a.session?.title ?? null,
  });

  // Pendientes ABIERTOS (no hechos, no borrados) — lo que ve el widget + tab Pendientes.
  const [openItems, historyRows, setup, canvases] = await Promise.all([
    prisma.actionItem.findMany({
      where: { projectId, done: false, deletedAt: null },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      select: actionItemSelect,
      take: 20,
    }),
    // Histórico: tareas HECHAS o BORRADAS del proyecto (tab Histórico del modal).
    prisma.actionItem.findMany({
      where: { projectId, OR: [{ done: true }, { deletedAt: { not: null } }] },
      orderBy: { updatedAt: "desc" },
      select: actionItemSelect,
      take: 50,
    }),
    /* Sigue haciendo falta por DOS señales que no son piezas de canvas y no se pueden
       derivar de los bloques: el estado de tres valores del Cronograma (vive en
       ProjectTimeline) y los procesos (viven a nivel CLIENTE). Las otras dos que trae
       —handoff y kickoff— ya las cubren los chips. */
    loadProjectSetup(projectId, project.clientId, project.hubspotPipelineId),
    /* Los canvases del proyecto, para el bloque "Canvas". MISMA consulta que el
       desplegable del panel (`/api/projects/[id]/canvases`), salvo que acá el handoff SÍ
       entra: en el widget la pregunta es qué documentos tiene el proyecto. */
    prisma.projectCanvas.findMany({
      where: { projectId, ...onlyEnabled },
      select: { id: true, slug: true, name: true },
    }),
  ]);

  /* ¿Cuáles tienen algo ESCRITO? Criterio único de lib/pieces/piece-content.ts, el mismo
     que usa el desplegable: un bloque semilla no cuenta, y el Cronograma se mide por sus
     fases. Sin esto, una pieza recién activada se pintaría de verde estando vacía. */
  const conContenido = await loadCanvasesConContenido(projectId, canvases);

  /* El handoff puede ser el de OTRO proyecto: un desarrollo que cuelga de una implementación
     comparte el suyo (lib/handoff/duenio.ts). Sin esto, su canvas propio está vacío y el chip
     diría "Handoff · pendiente" sobre un documento completo que la sección de abajo está
     mostrando. */
  const duenioHandoff = await resolverDuenioDelHandoff(projectId);
  const handoffDelHermano = duenioHandoff.redirigido
    ? {
        generado:
          (await prisma.canvasBlock.count({
            where: { section: { canvas: canvasOfNested("handoff", { projectId: duenioHandoff.ownerProjectId }) } },
          })) > 0,
      }
    : null;

  /* ── EL RESUMEN DEL PROYECTO Y SI QUEDÓ VIEJO ──────────────────────────────
     La frescura se DERIVA acá, en el servidor, y NO viajan cuatro fechas para que el navegador
     saque la conclusión: dos consumidores calculándola por su cuenta terminarían diciendo cosas
     distintas sobre el mismo resumen. Viaja el veredicto y su motivo. */
  const [briefRow, ultimaSesion, ultimaDesviacion] = await Promise.all([
    prisma.projectBrief.findUnique({
      where: { projectId },
      select: { headline: true, statements: true, generatedAt: true, staleAt: true },
    }),
    prisma.firefliesSession.findFirst({
      where: {
        projects: { some: { projectId } },
        /* ⚠ SOLO LAS QUE YA OCURRIERON. Sin este corte, una reunión AGENDADA para la semana que
           viene es siempre «posterior» al resumen y lo deja vencido para siempre — con el agravante
           de que regenerarlo no lo arregla, porque la reunión futura sigue estando adelante. Hay
           459 sesiones futuras en el corpus (agenda recurrente de Google), así que no es un borde. */
        date: { lte: new Date() },
        OR: [{ summary: { not: Prisma.DbNull } }, { transcript: { not: null } }],
      },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.particularidad.findFirst({
      where: { timeline: { projectId } },
      orderBy: { lastDetectedAt: "desc" },
      select: { lastDetectedAt: true },
    }),
  ]);
  const frescura = evaluarFrescura(briefRow?.generatedAt ?? null, {
    ultimaSesionConContenido: ultimaSesion?.date ?? null,
    handoffActualizadoEn: null,
    /* ⛔ NO se usa `hubspotStageSyncedAt`: significa «la última vez que la REVALIDAMOS», no
       «cuándo cambió». El espejo corre cada vez que alguien abre la ficha del cliente, así que
       ese sello es casi siempre posterior al resumen y el cartel de vencido quedaría encendido
       para siempre — y encima mintiendo, porque la etapa puede no haberse movido en meses. Un
       aviso permanente se ignora, y con él se ignoran los que sí importan.
       Hoy Nexus no guarda CUÁNDO cambió la etapa; hasta que exista esa columna, esta señal vale
       `null` — preferimos no avisar de un cambio real antes que avisar de uno que no pasó. */
    etapaSincronizadaEn: null,
    ultimaDesviacionEn: ultimaDesviacion?.lastDetectedAt ?? null,
    marcadoVencidoEn: briefRow?.staleAt ?? null,
  });
  const brief = briefRow
    ? {
        headline: briefRow.headline,
        statements: briefRow.statements,
        generatedAt: briefRow.generatedAt.toISOString(),
        vencido: frescura.vencido,
        motivoDeVencimiento: frescura.motivo,
      }
    : null;

  const canvasChips = buildCanvasChips({
    canvases: canvases.map((c) => ({ ...c, hasContent: conContenido.has(c.id) })),
    tags: project.tags,
    hubspotPipelineId: project.hubspotPipelineId,
    cronograma: setup.cronograma,
    tieneProcesos: setup.procesos,
    handoffDelHermano,
  });

  // Para compat hacia atrás: también devolver `pendingItems` con shape antiguo
  // basado en ActionItems (el GPS UI viejo lee `pendingItems`).
  const pendingItemsCompat = openItems.map(toCompat);
  const historyItems = historyRows.map(toCompat);

  return NextResponse.json({
    // Campos legacy (compatibilidad hacia atrás con el UI actual)
    nextSessionDate: nextSession.date,
    nextSessionNote: nextSession.note,
    lastSessionSummary: lastSession.summary,
    pendingItems: pendingItemsCompat,
    currentState,

    // Campos enriquecidos (nueva API)
    nextSession,
    lastSession,
    fronts, // por ranura ("ventas" / "cs"): { next, last } — el mapa de datos
    frentes, // QUÉ frentes pintar y con qué rótulo, en orden (lib/projects/kind.ts)
    etapa, // el bloque "Etapa" — null cuando no hay etapa que mostrar
    projectInfo,
    actionItems: pendingItemsCompat, // alias semántico
    historyItems, // tareas hechas o borradas (tab Histórico)
    setup, // #5 — { handoff, kickoff, cronograma, procesos } para el indicador del widget
    /* El bloque "Canvas": qué documentos le corresponden a ESTE proyecto y cuáles ya están.
       El servidor manda la lista ya filtrada por `piezaAplica`; el widget solo pinta. */
    canvasChips,
    /* El resumen citado del proyecto, con su veredicto de frescura ya resuelto. `null` = todavía
       no se generó, que el widget pinta distinto de «se generó y no dice nada». */
    brief,
    /* El alta a medio hacer. Va siempre —también cuando terminó— porque el widget no puede
       distinguir "no hay bloque" de "todavía no cargó": el componente decide no pintar nada
       leyendo el estado, no la ausencia del campo. */
    alta: {
      estado: project.altaEstado,
      error: project.altaError,
      ultimoIntentoAt: project.altaUltimoIntentoAt?.toISOString() ?? null,
      actorEmail: project.altaActorEmail,
      intentos: project.altaIntentos,
    },
    timelineProposalPending: project.timeline?.pendingProposal != null,
  });
}));

// PUT: actualizar datos del GPS
export const PUT = withProjectAccess(async (
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await params;

  const body = await req.json();

  const data: Record<string, unknown> = {};

  if ("nextSessionDate" in body) {
    data.nextSessionDate = body.nextSessionDate ? new Date(body.nextSessionDate) : null;
  }
  if ("nextSessionNote" in body) {
    data.nextSessionNote = body.nextSessionNote || null;
  }
  if ("lastSessionSummary" in body) {
    data.lastSessionSummary = body.lastSessionSummary || null;
  }
  // Override manual de la próxima sesión POR FRENTE (reuniones ajenas a meets).
  if ("salesNextSessionDate" in body) {
    data.salesNextSessionDate = body.salesNextSessionDate ? new Date(body.salesNextSessionDate) : null;
  }
  if ("salesNextSessionNote" in body) {
    data.salesNextSessionNote = body.salesNextSessionNote || null;
  }
  if ("csNextSessionDate" in body) {
    data.csNextSessionDate = body.csNextSessionDate ? new Date(body.csNextSessionDate) : null;
  }
  if ("csNextSessionNote" in body) {
    data.csNextSessionNote = body.csNextSessionNote || null;
  }
  if ("pendingItems" in body) {
    data.pendingItems = body.pendingItems ?? [];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return NextResponse.json({ ok: true });
});
