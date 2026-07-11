/**
 * lib/cs/watchdog.ts
 *
 * RUNNER del watchdog de Éxito del cliente (agente "agent-cs-watchdog"):
 * tria los cambios del cronograma + sesiones + señales HubSpot de UN proyecto y
 * persiste alertas (CsAlert) para la líder de CS. NUNCA muta datos del proyecto:
 * una sola llamada a Claude sin tools; el runner solo escribe CsAlert, marca
 * eventos procesados y cierra el AgentRun. Best-effort en todos los disparos
 * automáticos (patrón regenerate-progress: un fallo queda en el run, no tumba nada).
 *
 * 3 vías de disparo (convergen en runWatchdogForProject):
 *  1. Debounce por eventos: proyectos con TimelineEvent sin procesar cuyo evento
 *     más nuevo tiene >15 min (batch "quiesced"). Claim atómico por updateMany.
 *  2. Sweep diario: pre-filtro determinístico (solo proyectos con algo nuevo).
 *  3. Manual: POST /api/cs/watchdog/run (funciona en dev, sin cron).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import type { CsAlertCategory, CsAlertSeverity } from "@prisma/client";
import { anthropic } from "@/lib/anthropic";
import { buildWatchdogContext } from "./watchdog-context";
import { claimDateKey } from "@/lib/jobs/registry";
import { crDateParts, WEEKDAYS_MON_FRI } from "@/lib/jobs/time";

const AGENT_ID = "agent-cs-watchdog";
const AGENT_SLUG = "cs-watchdog";
const DEBOUNCE_MS = 15 * 60 * 1000; // el batch debe estar "quieto" 15 min
const MAX_PROJECTS_PER_DEBOUNCE_TICK = 5;
const MAX_PROJECTS_PER_SWEEP = 10;
const COLD_DAYS_THRESHOLD = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

const STALE_CLAIM_MS = 30 * 60 * 1000; // claim sin cerrar en 30 min = run muerto → liberar
const MAX_ERROR_RUNS_PER_HOUR = 3; // backoff: proyecto con 3 runs ERROR/hora se saltea

// Mutex por proyecto EN PROCESO (server Node persistente): evita que manual +
// debounce/sweep solapados dupliquen alertas (el dedup findFirst→create no es
// atómico a propósito — dedupeKey no-unique para permitir reaparición post-RESOLVED).
// ⚠ NO coordina entre las 2 máquinas que comparten la DB: la convención operativa
// es que CS_WATCHDOG_ENABLED=1 esté prendido en UNA sola instancia (prod). Un
// disparo manual desde la otra PC en la misma ventana puede duplicar una alerta
// (se mergea al siguiente run por dedupeKey — daño acotado).
const projectLocks = new Map<string, Promise<unknown>>();

const CATEGORIES = new Set<string>([
  "TIMELINE_OVERDUE", "TASK_MODIFICATION", "SESSION_MISSED", "PIPELINE_MISMATCH",
  "ENGAGEMENT_COLD", "SUPPORT_TICKETS", "RENEWAL_RISK", "CHURN_RISK",
  "EXPANSION_OPPORTUNITY", "PROACTIVE_ACTION", "OTHER",
  // CS360:
  "ADOPTION_RISK", "LICENSE_UNUSED", "PROJECT_BLOCKED",
  // Ciclo de vida:
  "STAGE_STALLED",
]);
const LOW_UUS_THRESHOLD = 35; // score de uso bajo (0-100) — candidato si además renueva pronto

// Categorías de CUENTA (no de proyecto): el hecho es del cliente (uso, licencias,
// renovación, frialdad) — dedupean por clientId para que un cliente con 3 proyectos
// no genere 3 alertas idénticas.
const ACCOUNT_CATEGORIES = new Set<string>([
  "ADOPTION_RISK", "LICENSE_UNUSED", "RENEWAL_RISK", "CHURN_RISK",
  "ENGAGEMENT_COLD", "SUPPORT_TICKETS", "EXPANSION_OPPORTUNITY",
]);
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const sevRank = (s: string) => SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]);

export interface WatchdogRunResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  projectId: string;
  runId?: string;
  created?: number;
  merged?: number;
  suppressed?: number;
}

interface ParsedAlert {
  category: CsAlertCategory;
  severity: CsAlertSeverity;
  title: string;
  reason: string;
  suggestedAction: string | null;
  fingerprint: string;
  evidence: Record<string, unknown>;
}

/** Parsea la salida del agente. LANZA si el output es malformado (sin JSON, JSON
 *  inválido o sin array `alerts`) — distinto de un `alerts: []` genuino — para que
 *  el catch libere el claim y el batch se reintente en vez de consumirse sin triage. */
