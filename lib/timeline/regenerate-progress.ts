/**
 * lib/timeline/regenerate-progress.ts
 *
 * D.2 — CRONOGRAMA VIVO. Detecta el avance real de un proyecto en curso y lo
 * guarda como BORRADOR (ProjectTimeline.pendingProgress). NO escribe status: el
 * CSE confirma (timeline/progress/apply). Self-contained y server-callable
 * (espejo del patrón de lib/sessions/post-process.ts): lo dispara
 * postProcessSession tras cada sesión nueva, y el endpoint manual de regeneración.
 *
 * Cruza 3 fuentes en orden de prioridad (decisión locked): etapa de HubSpot
 * (ancla, revalidada en vivo) → sesiones pasadas → handoff. El agente infiere el
 * mapeo etapa→fase. Best-effort: cualquier fallo devuelve { skipped, reason } sin
 * lanzar (no debe tumbar el post-process que lo llama).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { anthropic } from "@/lib/anthropic";
import { getProjectStage } from "@/lib/hubspot/stage";
import { getPastSessionsForProject } from "@/lib/sessions/project-sessions";
import { loadCanvasContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";

const AGENT_ID_PROGRESS = "agent-timeline-progress";

export interface ProgressResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  projectId: string;
  runId?: string;
  phasesDone?: number;
  tasksDone?: number;
  currentPhaseId?: string | null;
  /** Para el toast del re-chequeo: fecha + área (Ventas/CSE) de la última sesión usada. */
  lastSessionDate?: string | null;
  lastSessionArea?: string | null;
}

interface ProgressOutput {
  progress?: {
    currentPhaseId?: string | null;
    reasoning?: string;
    phases?: Array<{ id?: string; done?: boolean }>;
    tasks?: Array<{ id?: string; done?: boolean }>;
  };
}

/**
 * Regenera el borrador de avance del cronograma de un proyecto. Requiere que el
 * cronograma EXISTA y tenga DETALLE (≥1 tarea) — el avance se mapea sobre el
 * detalle. Si no hay detalle, no hace nada (el detalle se genera por su flujo).
 */
