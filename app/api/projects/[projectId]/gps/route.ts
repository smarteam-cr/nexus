import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import { getProjectStage } from "@/lib/hubspot/stage";
import { normalize, extractTitleTerms } from "@/lib/utils/matching";
import { enrichClient } from "@/lib/matching/enrichment";
import { sessionMatchesClient } from "@/lib/matching/cascade";
import type { EnrichedClientMatcher } from "@/lib/matching/cascade";
import type { RawTranscript } from "@/lib/utils/matching";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";

// Sesión cruda por frente (auto-detectada). mixed = participan ambas áreas.
type FrontSession = {
  sessionId: string;
  title: string;
  date: string;
  mixed: boolean;
  summary: string | null;
  googleDocId: string | null;
  googleEventId: string | null;
};
// Por frente: la próxima futura y la última pasada (cada una puede faltar).
type FrontPairAuto = { next: FrontSession | null; last: FrontSession | null };

// Buscar sesiones del cliente (Google Meet + Fireflies legacy) y devolver la próxima
// futura y la última pasada — a nivel proyecto y POR FRENTE (Ventas / CSE).
async function getClientSessionBookends(clientId: string): Promise<{
  next: {
    sessionId: string;
    title: string;
    date: string;
    googleEventId: string | null;
    googleDocId: string | null;
  } | null;
  last: {
    sessionId: string;
    title: string;
    date: string;
    summary: string | null;
    googleDocId: string | null;
  } | null;
  fronts: { ventas: FrontPairAuto; cs: FrontPairAuto };
}> {
  const emptyFronts = { ventas: { next: null, last: null }, cs: { next: null, last: null } };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { hubspotAccount: { select: { id: true } } },
  });

  if (!client) return { next: null, last: null, fronts: emptyFronts };

  const [enriched, team] = await Promise.all([
    enrichClient(client),
    prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } }),
  ]);
  // Set normalizado para el cascade de matching (igual que antes)…
  const teamEmails = new Set(team.map((m) => normalize(m.email)));
  // …y los Sets por área (frente) para clasificar a los participantes internos.
  const { salesEmails, cseEmails } = classifyTeamEmailsByArea(team);

  for (const te of teamEmails) {
    enriched.companyContactEmails.delete(te);
    enriched.dealContactEmails.delete(te);
  }

  const titleTerms = client.name ? extractTitleTerms(client.name) : [];
  const matcher: EnrichedClientMatcher = {
    clientId,
    name: client.name ?? "",
    titleTerms,
    enriched,
  };

  const hasMatchingSignal =
    titleTerms.length > 0 ||
    enriched.domains.size > 0 ||
    enriched.companyContactEmails.size > 0 ||
    enriched.dealContactEmails.size > 0;

  if (!hasMatchingSignal) return { next: null, last: null, fronts: emptyFronts };

  // Cargar todas las sesiones (manualClientId override + matching cascade)
  // Optimización: traer solo lo que necesitamos para matching + bookends
  const allSessions = await prisma.firefliesSession.findMany({
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      participants: true,
      googleEventId: true,
      googleDocId: true,
      summary: true,
      manualClientId: true,
    },
    orderBy: { date: "desc" },
  });

  const matched = allSessions.filter((s) => {
    // Override manual: si la sesión tiene manualClientId, solo matchea con ese
    if (s.manualClientId) return s.manualClientId === clientId;

    // Cascade automático
    const raw: RawTranscript = {
      id: s.id,
      title: s.title,
      date: s.date.getTime(),
      duration: s.duration,
      participants: s.participants,
    };
    return sessionMatchesClient(raw, matcher, teamEmails);
  });

  const now = Date.now();
  // matched está ordenado DESC por date → reversa para encontrar la primera futura ASC
  const future = [...matched].reverse().filter((s) => s.date.getTime() > now);
  const past = matched.filter((s) => s.date.getTime() <= now);

  const nextRaw = future[0] ?? null;
  const lastRaw = past[0] ?? null;

  const extractSummaryText = (summary: unknown): string | null => {
    if (!summary || typeof summary !== "object") return null;
    const s = summary as Record<string, unknown>;
    // Estructura típica de Fireflies: { overview, shorthand_bullet, action_items, ... }
    if (typeof s.overview === "string") return s.overview;
    if (typeof s.shorthand_bullet === "string") return s.shorthand_bullet;
    return null;
  };

  // ── Por frente (Ventas / CSE): la próxima futura que involucra al área y la última
  //    pasada que la involucra (cada una por separado). Una sesión mixta (ambas áreas)
  //    cae en los dos frentes. future está ASC y past DESC → el primer .find() es el
  //    bookend correcto en cada caso.
  const involvesArea = (s: (typeof matched)[number], emails: Set<string>) =>
    s.participants.some((p) => emails.has(p.toLowerCase()));

  const buildFront = (s: (typeof matched)[number]): FrontSession => ({
    sessionId: s.id,
    title: s.title,
    date: s.date.toISOString(),
    mixed: involvesArea(s, salesEmails) && involvesArea(s, cseEmails),
    summary: extractSummaryText(s.summary),
    googleDocId: s.googleDocId,
    googleEventId: s.googleEventId,
  });

  const frontPair = (emails: Set<string>): FrontPairAuto => {
    if (emails.size === 0) return { next: null, last: null };
    const n = future.find((s) => involvesArea(s, emails)) ?? null;
    const l = past.find((s) => involvesArea(s, emails)) ?? null;
    return { next: n ? buildFront(n) : null, last: l ? buildFront(l) : null };
  };

  const fronts = {
    ventas: frontPair(salesEmails),
    cs: frontPair(cseEmails),
  };

  return {
    next: nextRaw
      ? {
          sessionId: nextRaw.id,
          title: nextRaw.title,
          date: nextRaw.date.toISOString(),
          googleEventId: nextRaw.googleEventId,
          googleDocId: nextRaw.googleDocId,
        }
      : null,
    last: lastRaw
      ? {
          sessionId: lastRaw.id,
          title: lastRaw.title,
          date: lastRaw.date.toISOString(),
          summary: extractSummaryText(lastRaw.summary),
          googleDocId: lastRaw.googleDocId,
        }
      : null,
    fronts,
  };
}

// GET: obtener datos del GPS del proyecto
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

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
    const stage = await getProjectStage(project.hubspotServiceId);
    currentState = stage?.label ?? "Sin etapa";
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
  const [openItems, historyRows] = await Promise.all([
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
  });
}

// PUT: actualizar datos del GPS
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

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
}
