import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import { getProjectStage } from "@/lib/hubspot/stage";
import { withProjectAccess } from "@/lib/api";
import { withDbRetry } from "@/lib/db/retry";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";
import { computeBookends, type FrontSession, type SessionBookends } from "@/lib/sessions/bookends";
import { loadProjectSetup } from "@/lib/portfolio/project-setup";

// Sesiones del cliente (Google Meet + Fireflies legacy) → próxima futura y última
// pasada, a nivel proyecto y POR FRENTE (Ventas / CSE).
//
// PERF #1 (la dieta del GPS): antes esto cargaba las ~16.000 FirefliesSession con
// su blob `summary` y corría el cascade de matching + enrichClient (4-8 llamadas
// HubSpot EN VIVO) en cada render del widget: ~6s y el peor consumidor del pool.
// Ahora consulta por `resolvedClientId` — el matching YA materializado (con índice
// `[resolvedClientId, date desc]`, mantenido por resolve-sessions), el MISMO dato
// del que depende /clients para "última actividad". El override manual conserva su
// precedencia: manualClientId apunta acá O (sin override) la resolución automática.
async function getClientSessionBookends(clientId: string): Promise<SessionBookends> {
  const [team, sessions] = await Promise.all([
    prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } }),
    prisma.firefliesSession.findMany({
      where: {
        OR: [
          { manualClientId: clientId },
          { manualClientId: null, resolvedClientId: clientId },
        ],
      },
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

  // El frente "CSE" del GPS es el de ENTREGA (deliveryEmails = CSE ∪ Development,
  // igual que lib/timeline/delivery-sessions.ts): las sesiones técnicas que lleva
  // solo un Dev/SA (p. ej. una integración SAP) son sesiones de entrega — con solo
  // cseEmails quedaban fuera de ambos frentes y el widget mostraba "Sin agendar"
  // aunque hubiera reunión agendada.
  const { salesEmails, deliveryEmails } = classifyTeamEmailsByArea(team);

  return computeBookends(sessions, Date.now(), salesEmails, deliveryEmails);
}

/**
 * getProjectStage consulta HubSpot EN VIVO y sin tope: un HubSpot lento colgaba el
 * widget entero. Cap de 1.5s — si no llega, el caller cae al label YA SINCRONIZADO
 * (Project.hubspotPipelineStageLabel). La llamada perdedora sigue en background y
 * termina sola; no se cancela (el SDK no expone abort), solo se deja de esperar.
 */
const STAGE_TIMEOUT_MS = 1500;
async function getProjectStageCapped(hubspotServiceId: string) {
  return Promise.race([
    getProjectStage(hubspotServiceId).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), STAGE_TIMEOUT_MS)),
  ]);
}

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
      hubspotOwnerName: true,
      hubspotOwnerEmail: true,
      hubspotCreatedAt: true,
      hubspotPipelineName: true,
      createdAt: true,
    },
  });

  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Estado actual (HubSpot first, fallback a stage/step internos)
  let currentState: string;
  if (project.hubspotServiceId) {
    // La etapa se resuelve EN VIVO desde HubSpot (lo más fresco) pero con CAP de 1.5s:
    // si la llamada falla o no llega a tiempo (token vencido, rate-limit, HubSpot lento),
    // caer al label YA SINCRONIZADO en el Project (sync-projects) en vez de "Sin etapa"
    // — el dato existe, solo no se pudo revalidar ahora.
    const stage = await getProjectStageCapped(project.hubspotServiceId);
    currentState = stage?.label ?? project.hubspotPipelineStageLabel ?? "Sin etapa";
  } else {
    const stageSteps = getStageSteps(project.serviceType);
    const stageLabel = STAGE_LABELS[project.currentStage] ?? `Etapa ${project.currentStage}`;
    const steps = stageSteps[project.currentStage] ?? [];
    const stepLabel = steps[project.currentStep]?.label ?? `Paso ${project.currentStep + 1}`;
    currentState = `${stageLabel} → ${stepLabel}`;
  }

  // Auto-rellenado de próxima y última sesión desde FirefliesSession (Google Meet + legacy)
  const sessionBookends = await getClientSessionBookends(project.clientId);

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
  const [openItems, historyRows, setup] = await Promise.all([
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
    // #5 — señales de setup (qué canvas tiene generados) para el indicador del widget.
    loadProjectSetup(projectId, project.clientId),
  ]);

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
    fronts, // por frente (Ventas / CSE): { next, last } — para agrupar en Última y Próxima
    projectInfo,
    actionItems: pendingItemsCompat, // alias semántico
    historyItems, // tareas hechas o borradas (tab Histórico)
    setup, // #5 — { handoff, kickoff, cronograma, procesos } para el indicador del widget
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
