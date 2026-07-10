/**
 * lib/sessions/classify-session-project.ts
 *
 * Dado una sesión + el cliente al que pertenece, decide a qué proyecto(s)
 * activo(s) del cliente pertenece. Persiste filas SessionProject (N:N con
 * isPrimary).
 *
 * Reglas:
 *   - Si el cliente tiene 0 proyectos activos → no hace nada, devuelve null.
 *   - Si tiene 1 → asigna directo con isPrimary=true, source=agent y confidence
 *     PROVISIONAL (0.7): la asignación es trivialmente correcta HOY, pero si
 *     mañana aparece un segundo proyecto la re-clasificación debe poder revisarla
 *     (caso RC Inmobiliaria: 5 sesiones pegadas al único proyecto 3 minutos antes
 *     de crearse el segundo, y nunca reconsideradas). No llama a Claude.
 *   - Si tiene 2+ → llama al agente IA `agent-session-project-classifier` y
 *     persiste sus assignments.
 *
 * LOCKS POR LINK (no por sesión): el clasificador NUNCA modifica ni borra un link
 * con `source="manual"` | `reviewedAt != null` | `included=false` | `handoffOverride != null`
 * — cualquier señal de que un humano lo tocó. PERO sí puede AGREGAR links nuevos a
 * proyectos sin link bloqueado: una reunión revisada puede ganar membresía en un
 * proyecto que nació después ("alimenta a ambos"). Un tombstone (`included=false`)
 * significa "un humano excluyó ESTE proyecto": la IA no lo re-propone jamás.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { isLockedLink } from "@/lib/sessions/session-project-locks";

export { isLockedLink } from "@/lib/sessions/session-project-locks";

export const AGENT_ID_SESSION_PROJECT_CLASSIFIER = "agent-session-project-classifier";

interface ClassifierOutput {
  assignments?: {
    projectId?: string;
    isPrimary?: boolean;
    confidence?: number;
    rationale?: string;
  }[];
}

export interface ClassifyProposal {
  projectId: string;
  isPrimary: boolean;
  confidence: number | null;
  rationale: string | null;
}

export interface ClassifyResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  primaryProjectId?: string | null;
  assignmentsCreated?: number;
  /** Con dryRun: lo que el clasificador HABRÍA escrito (para el diff del backfill). */
  proposals?: ClassifyProposal[];
}

/**
 * Clasifica una sesión a los proyectos activos del cliente.
 * Retorna el projectId primario (o null si no hay proyecto asignado).
 * Con `opts.dryRun` no escribe nada y devuelve `proposals`.
 */