function parseAlerts(rawText: string): ParsedAlert[] {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("output del agente sin JSON");
  let parsed: { alerts?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { alerts?: unknown };
  } catch {
    throw new Error("output del agente con JSON inválido");
  }
  if (!Array.isArray(parsed.alerts)) throw new Error("output del agente sin array `alerts`");
  const out: ParsedAlert[] = [];
  for (const raw of parsed.alerts) {
    const a = raw as Record<string, unknown>;
    const category = typeof a.category === "string" && CATEGORIES.has(a.category) ? a.category : null;
    const severity = typeof a.severity === "string" && sevRank(a.severity) >= 0 ? a.severity : null;
    const title = typeof a.title === "string" ? a.title.trim().slice(0, 140) : "";
    const reason = typeof a.reason === "string" ? a.reason.trim() : "";
    if (!category || !severity || !title || !reason) continue; // alerta malformada → se descarta
    const fingerprint =
      typeof a.fingerprint === "string" && a.fingerprint.trim()
        ? a.fingerprint.trim().slice(0, 120)
        : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    out.push({
      category: category as CsAlertCategory,
      severity: severity as CsAlertSeverity,
      title,
      reason,
      suggestedAction: typeof a.suggestedAction === "string" && a.suggestedAction.trim() ? a.suggestedAction.trim() : null,
      fingerprint,
      evidence: a.evidence && typeof a.evidence === "object" && !Array.isArray(a.evidence) ? (a.evidence as Record<string, unknown>) : {},
    });
  }
  return out.slice(0, 6); // techo duro por si el agente desobedece el máx del prompt
}

/** Corre el watchdog para UN proyecto. `trigger` es informativo (stepLabel).
 *  Serializado por proyecto vía mutex en-proceso: un manual + debounce/sweep
 *  solapados corren uno tras otro, así el segundo VE las alertas del primero
 *  y el dedup mergea en vez de duplicar. */
export async function runWatchdogForProject(
  projectId: string,
  trigger: "debounce" | "sweep" | "manual",
): Promise<WatchdogRunResult> {
  const prev = projectLocks.get(projectId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => runForProjectInner(projectId, trigger));
  projectLocks.set(projectId, next);
  try {
    return await next;
  } finally {
    if (projectLocks.get(projectId) === next) projectLocks.delete(projectId);
  }
}

