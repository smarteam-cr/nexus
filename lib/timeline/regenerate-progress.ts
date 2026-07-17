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

// Estado TERMINAL decidido por un humano: DONE (hecha) o SUSPENDED (aparcada/descartada, no se
// ejecutó). Ambos son resoluciones humanas — el detector de avance NUNCA los re-propone ni los
// pisa. El principio: el avance solo opera sobre tareas ACTIVAS (PENDING/IN_PROGRESS); los estados
// terminales solo los cambia el humano por acción directa (drawer/toggle). Antes solo se protegía
// DONE, dejando una asimetría por la que una suspensión humana podía re-proponerse como hecha.
const isTerminalHuman = (status: string | undefined): boolean =>
  status === "DONE" || status === "SUSPENDED";

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
  // Particularidades (desviaciones curadas) que el agente detecta del MISMO transcript. Borrador
  // SEPARADO de progress (pendingParticularidades) con apply propio — aceptar avance ≠ aceptar
  // desviaciones. Conservador: solo lo respaldado por el transcript, sin inventar semanas.
  particularidades?: Array<{
    kind?: string;
    party?: string;
    title?: string;
    detail?: string | null;
    weeksImpact?: number | null;
    phaseId?: string | null;
  }>;
}

const VALID_KINDS = new Set(["ATRASO", "SOLICITUD", "COMPROMISO"]);
const VALID_PARTIES = new Set(["CLIENTE", "SMARTEAM", "AMBOS", "DEV"]);

/** Borrador de una particularidad propuesta (validado; aún sin crear). */
export interface PendingParticularidadDraft {
  kind: string;
  party: string;
  title: string;
  detail: string | null;
  weeksImpact: number | null;
  phaseId: string | null;
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
      "Además, si el transcript RESPALDA desviaciones del plan (algo se atrasó, se necesita un insumo del cliente, o se comprometió un acuerdo), proponelas en `particularidades` con su atribución (party) y — SOLO si el transcript lo respalda — las semanas de corrimiento (weeksImpact). No inventes semanas ni desviaciones: si no hay evidencia clara, dejá el array vacío.",
    ]
      .filter((x) => x !== null)
      .join("\n");

    // 5. Claude
    let rawText: string;
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: `${agent.systemPrompt ?? ""}\n\nESTILO (OBLIGATORIO): TODO el texto en español con TUTEO neutro ("tú"): "Transforma", "centraliza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "centralizá", "tenés", "querés", "podés" ni "vos".`,
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

    // Fases que el agente marca completas (válidas, no ya resueltas por un humano) — la PROPUESTA.
    const phasesDone = (prog.phases ?? [])
      .filter((p) => p?.done === true && typeof p.id === "string" && phaseStatus.has(p.id) && !isTerminalHuman(phaseStatus.get(p.id)))
      .map((p) => ({ id: p.id as string, done: true }));
    // Ids de tareas que el agente infirió hechas (válidas, no ya resueltas por un humano).
    const inferredDone = new Set(
      (prog.tasks ?? [])
        .filter((t) => t?.done === true && typeof t.id === "string" && taskStatus.has(t.id) && !isTerminalHuman(taskStatus.get(t.id)))
        .map((t) => t.id as string),
    );

    // Particularidades propuestas — validadas y saneadas (borrador SEPARADO del avance).
    // Conservador: kind/party válidos, title obligatorio, weeksImpact entero ≥0 o null, phaseId
    // debe existir (o null). Se limitan a 12 por corrida para no inundar el banner.
    const particularidadesDraft: PendingParticularidadDraft[] = (parsed.particularidades ?? [])
      .map((pt): PendingParticularidadDraft | null => {
        const kind = typeof pt?.kind === "string" ? pt.kind.toUpperCase() : "";
        const party = typeof pt?.party === "string" ? pt.party.toUpperCase() : "";
        const title = typeof pt?.title === "string" ? pt.title.trim() : "";
        if (!VALID_KINDS.has(kind) || !VALID_PARTIES.has(party) || !title) return null;
        const wRaw = pt?.weeksImpact;
        const weeksImpact = typeof wRaw === "number" && Number.isFinite(wRaw) && wRaw > 0 ? Math.round(wRaw) : null;
        const phaseId = typeof pt?.phaseId === "string" && phaseStatus.has(pt.phaseId) ? pt.phaseId : null;
        const detail = typeof pt?.detail === "string" && pt.detail.trim() ? pt.detail.trim() : null;
        return { kind, party, title, detail, weeksImpact, phaseId };
      })
      .filter((x): x is PendingParticularidadDraft => x !== null)
      .slice(0, 12);

    // ¿Hay algo HECHO que confirmar? Si NO hay fases completas NI tareas inferidas hechas, el
    // borrador de AVANCE sería "todo pendiente" → nada que confirmar, solo ruido → se OMITE.
    // Antes había una excepción (currentIsNew: mostrar el banner si el agente ubicaba el "hoy" en
    // una fase nueva aunque no hubiera nada hecho); se quitó por pedido: mover el marcador sin
    // tareas/fases hechas no amerita confirmación (el "hoy" del Gantt es por fecha, y el CSE marca
    // las tareas a mano cuando las haya). Las particularidades son un borrador INDEPENDIENTE: si
    // hay particularidades pero no avance, igual se persisten (su propio banner las ofrece).
    const hasProgress = phasesDone.length > 0 || inferredDone.size > 0;
    const hasParticularidades = particularidadesDraft.length > 0;
    if (!hasProgress && !hasParticularidades) {
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
        if (isTerminalHuman(t.status)) continue; // ya resuelta por un humano (DONE/SUSPENDED), no re-proponer
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

    // Persistir SOLO los borradores que corresponden: avance si lo hay, particularidades si las
    // hay. Cada uno con el mismo runId (una sola corrida del agente) pero apply separado.
    const updateData: Prisma.ProjectTimelineUpdateInput = {};
    if (hasProgress) {
      updateData.pendingProgress = {
        currentPhaseId,
        asOfSessionId: opts.asOfSessionId ?? null,
        reasoning: typeof prog.reasoning === "string" ? prog.reasoning : "",
        phases: phasesDone,
        tasks: tasksDraft,
      } as Prisma.InputJsonValue;
      updateData.pendingProgressRunId = run.id;
    }
    if (hasParticularidades) {
      updateData.pendingParticularidades = particularidadesDraft as unknown as Prisma.InputJsonValue;
      updateData.pendingParticularidadesRunId = run.id;
    }

    await prisma.projectTimeline.update({
      where: { projectId },
      data: updateData,
    });

    console.log(
      `[timeline-progress] ✓ borrador para project ${projectId}: ${phasesDone.length} fases, ${inferredDone.size} tareas hechas (${tasksDraft.length} a confirmar), ${particularidadesDraft.length} particularidades, hoy=${currentPhaseId ?? "—"} (run ${run.id})`,
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