export async function regenerateTimelineProgress(
  projectId: string,
  opts: { asOfSessionId?: string } = {},
): Promise<ProgressResult> {
  try {
    // 1. Proyecto + timeline con fases/tareas (estado confirmado = base)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        clientId: true,
        name: true,
        serviceType: true,
        hubspotServiceId: true,
        hubspotPipelineStageLabel: true,
        client: { select: { name: true, industry: true } },
        timeline: {
          select: {
            id: true,
            phases: {
              select: { id: true, status: true, tasks: { select: { id: true, status: true } } },
            },
          },
        },
      },
    });
    if (!project) return { status: "skipped", reason: "no_project", projectId };
    if (!project.timeline || project.timeline.phases.length === 0) {
      return { status: "skipped", reason: "no_timeline", projectId };
    }
    const taskCount = project.timeline.phases.reduce((n, p) => n + p.tasks.length, 0);
    if (taskCount === 0) return { status: "skipped", reason: "no_detail", projectId };

    // Mapas para validar ids del output + filtrar lo que YA está DONE (no re-proponer).
    const phaseStatus = new Map(project.timeline.phases.map((p) => [p.id, p.status]));
    const taskStatus = new Map<string, string>();
    for (const p of project.timeline.phases) for (const t of p.tasks) taskStatus.set(t.id, t.status);

    // 2. Revalidar la etapa de HubSpot en vivo (híbrido); fallback al materializado.
    let stageLabel = project.hubspotPipelineStageLabel ?? null;
    if (project.hubspotServiceId) {
      const live = await getProjectStage(project.hubspotServiceId);
      if (live) {
        stageLabel = live.label;
        await prisma.project.update({
          where: { id: projectId },
          data: {
            hubspotPipelineStageId: live.stageId,
            hubspotPipelineStageLabel: live.label,
            hubspotStageSyncedAt: new Date(),
          },
        }).catch(() => { /* best-effort: no romper si falla el update */ });
      }
    }

    // 3. Contexto: sesiones pasadas + handoff + cronograma con avance confirmado.
    const [pastSessions, handoffCtx, timelineCtx] = await Promise.all([
      getPastSessionsForProject(projectId),
      loadCanvasContext(projectId, "Handoff", { onlyConfirmed: true }),
      loadTimelineContext(projectId, { includeProgress: true }),
    ]);
    const sessionsBlock = pastSessions
      .map((s) => `[${s.date.toISOString().slice(0, 10)}] ${s.content ?? `Sesión "${s.title}" (sin transcript disponible)`}`)
      .join("\n\n---\n\n");

    // Info de la última sesión usada → para el toast del re-chequeo ("según las sesiones
    // de Ventas/CSE del <fecha>"). El área sale de los participantes INTERNOS.
    const team = await prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } });
    const { salesEmails, cseEmails } = classifyTeamEmailsByArea(team);
    const latestSession = pastSessions.length ? pastSessions[pastSessions.length - 1] : null;
    const lastSessionDate = latestSession ? latestSession.date.toISOString() : null;
    const lastSessionArea = (() => {
      if (!latestSession) return null;
      const emails = latestSession.participants.map((e) => e.toLowerCase());
      const hasSales = emails.some((e) => salesEmails.has(e));
      const hasCse = emails.some((e) => cseEmails.has(e));
      if (hasSales && hasCse) return "Ventas y CSE";
      if (hasSales) return "Ventas";
      if (hasCse) return "CSE";
      return null;
    })();

    // 4. Prompt del agente
    const agent = await prisma.agent.findUnique({
      where: { id: AGENT_ID_PROGRESS },
      select: { systemPrompt: true },
    });
    if (!agent) return { status: "skipped", reason: "agent_not_seeded", projectId };

    const userMessage = [
      `Empresa: ${project.client.name}`,
      project.client.industry ? `Industria: ${project.client.industry}` : null,
      project.serviceType ? `Servicio: ${project.serviceType}` : null,
      "",
      "=== ETAPA ACTUAL EN HUBSPOT (ANCLA #1 — manda la posición) ===",
      stageLabel ? stageLabel : "(sin etapa de HubSpot disponible — inferí el avance solo desde las sesiones y el handoff)",
      "",
      "=== SESIONES PASADAS DEL PROYECTO (detallan qué se hizo) ===",
      sessionsBlock || "(sin sesiones pasadas registradas)",
      "",
      "=== HANDOFF CURADO (alcance del proyecto) ===",
      handoffCtx || "(sin handoff confirmado)",
      "",
      timelineCtx,
      "",
      "Detectá el avance real siguiendo tus instrucciones: ubicá el currentPhaseId, marcá las fases completadas y las tareas hechas. Usá ids EXACTOS. No re-propongas lo que ya está DONE. Sé conservador.",
    ]
      .filter((x) => x !== null)
      .join("\n");

    // 5. Claude
    let rawText: string;
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: agent.systemPrompt ?? "",
        messages: [{ role: "user", content: userMessage }],
      });
      rawText = (msg.content[0] as { type: string; text: string }).text.trim();
    } catch (e) {
      return { status: "error", reason: `Claude error: ${(e as Error).message}`, projectId };
    }

    // 6. Parsear + validar
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { status: "error", reason: "no_json", projectId };
    let parsed: ProgressOutput;
    try {
      parsed = JSON.parse(jsonMatch[0]) as ProgressOutput;
    } catch (e) {
      return { status: "error", reason: `json_parse: ${(e as Error).message}`, projectId };
    }
    const prog = parsed.progress ?? {};

    // currentPhaseId debe ser una fase existente (o null).
    const currentPhaseId =
      typeof prog.currentPhaseId === "string" && phaseStatus.has(prog.currentPhaseId)
        ? prog.currentPhaseId
        : null;

    // Fases que el agente marca completas (válidas, no ya DONE) — la PROPUESTA de avance.
    const phasesDone = (prog.phases ?? [])
      .filter((p) => p?.done === true && typeof p.id === "string" && phaseStatus.has(p.id) && phaseStatus.get(p.id) !== "DONE")
      .map((p) => ({ id: p.id as string, done: true }));
    // Ids de tareas que el agente infirió hechas (válidas, no ya DONE).
    const inferredDone = new Set(
      (prog.tasks ?? [])
        .filter((t) => t?.done === true && typeof t.id === "string" && taskStatus.has(t.id) && taskStatus.get(t.id) !== "DONE")
        .map((t) => t.id as string),
    );

    // ¿Hay algo que proponer? (nuevo done, o un "hoy" que no es la fase ya IN_PROGRESS)
    const currentIsNew = currentPhaseId !== null && phaseStatus.get(currentPhaseId) !== "IN_PROGRESS";
    if (phasesDone.length === 0 && inferredDone.size === 0 && !currentIsNew) {
      return { status: "skipped", reason: "no_progress_detected", projectId, currentPhaseId, lastSessionDate, lastSessionArea };
    }

    // D — el banner confirma tarea-por-tarea: pendingProgress.tasks lleva TODAS las tareas
    // NO-DONE de las fases en juego (las que el agente cierra + el "hoy"), con `done` pre-seteado
    // por inferencia. Así el CSE resuelve cada una (hecha/suspendida) y E puede cerrar la fase.
    const phasesInPlay = new Set<string>([
      ...phasesDone.map((p) => p.id),
      ...(currentPhaseId ? [currentPhaseId] : []),
    ]);
    const tasksDraft: Array<{ id: string; done: boolean }> = [];
    for (const ph of project.timeline.phases) {
      if (!phasesInPlay.has(ph.id)) continue;
      for (const t of ph.tasks) {
        if (t.status === "DONE") continue; // ya hecha, no re-proponer
        tasksDraft.push({ id: t.id, done: inferredDone.has(t.id) });
      }
    }

    // 7. AgentRun (trazabilidad) + persistir el borrador (reemplaza el anterior).
    const run = await prisma.agentRun.create({
      data: {
        agentId: AGENT_ID_PROGRESS,
        clientId: project.clientId,
        projectId,
        status: "DONE",
        stepLabel: "Avance de cronograma",
        output: JSON.stringify(parsed),
      },
    });

    const pendingProgress = {
      currentPhaseId,
      asOfSessionId: opts.asOfSessionId ?? null,
      reasoning: typeof prog.reasoning === "string" ? prog.reasoning : "",
      phases: phasesDone,
      tasks: tasksDraft,
    };

    await prisma.projectTimeline.update({
      where: { projectId },
      data: {
        pendingProgress: pendingProgress as Prisma.InputJsonValue,
        pendingProgressRunId: run.id,
      },
    });

    console.log(
      `[timeline-progress] ✓ borrador de avance para project ${projectId}: ${phasesDone.length} fases, ${inferredDone.size} tareas hechas (${tasksDraft.length} a confirmar), hoy=${currentPhaseId ?? "—"} (run ${run.id})`,
    );
    return {
      status: "ok",
      projectId,
      runId: run.id,
      phasesDone: phasesDone.length,
      tasksDone: inferredDone.size,
      currentPhaseId,
      lastSessionDate,
      lastSessionArea,
    };
  } catch (e) {
    console.error(`[timeline-progress] error inesperado para project ${projectId}:`, e instanceof Error ? e.message : e);
    return { status: "error", reason: "unexpected", projectId };
  }
}