async function runForProjectInner(
  projectId: string,
  trigger: "debounce" | "sweep" | "manual",
): Promise<WatchdogRunResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, healthStatusOverride: true, healthProposed: true },
  });
  if (!project) return { status: "skipped", reason: "no_project", projectId };

  const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID }, select: { systemPrompt: true } });
  if (!agent) return { status: "skipped", reason: "agent_not_seeded", projectId };

  // AgentRun primero: su id es el token del claim de eventos.
  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID,
      agentSlug: AGENT_SLUG,
      clientId: project.clientId,
      projectId,
      status: "RUNNING",
      stepLabel: `Watchdog CS (${trigger})`,
    },
    select: { id: true },
  });

  // Claim atómico del batch de eventos sin procesar (puede ser 0 — el sweep y el
  // manual corren igual: hay señales que no dependen de eventos). En debounce el
  // claim respeta el cutoff de quiescencia: eventos creados DESPUÉS del check
  // (sesión de edición aún en curso) quedan para el próximo tick.
  const claimCutoff = trigger === "debounce" ? new Date(Date.now() - DEBOUNCE_MS) : null;
  await prisma.timelineEvent.updateMany({
    where: {
      projectId,
      processedAt: null,
      processedByRunId: null,
      ...(claimCutoff ? { createdAt: { lt: claimCutoff } } : {}),
    },
    data: { processedByRunId: run.id },
  });
  const events = await prisma.timelineEvent.findMany({
    where: { projectId, processedByRunId: run.id, processedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (trigger === "debounce" && events.length === 0) {
    // Otro proceso ganó el claim — abortar sin ruido.
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ARCHIVED", output: "claim perdido" } });
    return { status: "skipped", reason: "claim_lost", projectId, runId: run.id };
  }

  try {
    const ctx = await buildWatchdogContext(projectId, events);
    if (!ctx) throw new Error("no se pudo armar el contexto");

    // ── EN_RIESGO propuesto→confirmado (determinista, NO lo decide el LLM) ────
    // riskCandidate = las señales duras que antes derivaban EN_RIESGO directo
    // (fases vencidas / estancado, con las alarmas de cronograma APLICANDO).
    // El sistema PROPONE (Project.healthProposed) y el CSE confirma/descarta en
    // /health-proposal. Si la señal desaparece, la propuesta caduca sola acá.
    const s = ctx.summary;
    if (s) {
      if (s.riskCandidate && !project.healthStatusOverride && !project.healthProposed) {
        const parts = [
          s.overduePhases > 0
            ? `${s.overduePhases} fase(s) vencida(s)${s.worstOverduePhase ? ` — peor: "${s.worstOverduePhase.name}" (+${s.worstOverduePhase.daysLate}d)` : ""}`
            : null,
          s.stalled ? `sin avance hace ${s.daysSinceActivity ?? "?"} días` : null,
        ].filter(Boolean);
        await prisma.project.update({
          where: { id: projectId },
          data: {
            healthProposed: "EN_RIESGO",
            healthProposedReason: parts.join(" · ") || "señales duras del cronograma",
            healthProposedAt: new Date(),
            healthProposedByRunId: run.id,
          },
        });
      } else if (!s.riskCandidate && project.healthProposed) {
        await prisma.project.update({
          where: { id: projectId },
          data: { healthProposed: null, healthProposedReason: null, healthProposedAt: null, healthProposedByRunId: null },
        });
      }
    }

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: agent.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${ctx.serialized}\n\nTriá este proyecto según tus instrucciones. Devolvé SOLO el JSON.`,
        },
      ],
    });
    if (msg.stop_reason === "max_tokens") throw new Error("output del agente truncado (max_tokens)");
    const rawText = msg.content
      .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
      .join("")
      .trim();
    const alerts = parseAlerts(rawText);

    // ── Dedup + persistencia (el runner es el único escritor de CsAlert) ──────
    const now = new Date();
    let created = 0;
    let merged = 0;
    let suppressed = 0;
    for (const a of alerts) {
      // Hechos de CUENTA dedupean por cliente (multi-proyecto no duplica);
      // hechos de PROYECTO (cronograma/tareas/pipeline) por proyecto.
      const scopeId = ACCOUNT_CATEGORIES.has(a.category) ? project.clientId : projectId;
      const dedupeKey = `${scopeId}:${a.category}:${a.fingerprint}`;

      const existing = await prisma.csAlert.findFirst({
        where: { dedupeKey },
        orderBy: { lastDetectedAt: "desc" },
      });
      if (existing && (existing.status === "OPEN" || existing.status === "SEEN")) {
        // Re-detección del mismo hecho → actualizar, no duplicar. La severidad
        // solo ESCALA (nunca baja sola); razón/acción se refrescan a lo último.
        await prisma.csAlert.update({
          where: { id: existing.id },
          data: {
            occurrences: { increment: 1 },
            lastDetectedAt: now,
            reason: a.reason,
            suggestedAction: a.suggestedAction,
            severity: sevRank(a.severity) > sevRank(existing.severity) ? a.severity : existing.severity,
            evidence: a.evidence as Prisma.InputJsonValue,
            agentRunId: run.id,
          },
        });
        merged++;
        continue;
      }
      if (
        existing &&
        (existing.status === "RESOLVED" || existing.status === "DISMISSED") &&
        existing.updatedAt.getTime() > now.getTime() - 7 * DAY_MS
      ) {
        // La líder lo resolvió/descartó hace poco → no insistir.
        suppressed++;
        continue;
      }
      await prisma.csAlert.create({
        data: {
          clientId: project.clientId,
          projectId,
          severity: a.severity,
          category: a.category,
          title: a.title,
          reason: a.reason,
          suggestedAction: a.suggestedAction,
          evidence: a.evidence as Prisma.InputJsonValue,
          dedupeKey,
          agentRunId: run.id,
        },
      });
      created++;
    }

    // Cerrar: eventos procesados + run DONE.
    await prisma.timelineEvent.updateMany({
      where: { processedByRunId: run.id, processedAt: null },
      data: { processedAt: now },
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify({ alerts, created, merged, suppressed }) },
    });
    console.log(
      `[cs-watchdog] ✓ project ${projectId} (${trigger}): ${events.length} eventos → ${created} alertas nuevas, ${merged} actualizadas, ${suppressed} suprimidas (run ${run.id})`,
    );
    return { status: "ok", projectId, runId: run.id, created, merged, suppressed };
  } catch (e) {
    // Liberar el claim (los eventos vuelven a la cola) y dejar el error trazado.
    await prisma.timelineEvent
      .updateMany({ where: { processedByRunId: run.id, processedAt: null }, data: { processedByRunId: null } })
      .catch(() => {});
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: e instanceof Error ? e.message : "error" } })
      .catch(() => {});
    console.error(`[cs-watchdog] ✗ project ${projectId}:`, e instanceof Error ? e.message : e);
    return { status: "error", reason: e instanceof Error ? e.message : "error", projectId, runId: run.id };
  }
}

/** Kill-switch en DB (CsSettings.watchdogEnabled) — gobierna los disparos AUTOMÁTICOS. */
export async function watchdogEnabled(): Promise<boolean> {
  const settings = await prisma.csSettings.findUnique({ where: { id: "cs" }, select: { watchdogEnabled: true } });
  return settings?.watchdogEnabled ?? true; // sin fila = habilitado (el env ya gatea)
}

/** REAPER de claims huérfanos: un run que murió a mitad de vuelo (crash del proceso,
 *  restart de deploy) deja eventos con processedByRunId seteado y processedAt null —
 *  sin esto quedan fuera de la cola PARA SIEMPRE (debounce y sweep filtran
 *  processedByRunId: null). Libera claims cuyo run ya no está RUNNING o lleva
 *  >30 min corriendo (y marca ese run como ERROR). */
export async function reclaimStaleClaims(now: Date): Promise<void> {
  const claimed = await prisma.timelineEvent.groupBy({
    by: ["processedByRunId"],
    where: { processedAt: null, processedByRunId: { not: null } },
  });
  if (claimed.length === 0) return;
  const runIds = claimed.map((g) => g.processedByRunId as string);
  const runs = await prisma.agentRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true, status: true, createdAt: true },
  });
  const byId = new Map(runs.map((r) => [r.id, r]));
  for (const runId of runIds) {
    const run = byId.get(runId);
    const aliveAndFresh =
      run?.status === "RUNNING" && run.createdAt.getTime() > now.getTime() - STALE_CLAIM_MS;
    if (aliveAndFresh) continue; // run legítimo en vuelo — no tocar
    await prisma.timelineEvent.updateMany({
      where: { processedByRunId: runId, processedAt: null },
      data: { processedByRunId: null },
    });
    if (run?.status === "RUNNING") {
      await prisma.agentRun
        .update({ where: { id: runId }, data: { status: "ERROR", output: "claim vencido (>30 min): liberado por el reaper" } })
        .catch(() => {});
    }
    console.warn(
      `[cs-watchdog] reaper: claim del run ${runId} liberado (${run ? `status ${run.status}` : "run inexistente"})`,
    );
  }
}

/** Runs colgados de OTROS agentes CS sin claim de eventos (hoy: el brief de cuenta)
 *  — si el proceso murió a mitad de la generación quedan RUNNING para siempre. */
async function reapStaleCsRuns(now: Date): Promise<void> {
  const marked = await prisma.agentRun.updateMany({
    where: {
      agentSlug: "cs-account-brief",
      status: "RUNNING",
      createdAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
    },
    data: { status: "ERROR", output: "run colgado (>30 min): marcado por el reaper" },
  });
  if (marked.count > 0) console.warn(`[cs-watchdog] reaper: ${marked.count} run(s) de brief colgados marcados ERROR`);
}

/** ¿El proyecto viene fallando seguido? → saltearlo este tick (backoff barato:
 *  sin esto un fallo persistente reintenta cada 60s = gasto de tokens sin freno). */
async function inErrorBackoff(projectId: string, now: Date): Promise<boolean> {
  const recentErrors = await prisma.agentRun.count({
    where: {
      agentSlug: AGENT_SLUG,
      projectId,
      status: "ERROR",
      createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
  });
  return recentErrors >= MAX_ERROR_RUNS_PER_HOUR;
}

/** Tick de DEBOUNCE: proyectos con eventos sin procesar cuyo evento MÁS NUEVO
 *  tiene >15 min (el CSE terminó de editar) → triage del batch completo. */
export async function runWatchdogDebounceTick(now: Date): Promise<void> {
  if (!(await watchdogEnabled())) return;
  await reclaimStaleClaims(now).catch((e) => {
    console.error("[cs-watchdog] reaper falló:", e instanceof Error ? e.message : e);
  });
  await reapStaleCsRuns(now).catch(() => {});
  const groups = await prisma.timelineEvent.groupBy({
    by: ["projectId"],
    where: { processedAt: null, processedByRunId: null },
    _max: { createdAt: true },
  });
  const quiesced = groups
    .filter((g) => g._max.createdAt && g._max.createdAt.getTime() < now.getTime() - DEBOUNCE_MS)
    .slice(0, MAX_PROJECTS_PER_DEBOUNCE_TICK);
  for (const g of quiesced) {
    if (await inErrorBackoff(g.projectId, now)) {
      console.warn(`[cs-watchdog] project ${g.projectId} en backoff (≥${MAX_ERROR_RUNS_PER_HOUR} errores/hora) — se saltea este tick`);
      continue;
    }
    await runWatchdogForProject(g.projectId, "debounce");
  }
}

/** SWEEP diario (L–V 7:00 CR): pre-filtro DETERMINÍSTICO para no quemar tokens —
 *  solo van al agente los proyectos con algo nuevo que triar. */
export async function runWatchdogSweep(now: Date): Promise<{ candidates: number; ran: number }> {
  const { loadPortfolio } = await import("@/lib/portfolio/load");
  // Mismo criterio que el panel (accessibleClientWhere de roles see-all): los
  // prospectos de Ventas no son clientes reales — sin esto el sweep les crearía
  // alertas que la cartera nunca muestra.
  const rows = await loadPortfolio({ isProspect: false });

  // Señales por cliente (para candidatos por frialdad/renovación/tickets).
  const signals = await prisma.clientCsSignals.findMany({
    select: { clientId: true, lastEngagementAt: true, openTicketCount: true, nextRenewalCloseAt: true },
  });
  const signalsByClient = new Map(signals.map((s) => [s.clientId, s]));

  // CS360 — operativa HubSpot por proyecto (status/bloqueo) + partner por cliente
  // (uso/licencias/renovación): candidatos nuevos del pre-filtro determinístico.
  const opsRows = await prisma.project.findMany({
    where: { id: { in: rows.map((r) => r.projectId) } },
    select: { id: true, hubspotStatus: true, hubspotBlockReason: true },
  });
  const opsByProject = new Map(opsRows.map((o) => [o.id, o]));
  const partnerRows = await prisma.clientPartnerSnapshot.findMany({
    where: { clientId: { not: null } },
    select: { clientId: true, uusScore: true, uusTrend: true, seats: true, nextRenewalAt: true, cancellationHubs: true, revenueSignal: true },
  });
  const partnerByClient = new Map(partnerRows.map((p) => [p.clientId as string, p]));

  // Proyectos con eventos pendientes (cualquier antigüedad — el sweep los barre).
  const pendingEvents = await prisma.timelineEvent.groupBy({
    by: ["projectId"],
    where: { processedAt: null, processedByRunId: null },
  });
  const withEvents = new Set(pendingEvents.map((g) => g.projectId));

  // Alertas OPEN por proyecto (un proyecto ya alertado y sin cambios no se re-tría).
  const openAlerts = await prisma.csAlert.findMany({
    where: { status: { in: ["OPEN", "SEEN"] }, projectId: { not: null } },
    select: { projectId: true },
  });
  const alerted = new Set(openAlerts.map((a) => a.projectId as string));

  // ROTACIÓN del cap: un candidato "por riesgo" que ya fue triado hoy (run DONE
  // <20h) cede su slot — sin esto, riesgos persistentes que no producen alerta
  // OPEN ocupan los 10 slots todos los días y el resto se muere de inanición.
  const ranToday = await prisma.agentRun.findMany({
    where: {
      agentSlug: AGENT_SLUG,
      status: "DONE",
      projectId: { not: null },
      createdAt: { gt: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
    },
    select: { projectId: true },
  });
  const triagedToday = new Set(ranToday.map((r) => r.projectId as string));

  const candidates: string[] = [];
  for (const row of rows) {
    if (row.status !== "active") continue;
    const s = row.summary;
    const sig = signalsByClient.get(row.clientId);
    const ops = opsByProject.get(row.projectId);
    const partner = partnerByClient.get(row.clientId);
    const coldDays = sig?.lastEngagementAt
      ? (now.getTime() - sig.lastEngagementAt.getTime()) / DAY_MS
      : null;
    // Ventana con piso: un nextRenewalAt en el PASADO (snapshot stale) no cuenta
    // como "renovación próxima" para siempre.
    const partnerRenewalSoon =
      !!partner?.nextRenewalAt &&
      partner.nextRenewalAt.getTime() < now.getTime() + 90 * DAY_MS &&
      partner.nextRenewalAt.getTime() > now.getTime() - 7 * DAY_MS;
    const renewalSoon =
      (!!sig?.nextRenewalCloseAt && sig.nextRenewalCloseAt.getTime() < now.getTime() + 90 * DAY_MS) ||
      partnerRenewalSoon;
    // CS360 — riesgo según HubSpot: bloqueado/atrasado explícito; uso bajo o cayendo
    // con renovación cerca; licencias pagadas sin asignar con renovación cerca;
    // cancelación registrada.
    const hsBlocked =
      ["blocked", "delayed", "at_risk", "on_hold"].includes(ops?.hubspotStatus ?? "") ||
      !!ops?.hubspotBlockReason;
    const seatsJson = partner?.seats as Record<string, { available: number | null }> | null | undefined;
    const hasUnusedSeats = !!seatsJson && Object.values(seatsJson).some((v) => (v?.available ?? 0) > 0);
    const uusLowOrFalling =
      (partner?.uusScore !== null && partner?.uusScore !== undefined && partner.uusScore < LOW_UUS_THRESHOLD) ||
      (typeof partner?.uusTrend === "number" && partner.uusTrend < -0.05);
    const partnerRisk =
      hsBlocked ||
      !!partner?.cancellationHubs ||
      // Señal de ingresos de HubSpot (upsell/cross-sell/renovación de competidor…):
      // antes vivía solo en el CONTEXTO del agente — un cliente cuya única novedad
      // fuera la señal nunca se volvía candidato. El dedup (alerted/triagedToday +
      // categorías de cuenta por cliente) evita que dispare todos los días.
      !!partner?.revenueSignal ||
      (uusLowOrFalling && renewalSoon) ||
      (hasUnusedSeats && partnerRenewalSoon);
    // Ciclo de vida: los atrasos/estancamiento del cronograma solo son riesgo cuando
    // las alarmas de cronograma APLICAN (etapa >= configuración técnica). En etapas
    // tempranas el candidato viene de las alarmas de etapa (kickoff sin publicar, etc.).
    const scheduleRisk =
      s.scheduleAlarmsActive && (s.overduePhases > 0 || s.overdueTasks > 0 || s.stalled);
    const earlyStageRisk = s.stageAlarms.length > 0;
    const hasRisk =
      scheduleRisk || earlyStageRisk || s.scope.exceeded ||
      (coldDays !== null && coldDays > COLD_DAYS_THRESHOLD) ||
      (sig?.openTicketCount ?? 0) > 0 || renewalSoon || partnerRisk;
    const hasNews =
      withEvents.has(row.projectId) ||
      (hasRisk && !alerted.has(row.projectId) && !triagedToday.has(row.projectId));
    if (hasNews) candidates.push(row.projectId);
  }

  // Con eventos primero (lo más fresco), después los de riesgo.
  const toRun = candidates
    .sort((a, b) => Number(withEvents.has(b)) - Number(withEvents.has(a)))
    .slice(0, MAX_PROJECTS_PER_SWEEP);
  for (const projectId of toRun) {
    await runWatchdogForProject(projectId, "sweep");
  }
  if (candidates.length > toRun.length) {
    console.log(`[cs-watchdog] sweep: ${candidates.length - toRun.length} candidatos quedaron fuera del cap (${MAX_PROJECTS_PER_SWEEP}) — entran en el próximo sweep`);
  }
  return { candidates: candidates.length, ran: toRun.length };
}

/** Jobs del scheduler (se registran en lib/jobs/defs.ts). */
export const watchdogJobs = {
  daily: {
    key: "cs-watchdog-daily",
    shouldRun: (_now: Date, parts: { weekday: string; hour: number }) =>
      WEEKDAYS_MON_FRI.has(parts.weekday) && parts.hour >= 7,
    run: async (now: Date) => {
      if (!(await watchdogEnabled())) return;
      const { dateKey } = crDateParts(now);
      if (!(await claimDateKey("cs-watchdog-daily", dateKey, now))) return;
      const r = await runWatchdogSweep(now);
      console.log(`[jobs/cs-watchdog] sweep ${dateKey}: ${r.ran}/${r.candidates} proyectos triados`);
    },
  },
  debounce: {
    key: "cs-watchdog-debounce",
    shouldRun: () => true, // el claim real es por-eventos (updateMany) dentro del tick
    run: runWatchdogDebounceTick,
  },
};
