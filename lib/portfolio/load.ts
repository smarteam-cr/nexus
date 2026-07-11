/**
 * lib/portfolio/load.ts
 *
 * D.3 panel de cartera — carga BATCH de todos los proyectos visibles con su resumen.
 * UNA sola query anidada (Project → timeline → phases/tasks + baseline activo + último
 * PROGRESS), y luego mapea cada proyecto por computeProjectSummary (puro). Sin N+1.
 *
 * `clientWhere` viene de accessibleClientWhere(user): null para roles see-all (toda la
 * cartera), o un filtro scopeado. El panel es de seeAllClients, pero el filtro se respeta
 * por si en el futuro un rol scopeado lo usa.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma, ProjectHealth } from "@prisma/client";
import { computeProjectSummary, type ProjectSummary, type SummaryLifecycleInput } from "./summary";
import type { BaselineSnapshot } from "@/lib/timeline/baseline";
import { SENTINEL_SERVICE_TYPE } from "@/lib/canvas/strategy-project";
import { loadLifecycleBatch, type ProjectLifecycle } from "@/lib/lifecycle";
import {
  SETUP_CANVAS_NAMES,
  blockCountsForStep,
  deriveSetup,
  type SetupSignals,
} from "./project-setup";

export interface PortfolioRow {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  clientCompany: string | null;
  cseName: string | null;
  cseEmail: string | null;
  stageLabel: string | null;
  status: string;
  timelinePublished: boolean;
  createdAt: string;
  summary: ProjectSummary;
  healthOverrideReason: string | null;
  healthOverrideAt: string | null;
  healthOverrideBy: string | null;
  // Última razón "humana" del cronograma (último TimelineChange MANUAL/AI_ASSIST) — el "por
  // qué" del último cambio/publicación, para mostrar al lado de los proyectos atrasados.
  lastChange: { reason: string; kind: string; byEmail: string | null; at: string } | null;
  // Estado del setup del proyecto (qué artefactos se generaron) — para el checklist de "Sin datos"
  // y las action cards. handoff/kickoff/cronograma son por proyecto; procesos es por CLIENTE.
  setup: SetupSignals;
  // Ciclo de vida (lib/lifecycle) — la etapa efectiva viaja en summary.stage; acá va el
  // detalle para la UI (stepper/tooltip/curación) y la propuesta de riesgo pendiente.
  lifecycle: ProjectLifecycle | null;
  healthProposed: ProjectHealth | null;
  healthProposedReason: string | null;
  healthProposedAt: string | null;
}

/**
 * ProjectLifecycle (loader) → input de conciencia de etapa del summary.
 * `lastGateAt` = señal cumplida más reciente (gates o kickoff) — referencia del
 * "hace Nd" de las alarmas tempranas. Lo reusa watchdog-context (mismo mapeo).
 */
export function toSummaryLifecycle(lc: ProjectLifecycle | null): SummaryLifecycleInput | null {
  if (!lc) return null;
  const signalTimes = lc.gates.map((g) => g.markedAt.getTime());
  const kickoffAt = lc.kickoffPublishedAt ?? lc.kickoffSessionAt;
  if (kickoffAt) signalTimes.push(kickoffAt.getTime());
  return {
    defined: lc.defined,
    stage: lc.effective,
    source: lc.source,
    kickoffPublishedAt: lc.kickoffPublishedAt,
    cronogramaConsensuadoAt: lc.cronogramaConsensuadoAt,
    lastGateAt: signalTimes.length ? new Date(Math.max(...signalTimes)) : null,
    projectCreatedAt: lc.projectCreatedAt,
  };
}