export async function classifySessionToProjects(
  sessionId: string,
  clientId: string,
  opts: { dryRun?: boolean } = {},
): Promise<ClassifyResult> {
  const dryRun = opts.dryRun === true;
  // 1. Cargar proyectos activos del cliente (excluyendo el de estrategia)
  const projects = await prisma.project.findMany({
    where: {
      clientId,
      status: "active",
      serviceType: { not: "__strategy__" },
    },
    select: {
      id: true, name: true, serviceType: true, currentStage: true,
      createdAt: true, hubspotCreatedAt: true, hubspotDealId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (projects.length === 0) {
    return { status: "skipped", reason: "Client has no active projects", primaryProjectId: null };
  }

  // 2. Links existentes: locks POR LINK (manual / revisado / tombstone / override).
  const existing = await prisma.sessionProject.findMany({
    where: { sessionId },
    select: { projectId: true, source: true, isPrimary: true, reviewedAt: true, included: true, handoffOverride: true },
  });
  const lockedByProject = new Map(existing.filter(isLockedLink).map((e) => [e.projectId, e]));
  // Tombstone: un humano excluyó ESTE proyecto — la IA no lo re-propone jamás.
  const tombstoned = new Set(existing.filter((e) => !e.included).map((e) => e.projectId));
  const lockedPrimary = existing.find((e) => isLockedLink(e) && e.isPrimary && e.included);
  // Si TODOS los proyectos activos ya tienen link bloqueado, no hay nada que la IA
  // pueda escribir (ni agregar): skip sin gastar el LLM.
  if (projects.every((p) => lockedByProject.has(p.id))) {
    const primary = existing.find((e) => e.isPrimary && e.included);
    return {
      status: "skipped",
      reason: "All active projects have human-touched links — agent will not touch",
      primaryProjectId: primary?.projectId ?? null,
    };
  }

  // 3. Atajo: 1 solo proyecto → asignación trivial sin Claude. Confidence PROVISIONAL:
  //    correcta hoy, revisable si mañana aparece otro proyecto (la re-clasificación
  //    solo toca links no bloqueados, y 0.7 deja la señal visible en la UI).
  if (projects.length === 1) {
    const p = projects[0];
    if (tombstoned.has(p.id)) {
      return { status: "skipped", reason: "Human excluded this project for this session", primaryProjectId: null };
    }
    const proposal: ClassifyProposal = {
      projectId: p.id,
      isPrimary: true,
      confidence: 0.7,
      rationale: "Único proyecto activo del cliente (asignación provisional)",
    };
    if (dryRun) return { status: "ok", primaryProjectId: p.id, assignmentsCreated: 0, proposals: [proposal] };
    if (!lockedByProject.has(p.id)) {
      await prisma.sessionProject.upsert({
        where: { sessionId_projectId: { sessionId, projectId: p.id } },
        create: {
          sessionId,
          projectId: p.id,
          isPrimary: true,
          source: "agent",
          confidence: proposal.confidence,
          rationale: proposal.rationale,
        },
        update: {
          isPrimary: true,
          source: "agent",
          confidence: proposal.confidence,
          rationale: proposal.rationale,
        },
      });
    }
    return { status: "ok", primaryProjectId: p.id, assignmentsCreated: 1 };
  }

  // 4. 2+ proyectos → llamar al clasificador IA
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      participants: true,
      transcript: true,
      date: true,
    },
  });
  if (!session) return { status: "error", reason: "Session not found" };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true },
  });
  if (!client) return { status: "error", reason: "Client not found" };

  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID_SESSION_PROJECT_CLASSIFIER },
    select: { systemPrompt: true },
  });
  if (!agent) {
    return {
      status: "error",
      reason: "Classifier agent not seeded — run npx tsx scripts/seed-session-project-classifier.ts",
    };
  }

  // Cruce temporal: traer el closedate de los deals ancla de los proyectos candidatos,
  // para que el clasificador desempate proyectos secuenciales o de fechas cercanas. El
  // closedate vive en el deal de HubSpot (no se desnormaliza). Best-effort: si HubSpot
  // falla, se clasifica sin fechas de cierre (NO se tumba la clasificación).
  const closeDateByDeal = new Map<string, string>();
  const dealIds = projects.map((p) => p.hubspotDealId).filter((d): d is string => !!d);
  if (dealIds.length > 0) {
    try {
      const hs = await getSystemHubspotClient();
      const res = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/deals/batch/read",
        body: { properties: ["closedate"], inputs: dealIds.map((id) => ({ id })) },
      });
      const data = (await res.json()) as {
        results?: { id: string; properties: { closedate?: string | null } }[];
      };
      for (const d of data.results ?? []) {
        if (d.properties.closedate) closeDateByDeal.set(d.id, d.properties.closedate);
      }
    } catch (e) {
      console.warn("[classify] no se pudo traer closedate de deals:", (e as Error).message);
    }
  }

  const day = (raw: string): string => {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10);
  };
  const projectsBlock = projects
    .map((p) => {
      // Muchos proyectos son SERVICES de HubSpot sin deal (hubspotDealId null):
      // su única ancla temporal real es la fecha de creación en HubSpot. Sin esto,
      // el clasificador no tenía NINGUNA señal de fecha para separarlos (caso RC).
      const creado = day((p.hubspotCreatedAt ?? p.createdAt).toISOString());
      const cierre = p.hubspotDealId
        ? closeDateByDeal.has(p.hubspotDealId)
          ? day(closeDateByDeal.get(p.hubspotDealId)!)
          : "(deal sin fecha de cierre)"
        : "(sin deal — usá la fecha de creación como ancla temporal de la venta)";
      return `- id: ${p.id} | name: "${p.name}" | serviceType: ${p.serviceType ?? "(none)"} | stage: ${p.currentStage} | creado: ${creado} | cierre del deal: ${cierre}`;
    })
    .join("\n");

  const userMessage = [
    `=== CLIENTE ===`,
    `Nombre: ${client.name}`,
    "",
    `=== REUNIÓN ===`,
    `Título: ${session.title}`,
    `Fecha: ${session.date.toISOString().slice(0, 10)}`,
    `Participantes: ${session.participants.join(", ")}`,
    "",
    `=== PROYECTOS ACTIVOS DEL CLIENTE ===`,
    projectsBlock,
    "",
    `=== TRANSCRIPT ===`,
    (session.transcript ?? "").slice(0, 30000),
  ].join("\n");

  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text.trim();
  } catch (e) {
    return { status: "error", reason: `Claude error: ${(e as Error).message}` };
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { status: "error", reason: "No JSON in classifier response" };

  let parsed: ClassifierOutput;
  try {
    parsed = JSON.parse(jsonMatch[0]) as ClassifierOutput;
  } catch (e) {
    return { status: "error", reason: `JSON parse: ${(e as Error).message}` };
  }

  const assignments = (parsed.assignments ?? []).filter((a) => {
    if (!a.projectId) return false;
    if (!projects.some((p) => p.id === a.projectId)) return false;
    if ((a.confidence ?? 0) < 0.4) return false;
    // Tombstone: un humano excluyó este proyecto para esta sesión — no re-proponer.
    if (tombstoned.has(a.projectId)) return false;
    return true;
  });

  if (assignments.length === 0) {
    return { status: "ok", primaryProjectId: null, assignmentsCreated: 0, ...(dryRun ? { proposals: [] } : {}) };
  }

  // Garantizar exactamente UN primario. Si un humano ya fijó el primario (link
  // bloqueado con isPrimary), se respeta: las propuestas de la IA entran como
  // secundarias y no se lo disputan.
  const primary =
    assignments.find((a) => a.isPrimary === true) ??
    [...assignments].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  const primaryProjectId = lockedPrimary ? lockedPrimary.projectId : (primary.projectId ?? null);

  const proposals: ClassifyProposal[] = assignments.map((a) => ({
    projectId: a.projectId!,
    isPrimary: a.projectId === primaryProjectId,
    confidence: a.confidence ?? null,
    rationale: a.rationale ?? null,
  }));

  if (dryRun) {
    return { status: "ok", primaryProjectId, assignmentsCreated: 0, proposals };
  }

  // Persistir AgentRun para trazabilidad
  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID_SESSION_PROJECT_CLASSIFIER,
      clientId,
      status: "DONE",
      stepLabel: "Clasificación sesión→proyecto",
      output: JSON.stringify(parsed),
      sourceSessionIds: [sessionId],
    },
  });

  let count = 0;
  for (const p of proposals) {
    // Link bloqueado (manual/revisado/override): un humano lo dejó así — no se toca.
    // La propuesta de la IA sobre ese proyecto se descarta silenciosamente.
    if (lockedByProject.has(p.projectId)) continue;
    await prisma.sessionProject.upsert({
      where: {
        sessionId_projectId: { sessionId, projectId: p.projectId },
      },
      create: {
        sessionId,
        projectId: p.projectId,
        isPrimary: p.isPrimary,
        source: "agent",
        confidence: p.confidence,
        rationale: p.rationale,
        generatedByAgentRunId: run.id,
      },
      update: {
        isPrimary: p.isPrimary,
        source: "agent",
        confidence: p.confidence,
        rationale: p.rationale,
        generatedByAgentRunId: run.id,
      },
    });
    count++;
  }

  // Limpiar assignments no-humanos que ya no están (proyectos que dejó de proponer).
  // SOLO los links vírgenes: cualquier señal humana (manual/reviewedAt/tombstone/
  // handoffOverride — la "X" del panel deja override sobre links agent) los protege.
  // "legacy" (migración por heurística de proyecto único) también es virgen: es la
  // misma clase de asignación provisional que el atajo 1-proyecto.
  const proposedIds = new Set(proposals.map((p) => p.projectId));
  await prisma.sessionProject.deleteMany({
    where: {
      sessionId,
      source: { in: ["agent", "legacy"] },
      reviewedAt: null,
      included: true,
      handoffOverride: null,
      projectId: { notIn: [...proposedIds] },
    },
  });

  return {
    status: "ok",
    primaryProjectId,
    assignmentsCreated: count,
  };
}

/**
 * Lookup rápido del proyecto primario de una sesión, leyendo SessionProject.
 * Usado por endpoints/UI que necesitan el proyecto sin re-clasificar.
 */
export async function getPrimaryProjectIdForSession(sessionId: string): Promise<string | null> {
  const row = await prisma.sessionProject.findFirst({
    where: { sessionId, isPrimary: true },
    select: { projectId: true },
  });
  return row?.projectId ?? null;
}
