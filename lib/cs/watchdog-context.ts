/**
 * lib/cs/watchdog-context.ts
 *
 * Arma el CONTEXTO COMPACTO que recibe el watchdog de Éxito del cliente para
 * UN proyecto: resúmenes, nunca transcripts crudos. Todo determinístico — el
 * agente razona sobre esto y decide qué amerita alerta.
 */
import { prisma } from "@/lib/db/prisma";
import type { TimelineEvent, CsAlert } from "@prisma/client";
import { computeProjectSummary, type ProjectSummary } from "@/lib/portfolio/summary";
import { toSummaryLifecycle } from "@/lib/portfolio/load";
import { getProjectLifecycle, type ProjectLifecycle } from "@/lib/lifecycle";
import type { BaselineSnapshot } from "@/lib/timeline/baseline";
import { computePhaseRanges, addWeeks } from "@/lib/timeline/weeks";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WatchdogContext {
  clientId: string;
  projectId: string;
  /** Texto serializado listo para el mensaje del agente. */
  serialized: string;
  /** Resumen determinístico (para el pre-filtro del sweep y la evidencia). */
  summary: ProjectSummary | null;
  /** Ciclo de vida (etapa efectiva + propuesta de riesgo pendiente) — insumo del runner. */
  lifecycle: ProjectLifecycle | null;
}

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function serializeEvents(events: TimelineEvent[]): string {
  if (events.length === 0) return "(sin cambios nuevos del cronograma)";
  return events
    .map((e) => {
      const parts = [
        `[${fmtDate(e.createdAt)}]`,
        `${e.entityType} ${e.action}`,
        `"${e.label}"`,
        e.actorEmail ? `por ${e.actorEmail}` : null,
        `(${e.source})`,
        e.before ? `antes=${JSON.stringify(e.before)}` : null,
        e.after ? `después=${JSON.stringify(e.after)}` : null,
        e.entityId ? `id=${e.entityId}` : null,
        `eventId=${e.id}`,
      ].filter(Boolean);
      return `- ${parts.join(" ")}`;
    })
    .join("\n");
}

function serializeAlerts(alerts: CsAlert[]): string {
  if (alerts.length === 0) return "(ninguna)";
  return alerts
    .map((a) => `- [${a.status}] ${a.category}/${a.severity} "${a.title}" (fingerprint base del dedupeKey: ${a.dedupeKey})`)
    .join("\n");
}