export async function loadPortfolio(
  clientWhere: Prisma.ClientWhereInput | null,
): Promise<PortfolioRow[]> {
  const projects = await prisma.project.findMany({
    // Mostrar SOLO proyectos REALES y navegables — el MISMO criterio que el rail de proyectos
    // del cliente (app/clients/[id]/page.tsx + layout.tsx), para que el panel nunca lleve a un
    // proyecto que no aparece al entrar al cliente:
    //   - status "active" → excluye los "inactive" (fantasmas/terminados que marca el sync de HubSpot).
    //   - NO el sentinel de estrategia "__strategy__" (con OR para conservar los serviceType NULL,
    //     que `{ not }` de Prisma descartaría).
    //   - Regla HubSpot: clientes CON HubSpot solo muestran proyectos con hubspotServiceId
    //     (deja afuera los stubs "Proyecto principal"/"Proyecto {id}" sin servicio); clientes SIN
    //     HubSpot muestran cualquier proyecto activo.
    where: {
      status: "active",
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
      AND: [
        { OR: [
          { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
          { hubspotServiceId: { not: null } },
        ] },
        ...(clientWhere ? [{ client: clientWhere }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      clientId: true,
      status: true,
      hubspotOwnerName: true,
      hubspotOwnerEmail: true,
      hubspotPipelineStageLabel: true,
      timelinePublishedAt: true,
      createdAt: true,
      healthStatusOverride: true,
      healthStatusOverrideReason: true,
      healthStatusOverrideAt: true,
      healthStatusOverrideBy: true,
      healthProposed: true,
      healthProposedReason: true,
      healthProposedAt: true,
      client: { select: { name: true, company: true } },
      timeline: {
        select: {
          id: true,
          anchorStartDate: true,
          phases: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              order: true,
              durationWeeks: true,
              startWeek: true,
              actualStart: true,
              actualEnd: true,
              tasks: {
                select: {
                  id: true,
                  status: true,
                  weekIndex: true,
                  actualStart: true,
                  actualEnd: true,
                  needsValidation: true,
                },
              },
            },
          },
          baselines: { where: { isActive: true }, take: 1, select: { snapshot: true, firmness: true } },
          changes: {
            where: { kind: "PROGRESS" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  // 2da query (batcheada, sin N+1): la última razón "humana" (MANUAL/AI_ASSIST) por timeline.
  // distinct sobre timelineId + orderBy createdAt desc → toma la más reciente de cada uno.
  const timelineIds = projects
    .map((p) => p.timeline?.id)
    .filter((id): id is string => !!id);
  const lastChanges = timelineIds.length
    ? await prisma.timelineChange.findMany({
        where: { timelineId: { in: timelineIds }, kind: { in: ["MANUAL", "AI_ASSIST"] } },
        orderBy: [{ timelineId: "asc" }, { createdAt: "desc" }],
        distinct: ["timelineId"],
        select: { timelineId: true, reason: true, kind: true, changedByEmail: true, createdAt: true },
      })
    : [];
  const lastChangeByTimeline = new Map(lastChanges.map((c) => [c.timelineId, c]));

  const projectIds = projects.map((p) => p.id);
  const clientIds = [...new Set(projects.map((p) => p.clientId))];

  // Ciclo de vida en batch (gates + snapshot Partner + umbral UUS) — la etapa efectiva
  // entra al summary para que las alarmas de cronograma apliquen SOLO donde corresponde.
  const lifecycleByProject = await loadLifecycleBatch(projectIds);

  // Nombre canónico del CSE desde el roster (TeamMember por email). HubSpot puede traer un display
  // name desfasado del owner (ej. "Deiver Acuña Salas" para asalas@, que en el roster es "Alejandro
  // Salas") → el roster es la fuente de verdad del nombre. Fallback al de HubSpot si no está en el roster.
  const ownerEmails = [...new Set(projects.map((p) => p.hubspotOwnerEmail).filter((e): e is string => !!e))];
  const rosterMembers = ownerEmails.length
    ? await prisma.teamMember.findMany({ where: { email: { in: ownerEmails } }, select: { email: true, name: true } })
    : [];
  const cseNameByEmail = new Map(rosterMembers.map((m) => [m.email.toLowerCase(), m.name]));

  // 3ra query (batch): bloques de los canvas de setup (Handoff/Kickoff) → qué pasos están
  // generados por proyecto. Cuentan por existencia (born-CONFIRMED #1; regla en project-setup.ts).
  const setupBlocks = projectIds.length
    ? await prisma.canvasBlock.findMany({
        where: { section: { canvas: { projectId: { in: projectIds }, name: { in: SETUP_CANVAS_NAMES } } } },
        select: { status: true, section: { select: { canvas: { select: { projectId: true, name: true } } } } },
      })
    : [];
  const stepsByProject = new Map<string, Set<string>>();
  for (const b of setupBlocks) {
    const c = b.section.canvas;
    if (!c.projectId) continue; // canvas de business case (sin proyecto) — fuera del portafolio
    if (!blockCountsForStep(c.name, b.status)) continue;
    let set = stepsByProject.get(c.projectId);
    if (!set) { set = new Set(); stepsByProject.set(c.projectId, set); }
    set.add(c.name);
  }

  // 4ta query (batch): clientes CON procesos (flowcharts con nodos en la sección "procesos" del
  // canvas "Información del cliente" del proyecto __strategy__). Cuenta por EXISTENCIA, no CONFIRMED
  // (mide "generado", no "expuesto" — la exposición externa sí filtra CONFIRMED). Por cliente.
  const procesoBlocks = clientIds.length
    ? await prisma.canvasBlock.findMany({
        where: {
          blockType: "FLOWCHART",
          section: {
            key: "procesos",
            canvas: { name: "Información del cliente", project: { clientId: { in: clientIds }, serviceType: SENTINEL_SERVICE_TYPE } },
          },
        },
        select: { data: true, section: { select: { canvas: { select: { project: { select: { clientId: true } } } } } } },
      })
    : [];
  const clientsWithProcesos = new Set<string>();
  for (const b of procesoBlocks) {
    const nodes = (b.data as { nodes?: unknown[] } | null)?.nodes;
    const clientId = b.section.canvas.project?.clientId;
    if (clientId && Array.isArray(nodes) && nodes.length > 0) clientsWithProcesos.add(clientId);
  }

  const now = new Date();
  return projects.map((p) => {
    const tl = p.timeline;
    const activeBaseline = tl?.baselines?.[0] ?? null;
    const lc = tl?.id ? lastChangeByTimeline.get(tl.id) : undefined;
    const projectSteps = stepsByProject.get(p.id);
    const summary = computeProjectSummary({
      status: p.status,
      anchorStartDate: tl?.anchorStartDate ?? null,
      phases: (tl?.phases ?? []).map((ph) => ({
        id: ph.id,
        name: ph.name,
        status: ph.status,
        order: ph.order,
        durationWeeks: ph.durationWeeks,
        startWeek: ph.startWeek,
        actualStart: ph.actualStart,
        actualEnd: ph.actualEnd,
        tasks: ph.tasks.map((t) => ({
          id: t.id,
          status: t.status,
          weekIndex: t.weekIndex,
          actualStart: t.actualStart,
          actualEnd: t.actualEnd,
          needsValidation: t.needsValidation,
        })),
      })),
      baseline: activeBaseline
        ? {
            snapshot: activeBaseline.snapshot as unknown as BaselineSnapshot,
            firmnessLabel: (activeBaseline.firmness as { label?: string } | null)?.label ?? "WEAK",
          }
        : null,
      lastProgressAt: tl?.changes?.[0]?.createdAt ?? null,
      healthOverride: p.healthStatusOverride,
      lifecycle: toSummaryLifecycle(lifecycleByProject.get(p.id) ?? null),
      now,
    });
    return {
      projectId: p.id,
      projectName: p.name,
      clientId: p.clientId,
      clientName: p.client.name,
      clientCompany: p.client.company,
      cseName: (p.hubspotOwnerEmail ? cseNameByEmail.get(p.hubspotOwnerEmail.toLowerCase()) : undefined) ?? p.hubspotOwnerName,
      cseEmail: p.hubspotOwnerEmail,
      stageLabel: p.hubspotPipelineStageLabel,
      status: p.status,
      timelinePublished: !!p.timelinePublishedAt,
      createdAt: p.createdAt.toISOString(),
      summary,
      healthOverrideReason: p.healthStatusOverrideReason,
      healthOverrideAt: p.healthStatusOverrideAt?.toISOString() ?? null,
      healthOverrideBy: p.healthStatusOverrideBy,
      lastChange: lc
        ? { reason: lc.reason, kind: lc.kind, byEmail: lc.changedByEmail, at: lc.createdAt.toISOString() }
        : null,
      setup: deriveSetup({
        steps: projectSteps ?? new Set<string>(),
        hasActiveBaseline: !!activeBaseline,
        hasPhases: (tl?.phases?.length ?? 0) > 0,
        hasProcesos: clientsWithProcesos.has(p.clientId),
      }),
      lifecycle: lifecycleByProject.get(p.id) ?? null,
      healthProposed: p.healthProposed,
      healthProposedReason: p.healthProposedReason,
      healthProposedAt: p.healthProposedAt?.toISOString() ?? null,
    };
  });
}