/** Construye el contexto del watchdog. `events` = el batch YA reclamado por el run. */
export async function buildWatchdogContext(
  projectId: string,
  events: TimelineEvent[],
): Promise<WatchdogContext | null> {
  const now = new Date();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      clientId: true,
      status: true,
      serviceType: true,
      hubspotPipelineStageLabel: true,
      hubspotPriority: true,
      hubspotStatus: true,
      hubspotBlockReason: true,
      hubspotBlockDetail: true,
      hubspotAdoptionState: true,
      healthStatusOverride: true,
      healthStatusOverrideReason: true,
      healthProposed: true,
      healthProposedAt: true,
      client: { select: { name: true, industry: true } },
      timeline: {
        select: {
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
                  title: true,
                  status: true,
                  weekIndex: true,
                  type: true,
                  party: true,
                  actualStart: true,
                  actualEnd: true,
                  needsValidation: true,
                },
              },
            },
          },
          baselines: { where: { isActive: true }, take: 1, select: { snapshot: true, firmness: true, capturedAt: true } },
          changes: { where: { kind: "PROGRESS" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      },
    },
  });
  if (!project) return null;

  // ── Ciclo de vida (etapa efectiva) — modula qué alarmas aplican ─────────────
  const lifecycle = await getProjectLifecycle(projectId);

  // ── Resumen determinístico de salud (reuso del motor del panel) ─────────────
  const tl = project.timeline;
  const activeBaseline = tl?.baselines?.[0] ?? null;
  const summary = tl
    ? computeProjectSummary({
        status: project.status,
        anchorStartDate: tl.anchorStartDate ?? null,
        phases: tl.phases.map((ph) => ({
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
        lastProgressAt: tl.changes?.[0]?.createdAt ?? null,
        healthOverride: project.healthStatusOverride,
        lifecycle: toSummaryLifecycle(lifecycle),
        now,
      })
    : null;

  // ── Cruce de SESIONES: tareas SESSION vencidas y pendientes vs sesiones reales ──
  const sessionTasksOverdue: string[] = [];
  if (tl?.anchorStartDate && tl.phases.length > 0) {
    const anchorIso = tl.anchorStartDate.toISOString();
    const ordered = [...tl.phases].sort((a, b) => a.order - b.order);
    const ranges = computePhaseRanges(ordered);
    ordered.forEach((ph, i) => {
      for (const t of ph.tasks) {
        if (t.type !== "SESSION" || t.status !== "PENDING") continue;
        const plannedEnd = addWeeks(anchorIso, ranges[i].start + t.weekIndex + 1);
        if (plannedEnd.getTime() < now.getTime()) {
          sessionTasksOverdue.push(
            `- "${t.title}" (fase "${ph.name}", planificada para ${fmtDate(plannedEnd)}, sigue PENDING) taskId=${t.id}`,
          );
        }
      }
    });
  }

  // Sesiones REALES recientes del proyecto (fechas pasadas — hay sesiones con
  // fecha corrupta 2037+, anomalía conocida del sync).
  const recentSessions = await prisma.sessionProject.findMany({
    // included: las sesiones excluidas por humano no alimentan el contexto del watchdog
    where: { projectId, included: true, session: { date: { lte: now } } },
    orderBy: { session: { date: "desc" } },
    take: 5,
    select: {
      session: {
        select: {
          id: true,
          title: true,
          date: true,
          minute: { select: { summary: true, risks: true, decisions: true } },
        },
      },
    },
  });
  const sessionsBlock = recentSessions.length
    ? recentSessions
        .map((sp) => {
          const s = sp.session;
          const risks = Array.isArray(s.minute?.risks)
            ? (s.minute!.risks as Array<{ text?: string; severity?: string }>)
                .map((r) => `riesgo(${r.severity ?? "?"}): ${r.text ?? ""}`)
                .join(" · ")
            : "";
          return `- [${fmtDate(s.date)}] "${s.title}" sessionId=${s.id}${s.minute ? `\n  minuta: ${(s.minute.summary ?? "").slice(0, 400)}${risks ? `\n  ${risks}` : ""}` : ""}`;
        })
        .join("\n")
    : "(sin sesiones registradas)";

  // ActionItems vencidos y abiertos del proyecto.
  const overdueActions = await prisma.actionItem.findMany({
    where: { projectId, status: "PENDING", dueDate: { lt: now } },
    orderBy: { dueDate: "asc" },
    take: 10,
    select: { text: true, dueDate: true },
  });
  const actionsBlock = overdueActions.length
    ? overdueActions.map((a) => `- [venció ${fmtDate(a.dueDate)}] ${a.text.slice(0, 160)}`).join("\n")
    : "(sin acciones vencidas)";

  // ── Señales HubSpot del cliente (snapshot cacheado) ─────────────────────────
  const signals = await prisma.clientCsSignals.findUnique({
    where: { clientId: project.clientId },
    select: {
      fetchedAt: true,
      fetchStatus: true,
      lastEngagementAt: true,
      engagements90d: true,
      openTicketCount: true,
      ticketsSupported: true,
      nextRenewalCloseAt: true,
      openExpansionAmount: true,
      openDealCount: true,
      deals: true,
    },
  });
  const coldDays = signals?.lastEngagementAt
    ? Math.floor((now.getTime() - signals.lastEngagementAt.getTime()) / DAY_MS)
    : null;
  const dealsJson = signals?.deals as { renewals?: unknown[]; expansion?: unknown[] } | null;
  const signalsBlock = signals
    ? [
        `- Último contacto real con el cliente: ${fmtDate(signals.lastEngagementAt)}${coldDays !== null ? ` (hace ${coldDays} días)` : ""} · engagements últimos 90d: ${signals.engagements90d ?? "?"}`,
        `- Tickets de soporte: ${signals.ticketsSupported ? `${signals.openTicketCount ?? 0} abiertos` : "sin permiso de lectura (scope no autorizado)"}`,
        `- Renovación más próxima: ${fmtDate(signals.nextRenewalCloseAt)}${dealsJson?.renewals?.length ? ` — deals de renovación abiertos: ${JSON.stringify(dealsJson.renewals).slice(0, 600)}` : ""}`,
        `- Expansión abierta: $${signals.openExpansionAmount ?? 0}${dealsJson?.expansion?.length ? ` — deals: ${JSON.stringify(dealsJson.expansion).slice(0, 600)}` : ""} · deals abiertos totales: ${signals.openDealCount ?? 0}`,
        `- (snapshot HubSpot de ${fmtDate(signals.fetchedAt)}, estado ${signals.fetchStatus})`,
      ].join("\n")
    : "(sin snapshot de señales HubSpot para este cliente — omití las señales de HubSpot)";

  // ── Alertas existentes (no repetir) ────────────────────────────────────────
  // TODAS las del cliente (incluye proyectos hermanos): las categorías de CUENTA
  // (uso/renovación/frialdad) dedupean por cliente — el agente debe ver que el
  // hecho ya está alertado aunque haya nacido en otro proyecto.
  const existingAlerts = await prisma.csAlert.findMany({
    where: {
      clientId: project.clientId,
      OR: [
        { status: { in: ["OPEN", "SEEN"] } },
        { status: { in: ["RESOLVED", "DISMISSED"] }, updatedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      ],
    },
    orderBy: { lastDetectedAt: "desc" },
    take: 20,
  });

  // ── Cronograma resumido (fases + conteos, no el árbol entero) ───────────────
  const timelineBlock = tl
    ? tl.phases
        .map((ph) => {
          const done = ph.tasks.filter((t) => t.status === "DONE").length;
          const susp = ph.tasks.filter((t) => t.status === "SUSPENDED").length;
          return `- Fase "${ph.name}" [${ph.status}] ${ph.durationWeeks} sem · tareas ${done}/${ph.tasks.length} hechas${susp ? ` (${susp} suspendidas)` : ""} phaseId=${ph.id}`;
        })
        .join("\n")
    : "(sin cronograma)";

  const summaryBlock = summary
    ? [
        `- Avance: ${Math.round(summary.progress.pct * 100)}% (${summary.progress.tasksDone}/${summary.progress.tasksTotal} tareas · ${summary.progress.phasesDone}/${summary.progress.phasesTotal} fases)`,
        `- Fases vencidas: ${summary.overduePhases} · tareas vencidas: ${summary.overdueTasks}${summary.worstOverduePhase ? ` · peor: "${summary.worstOverduePhase.name}" (+${summary.worstOverduePhase.daysLate} días)` : ""}`,
        `- Estancado: ${summary.stalled ? `SÍ (${summary.daysSinceActivity ?? "?"} días sin actividad)` : "no"}`,
        `- Baseline: ${summary.hasBaseline ? (summary.weakBaseline ? "débil" : "firme") : "SIN baseline"}${summary.scope.measurable ? ` · alcance: +${summary.scope.addedPhases} fases, +${summary.scope.addedTasks} tareas, ${summary.scope.weeksDelta >= 0 ? "+" : ""}${summary.scope.weeksDelta} semanas${summary.scope.exceeded ? " (EXCEDIDO)" : ""}` : ""}`,
        `- Salud: ${summary.health.resolved} (${summary.health.source === "override" ? `fijada por humano${project.healthStatusOverrideReason ? `: "${project.healthStatusOverrideReason}"` : ""}` : "derivada"})`,
      ].join("\n")
    : "(sin cronograma → sin métricas de avance)";

  // ── Operativa del proyecto en HubSpot (0-970) ──────────────────────────────
  const hsOpsBlock = [
    `- Status: ${project.hubspotStatus ?? "(sin valor)"} · prioridad: ${project.hubspotPriority ?? "(sin valor)"} · estado de adopción (según CSE): ${project.hubspotAdoptionState ?? "(sin valor)"}`,
    project.hubspotBlockReason
      ? `- Motivo de bloqueo registrado: "${project.hubspotBlockReason}"${project.hubspotBlockDetail ? ` — detalle: ${project.hubspotBlockDetail.slice(0, 300)}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // ── Snapshot de PARTNER (uso/licencias/MRR/renovaciones — puede no existir) ──
  const partner = await prisma.clientPartnerSnapshot.findUnique({
    where: { clientId: project.clientId },
    select: {
      fetchedAt: true, uusScore: true, uusTrend: true, marketingScore: true, salesScore: true,
      serviceScore: true, seats: true, mrrTotal: true, mrrUpForRenewal: true, nextRenewalAt: true,
      cancellationHubs: true, revenueSignal: true, revenueSignalDetail: true,
      activationScore: true, toolUsageScore: true, valueMetricsScore: true, consumptionScore: true,
      marketingContactsUsed: true, marketingContactsLimit: true,
    },
  });
  const seatsJson = partner?.seats as Record<string, { assigned: number | null; available: number | null; limit: number | null }> | null;
  const unusedSeats = seatsJson
    ? Object.entries(seatsJson)
        .filter(([, v]) => (v?.available ?? 0) > 0)
        .map(([hub, v]) => `${hub}: ${v.available} sin asignar`)
        .join(" · ")
    : "";
  // Historial SEMANAL propio (PartnerUsageSnapshot): permite ver caídas de 2+
  // semanas consecutivas más allá de la tendencia agregada que reporta HubSpot.
  const usageHistory = partner
    ? await prisma.partnerUsageSnapshot.findMany({
        where: { clientId: project.clientId },
        orderBy: { weekKey: "desc" },
        take: 6,
        select: { weekKey: true, uusScore: true, consumptionScore: true, activationScore: true },
      })
    : [];
  const historyLine =
    usageHistory.length >= 2
      ? `- UUS semanal (reciente→viejo): ${usageHistory.map((h) => `${h.weekKey}: ${h.uusScore ?? "—"}`).join(" · ")}`
      : null;
  const partnerBlock = partner
    ? [
        `- Calificación de uso unificada (UUS): ${partner.uusScore ?? "sin dato"} · tendencia 4 semanas: ${partner.uusTrend ?? "sin dato"} (negativa = uso cayendo)`,
        historyLine,
        // Componentes del UUS: el portal NO los expone hoy (verificado 2026-07-10) —
        // la línea entra solo si HubSpot los agrega, para no meter ruido "—" al agente.
        partner.activationScore !== null || partner.toolUsageScore !== null ||
        partner.valueMetricsScore !== null || partner.consumptionScore !== null
          ? `- Componentes del UUS — Activación: ${partner.activationScore ?? "—"} (0 = no usó las herramientas core en los primeros 3 meses) · Uso de herramientas: ${partner.toolUsageScore ?? "—"} · Métricas de valor: ${partner.valueMetricsScore ?? "—"} · Consumo: ${partner.consumptionScore ?? "—"} (% de lo pagado que usa)`
          : null,
        partner.marketingContactsUsed !== null && partner.marketingContactsLimit
          ? `- Contactos de marketing: ${partner.marketingContactsUsed}/${partner.marketingContactsLimit} (${Math.round((partner.marketingContactsUsed / partner.marketingContactsLimit) * 100)}% del límite)`
          : null,
        `- Scores por hub — Marketing: ${partner.marketingScore ?? "—"} · Sales: ${partner.salesScore ?? "—"} · Service: ${partner.serviceScore ?? "—"}`,
        unusedSeats ? `- Licencias pagadas SIN asignar: ${unusedSeats}` : null,
        `- MRR total: ${partner.mrrTotal ?? "—"} · MRR por renovar: ${partner.mrrUpForRenewal ?? "—"} · próxima renovación: ${fmtDate(partner.nextRenewalAt)}`,
        partner.cancellationHubs ? `- ⚠ CANCELACIÓN PRÓXIMA registrada por HubSpot: ${partner.cancellationHubs}` : null,
        partner.revenueSignal ? `- Señal de ingresos: ${partner.revenueSignal}${partner.revenueSignalDetail ? ` — ${partner.revenueSignalDetail.replace(/<[^>]+>/g, " ").slice(0, 200)}` : ""}` : null,
        `- (snapshot de partner de ${fmtDate(partner.fetchedAt)})`,
      ]
        .filter(Boolean)
        .join("\n")
    : "(sin datos de partner — scope no autorizado o cuenta sin match; omití las señales de uso/licencias)";

  // ── Etapa del ciclo de vida (Nexus) — gobierna qué alarmas aplican ──────────
  const lifecycleBlock = lifecycle
    ? [
        `- Etapa: ${lifecycle.label} (${lifecycle.position.index}/${lifecycle.position.total} del ciclo ${lifecycle.cycle === "short" ? "corto" : "completo"}) · fuente: ${lifecycle.source === "override" ? `curada por humano${lifecycle.override?.reason ? ` — "${lifecycle.override.reason}"` : ""}` : "inferida"}`,
        `- Por qué: ${lifecycle.reasons.join(" · ")}`,
        `- Alarmas de cronograma vencido: ${summary?.scheduleAlarmsActive !== false ? "APLICAN (el cronograma está consensuado o la etapa es de ejecución)" : "NO APLICAN AÚN — el cronograma es tentativo (sin consensuar). NO emitas TIMELINE_OVERDUE; las señales de etapa temprana van como STAGE_STALLED."}`,
        summary?.stageAlarms.length
          ? `- Alarmas de etapa temprana activas: ${summary.stageAlarms.map((a) => a.label).join(" · ")}`
          : null,
        `- EN RIESGO PROPUESTO pendiente de confirmación del CSE: ${project.healthProposed ? `SÍ (desde ${fmtDate(project.healthProposedAt)}) — no dupliques el hecho` : "no"}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "(sin datos de ciclo de vida)";

  const serialized = [
    `PROYECTO: ${project.name} (projectId=${project.id})`,
    `CLIENTE: ${project.client.name}${project.client.industry ? ` · ${project.client.industry}` : ""} (clientId=${project.clientId})`,
    project.serviceType ? `SERVICIO: ${project.serviceType}` : null,
    `ETAPA EN PIPELINE CS DE HUBSPOT: ${project.hubspotPipelineStageLabel ?? "(sin etapa)"}`,
    "",
    "=== ETAPA DEL CICLO DE VIDA (Nexus — fuente de verdad de qué alarmas aplican) ===",
    lifecycleBlock,
    "",
    "=== OPERATIVA DEL PROYECTO EN HUBSPOT (status/prioridad/bloqueo/adopción) ===",
    hsOpsBlock,
    "",
    "=== USO Y SALUD COMERCIAL DE LA CUENTA (HubSpot Partner) ===",
    partnerBlock,
    "",
    "=== SALUD DETERMINÍSTICA DEL PROYECTO (motor del panel) ===",
    summaryBlock,
    "",
    "=== CRONOGRAMA (resumen por fase) ===",
    `Arranque: ${fmtDate(tl?.anchorStartDate)}${activeBaseline ? ` · baseline publicado el ${fmtDate(activeBaseline.capturedAt)}` : ""}`,
    timelineBlock,
    "",
    "=== CAMBIOS RECIENTES DEL CRONOGRAMA (eventos sin triage — el corazón de tu análisis) ===",
    serializeEvents(events),
    "",
    "=== SESIONES TIPO 'SESSION' VENCIDAS SIN EJECUTAR (candidatas a 'cliente atrasó sesión') ===",
    sessionTasksOverdue.length ? sessionTasksOverdue.join("\n") : "(ninguna)",
    "",
    "=== SESIONES REALES RECIENTES + MINUTAS (¿explican los cambios? ¿traen riesgos?) ===",
    sessionsBlock,
    "",
    "=== ACCIONES VENCIDAS ===",
    actionsBlock,
    "",
    "=== SEÑALES DE HUBSPOT DEL CLIENTE ===",
    signalsBlock,
    "",
    "=== ALERTAS YA EXISTENTES (NO las repitas; DISMISSED reciente = a la líder no le interesó) ===",
    serializeAlerts(existingAlerts),
  ]
    .filter((x) => x !== null)
    .join("\n");

  return { clientId: project.clientId, projectId, serialized, summary, lifecycle };
}
