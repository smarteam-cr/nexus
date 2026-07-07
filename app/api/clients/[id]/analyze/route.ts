import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { withClientAccess, apiError } from "@/lib/api";
import { guardCapability } from "@/lib/auth/api-guards";
import { HANDOFF_EXCLUDE_TITLE_KEYWORDS, HANDOFF_INCLUDE_TITLE_KEYWORDS } from "@/lib/handoff/session-relevance";
import { getDataLake } from "@/lib/data-lake/client";
import { anthropic } from "@/lib/anthropic";
import { extractTitleTerms } from "@/lib/utils/matching";
import { EMPTY_CLIENT_CANVAS } from "@/lib/canvas/template";
import type { ClientCanvas } from "@/lib/canvas/template";
import { updateCanvasAsync } from "@/lib/canvas/update-agent";
import { getOutputFormatInstructions, getBlockOutputFormatInstructions } from "@/lib/canvas/agent-output-schema";
import { DEFAULT_COL_SPAN, DEFAULT_ROW_SPAN, type BlockType } from "@/lib/canvas/block-types";
import { postProcessCards } from "@/lib/canvas/post-process";
import { mergePendingItemsToProject } from "@/lib/canvas/merge-pending-items";
import { AGENT_GROUP_TO_CANVAS } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { syncFlowchartsToProcesos } from "@/lib/canvas/sync-procesos-blocks";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { getKickoffSessionDate } from "@/lib/sessions/project-sessions";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { autoClassifyOrphanSessions } from "@/lib/projects/analyze-participants";
import { getProjectHandoffSessions, getClientSessions } from "@/lib/sessions/project-sources";
import { fetchCompanyTimeline } from "@/lib/hubspot/company-timeline";
import { sanitizeTags, tagLabels, MODALITY_LABEL, SERVICE_TO_PRODUCT } from "@/lib/tags/catalog";

// ── Reparación de JSON truncado por límite de tokens ──────────────────────────
// Cuenta brackets/braces abiertos y cierra los que faltan.
function repairTruncatedJson(s: string): string | null {
  let inStr = false, esc = false, depth = 0, arrDepth = 0;
  for (const ch of s) {
    if (esc)              { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true;  continue; }
    if (ch === '"')       { inStr = !inStr;  continue; }
    if (inStr)            continue;
    if      (ch === "{")  depth++;
    else if (ch === "}")  depth--;
    else if (ch === "[")  arrDepth++;
    else if (ch === "]")  arrDepth--;
  }
  // Si ya está balanceado no hay nada que reparar
  if (depth <= 0 && arrDepth <= 0 && !inStr) return null;
  const suffix =
    (inStr ? '"' : "") +
    "]".repeat(Math.max(0, arrDepth)) +
    "}".repeat(Math.max(0, depth));
  return s + suffix;
}

// ── Sesiones: lectura desde la caché local (FirefliesSession = Fireflies + Meet) ──

type RawSession = { id: string; title: string; date: number; participants: string[] };
type RawTranscript = RawSession;

type Params = { params: Promise<{ id: string }> };

// ── GET: secciones del agente para la subetapa actual ────────────────────────
// Retorna { sections: SectionInfo[] } donde cada sección corresponde a un agente
// activo configurado para ese stage+step. Si hay múltiples agentes con distinto
// sectionLabel, cada uno forma su propio bloque visual independiente.
export const GET = withClientAccess(async (_req: NextRequest, { params }: Params) => {
  const { id: clientId } = await params;

  const stageParam = _req.nextUrl.searchParams.get("stage");
  const stepParam  = _req.nextUrl.searchParams.get("step");
  const stageNum   = stageParam !== null ? parseInt(stageParam) : NaN;
  const stepNum    = stepParam  !== null ? parseInt(stepParam)  : NaN;

  if (isNaN(stageNum) || isNaN(stepNum)) {
    return NextResponse.json({ sections: [] });
  }

  try {
    // 1. Buscar todos los agentes ACTIVE para este stage
    const candidates = await prisma.agent.findMany({
      where: {
        status: "ACTIVE",
        agentType: "SECTION", // Solo agentes de sección, no canvas transversales
        outputType: { in: ["CARDS", "FLOWCHART", "CARDS_AND_FLOWCHARTS"] },
        OR: [
          { associatedStages: { isEmpty: true } },
          { associatedStages: { has: stageNum } },
        ],
      },
      select: { id: true, name: true, outputType: true, associatedStep: true, sectionLabel: true },
    });

    // 2. Prioridad: específicos (associatedStep === stepNum) > wildcard (null)
    //    Si hay específicos, solo ellos participan. Si no, el wildcard.
    const specific = candidates.filter((a) => a.associatedStep === stepNum);
    const wildcard = candidates.find((a) => a.associatedStep === null);
    const participating = specific.length > 0 ? specific : (wildcard ? [wildcard] : []);

    if (participating.length === 0) {
      return NextResponse.json({ sections: [] });
    }

    // 3. Para cada agente, buscar su historial de runs filtrado por sección
    const sections = await Promise.all(
      participating.map(async (agent) => {
        const runWhere = {
          clientId,
          stage: stageNum,
          step:  stepNum,
          status: { not: "ARCHIVED" as const },
          // Backward compat: agente legacy (sectionLabel null) → capturar runs null + runs con su nombre
          ...(agent.sectionLabel
            ? { sectionLabel: agent.sectionLabel }
            : { OR: [{ sectionLabel: null }, { sectionLabel: agent.name }] }
          ),
        };

        const runs = await prisma.agentRun.findMany({
          where: runWhere,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, status: true, createdAt: true, step: true,
            agent: { select: { name: true } },
          },
          take: 20,
        });

        return {
          sectionLabel:    agent.sectionLabel ?? agent.name,
          agentId:         agent.id,
          agentName:       agent.name,
          agentOutputType: agent.outputType,
          lastRun:         runs[0] ?? null,
          runs,
        };
      })
    );

    return NextResponse.json({ sections });
  } catch (err) {
    console.error("[analyze GET] Error:", err);
    return NextResponse.json({ sections: [] });
  }
});

// ── POST: ejecutar análisis ───────────────────────────────────────────────────
export const POST = withClientAccess(async (_req: NextRequest, { params }: Params) => {
  const { id: clientId } = await params;

  // ── 0. Leer parámetros del body ───────────────────────────────────────────────
  const body = await _req.json().catch(() => ({})) as {
    stage?: number;
    step?: number;
    stepLabel?: string;
    sectionLabel?: string;
    agentId?: string;
    sessionKeywords?: string[];
    projectId?: string;
    async?: boolean; // A2: si true → run en background + polling (agentes pesados)
  };
  const bodyStage: number        = typeof body?.stage === "number" ? body.stage : 1;
  const bodyStep: number         = typeof body?.step  === "number" ? body.step  : 0;
  const bodyStepLabel: string | null    = body?.stepLabel    ?? null;
  const bodySectionLabel: string | null = body?.sectionLabel ?? null;
  const bodyAgentId: string | null      = body?.agentId      ?? null;
  let bodyProjectId: string | null = body?.projectId ?? null;
  // El pop-up de Agentes (y el tab "Información del cliente") manda projectId con el
  // SENTINEL "__strategy__", que NO es un id de Project real → FK violation en
  // agentRun.create (AgentRun_projectId_fkey). Lo resolvemos al proyecto __strategy__
  // real del cliente, o null si no existe (projectId es nullable).
  if (bodyProjectId === "__strategy__") {
    const strat = await prisma.project.findFirst({
      where: { clientId, serviceType: "__strategy__" },
      select: { id: true },
    });
    bodyProjectId = strat?.id ?? null;
  }
  // Señal para confirmar en dev que corre el código nuevo y si llegó async (A2).
  console.log(`[analyze] POST agentId=${bodyAgentId ?? "—"} async=${body?.async === true} stage=${bodyStage} step=${bodyStep} project=${bodyProjectId ?? "—"}`);

  // ── 1. Cargar datos del cliente ──────────────────────────────────────────────
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, company: true, industry: true, notes: true, hubspotCompanyId: true, canvas: true },
  });
  if (!client) return apiError("not_found", 404);

  const companyName = client.company ?? client.name ?? "la empresa";

  // ── 2. Extraer titleTerms y domainFilter ─────────────────────────────────────
  const titleTerms: string[] = [];
  if (client.name) {
    for (const t of extractTitleTerms(client.name)) {
      if (!titleTerms.includes(t)) titleTerms.push(t);
    }
  }
  if (client.company) {
    const raw = client.company.trim();
    if (/^https?:\/\//i.test(raw)) {
      try {
        const stem = new URL(raw).hostname.replace(/^www\./i, "").toLowerCase().split(".")[0];
        if (stem.length >= 3 && !titleTerms.includes(stem)) titleTerms.push(stem);
      } catch { /* URL inválida */ }
    } else {
      for (const t of extractTitleTerms(raw)) {
        if (!titleTerms.includes(t)) titleTerms.push(t);
      }
    }
  }

  // ── Lookup agente por stage+step+section ─────────────────────────────────
  const agentCandidates = await prisma.agent.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { associatedStages: { isEmpty: true } },
        { associatedStages: { has: bodyStage } },
      ],
    },
  });

  let agent = null;
  if (bodyAgentId) {
    // Lookup directo por ID (más seguro cuando hay múltiples secciones en un mismo step)
    agent = agentCandidates.find((a) => a.id === bodyAgentId) ?? null;
  } else {
    // Lookup por step + sectionLabel (fallback legacy)
    const byStep = agentCandidates.filter((a) => a.associatedStep === bodyStep);
    agent =
      (bodySectionLabel
        ? byStep.find((a) => a.sectionLabel === bodySectionLabel)
        : null) ??
      byStep[0] ??
      agentCandidates.find((a) => a.associatedStep === null) ??
      null;
  }

  if (!agent) {
    return NextResponse.json(
      { agent: null, cards: [], run: null, error: "NO_AGENT_CONFIGURED" },
      { status: 200 }
    );
  }

  // RBAC: generar/regenerar el HANDOFF exige la capacidad handoffAnywhere — un CSE
  // NO edita handoffs (el cronograma y el resto de los agentes mantienen el acceso
  // normal al cliente que ya validó withClientAccess).
  if (agent.agentGroup === "handoff") {
    const handoffGuard = await guardCapability("handoffAnywhere");
    if (handoffGuard instanceof NextResponse) return handoffGuard;
  }

  // ── D.1: fail-fast del agente de detalle de cronograma ──────────────────────
  // Este agente DETALLA un esqueleto existente (fases con ids). Sin proyecto o
  // sin timeline con fases no hay nada que detallar — se corta acá, antes de
  // recolectar fuentes o llamar a Claude.
  const isTimelineDetailAgent = agent.id === "agent-timeline-detail";
  if (isTimelineDetailAgent) {
    if (!bodyProjectId) {
      return NextResponse.json(
        { error: "NO_TIMELINE", message: "El agente de detalle necesita un proyecto." },
        { status: 400 },
      );
    }
    const tl = await prisma.projectTimeline.findUnique({
      where: { projectId: bodyProjectId },
      select: { id: true, _count: { select: { phases: true } } },
    });
    if (!tl || tl._count.phases === 0) {
      return NextResponse.json(
        {
          error: "NO_TIMELINE",
          message: "No hay cronograma con fases para detallar. Generá primero el esqueleto (handoff) o crealo a mano en el canvas Cronograma.",
        },
        { status: 400 },
      );
    }
  }

  // ── Handoff scopeado al proyecto: sin sesiones clasificadas a ESTE proyecto no
  //    hay nada que investigar → cortar antes de crear el run (sin fallback client-wide).
  if (agent.agentGroup === "handoff" && bodyProjectId) {
    let projSessionCount = await prisma.sessionProject.count({ where: { projectId: bodyProjectId } });
    if (projSessionCount === 0) {
      // Auto-sanar: adoptar las sesiones HUÉRFANAS del cliente (matcheadas a nivel
      // cliente pero sin SessionProject) y reclasificarlas. Cubre el caso del proyecto
      // creado DESPUÉS de que ya existían sesiones (sync de HubSpot) → el handoff
      // funciona sin que el CSE tenga que clasificar a mano. El clasificador decide el
      // proyecto correcto, así que en multi-proyecto no asigna a ciegas a este.
      await autoClassifyOrphanSessions(clientId).catch(() => {});
      projSessionCount = await prisma.sessionProject.count({ where: { projectId: bodyProjectId } });
    }
    if (projSessionCount === 0) {
      return NextResponse.json(
        { error: "NO_PROJECT_SESSIONS", message: "Este proyecto no tiene sesiones clasificadas. Clasificá sesiones al proyecto antes de generar el handoff." },
        { status: 400 },
      );
    }
  }

  // ── Kickoff: el handoff es su única fuente. Sin handoff GENERADO (≥1 bloque en el
  //    canvas Handoff) no hay nada de qué partir → cortar antes de correr, en vez de
  //    generar bloques placeholder "Falta el handoff". No se exige que esté aceptado:
  //    el kickoff es interno y usa el handoff aunque esté en borrador.
  if (agent.id === "agent-kickoff-canvas" && bodyProjectId) {
    const handoffBlockCount = await prisma.canvasBlock.count({
      where: { section: { canvas: { projectId: bodyProjectId, name: "Handoff" } } },
    });
    if (handoffBlockCount === 0) {
      return NextResponse.json(
        { error: "NO_HANDOFF", message: "Este proyecto no tiene handoff generado. Generá el handoff antes de correr el kickoff." },
        { status: 400 },
      );
    }
  }

  // ── A2: el trabajo real (contexto → LLM → persistencia) va en un closure para
  // poder ejecutarlo síncrono (modo normal) o detached (modo async). Captura todo
  // el scope de arriba (body, agent, client, etc.) — sin threading de variables.
  // existingRunId != null → modo async: el AgentRun ya existe (RUNNING); en vez de
  // crear uno nuevo al final, se actualiza ese.
  const runAnalysisWork = async (existingRunId: string | null): Promise<NextResponse> => {

  // ── 3. Cargar notas, documentos, cards y deal en paralelo ────────────────────
  const [existingCardsResult, stageNotesResult, clientDocumentsResult, dealProjectResult] =
    await Promise.allSettled([
      prisma.clientContextCard.findMany({
        where: { clientId },
        orderBy: { order: "asc" },
        select: { title: true, content: true },
      }),
      prisma.stageNote.findMany({
        where: { clientId },
        select: { stage: true, step: true, content: true },
      }),
      prisma.clientDocument.findMany({
        where: {
          clientId,
          OR: [
            { content: { not: null } }, // Docs with text content
            { type: "FILE" },            // All FILE docs (even without extracted text)
          ],
        },
        select: { stage: true, step: true, title: true, content: true, type: true, fileName: true, fileSize: true, mimeType: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // Buscar el deal asociado al proyecto (si hay projectId)
      bodyProjectId
        ? prisma.project.findUnique({ where: { id: bodyProjectId }, select: { hubspotDealId: true, serviceType: true, tags: true, implementationType: true } })
        : Promise.resolve(null),
    ]);

  if (existingCardsResult.status === "rejected") console.error("[analyze] existingCards error:", existingCardsResult.reason);
  if (stageNotesResult.status === "rejected") console.error("[analyze] stageNotes error:", stageNotesResult.reason);
  if (clientDocumentsResult.status === "rejected") console.error("[analyze] clientDocuments error:", clientDocumentsResult.reason);
  if (dealProjectResult.status === "rejected") console.error("[analyze] dealProject error:", dealProjectResult.reason);

  const existingCards = existingCardsResult.status === "fulfilled" ? existingCardsResult.value : [];
  const stageNotes = stageNotesResult.status === "fulfilled" ? stageNotesResult.value : [];
  const clientDocuments = clientDocumentsResult.status === "fulfilled" ? clientDocumentsResult.value : [];
  const dealProject = dealProjectResult.status === "fulfilled" ? dealProjectResult.value : null;

  // ── 3b. Obtener line items del deal y datos de adquisición desde HubSpot ──────
  let dealContent = "";
  let acquisitionContent = "";
  let companyTimelineContent = "";
  try {
    const { getSystemHubspotClient, getHubspotClient } = await import("@/lib/hubspot/client");
    // Buscar la cuenta HubSpot del cliente (o la del sistema)
    const hsAccount = await prisma.hubspotAccount.findFirst({
      where: { clientId },
      select: { id: true },
    });
    const hsClient = hsAccount
      ? await getHubspotClient(hsAccount.id)
      : await getSystemHubspotClient();

    // Recolectar todos los deal IDs: el del proyecto + todos los de la empresa
    const allDealIds = new Set<string>();
    if (dealProject?.hubspotDealId) allDealIds.add(dealProject.hubspotDealId);

    if (client.hubspotCompanyId) {
      const assocRes = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/companies/${client.hubspotCompanyId}/associations/deals?limit=50`,
      });
      if (assocRes.status === 200) {
        const assocData = (await assocRes.json()) as { results?: { id: string }[] };
        (assocData.results ?? []).forEach((r) => allDealIds.add(r.id));
      }
    }

    const dealId = allDealIds.size > 0 ? [...allDealIds][0] : null; // para compatibilidad hacia abajo

    // ── Fetch datos de adquisición de la empresa (en paralelo con deal) ──────────
    if (client.hubspotCompanyId) {
      const acqProps = [
        "hs_analytics_source",
        "hs_analytics_source_data_1",
        "hs_analytics_source_data_2",
        "hs_latest_source",
        "hs_latest_source_data_1",
        "hs_latest_source_data_2",
        "hs_analytics_first_touch_converting_campaign",
        "hs_analytics_last_touch_converting_campaign",
        "first_conversion_event_name",
        "recent_conversion_event_name",
        "num_conversion_events",
        "hs_analytics_last_visit_timestamp",
      ].join(",");

      const acqRes = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/companies/${client.hubspotCompanyId}?properties=${acqProps}`,
      });

      if (acqRes.status === 200) {
        const acqData = (await acqRes.json()) as {
          properties?: {
            hs_analytics_source?: string;
            hs_analytics_source_data_1?: string;
            hs_analytics_source_data_2?: string;
            hs_latest_source?: string;
            hs_latest_source_data_1?: string;
            hs_latest_source_data_2?: string;
            hs_analytics_first_touch_converting_campaign?: string;
            hs_analytics_last_touch_converting_campaign?: string;
            first_conversion_event_name?: string;
            recent_conversion_event_name?: string;
            num_conversion_events?: string;
            hs_analytics_last_visit_timestamp?: string;
          };
        };
        const p = acqData.properties ?? {};
        const acqLines: string[] = [];
        if (p.hs_analytics_source) acqLines.push(`Fuente del registro: ${p.hs_analytics_source}`);
        if (p.hs_analytics_source_data_1) acqLines.push(`Detalle fuente original 1: ${p.hs_analytics_source_data_1}`);
        if (p.hs_analytics_source_data_2) acqLines.push(`Detalle fuente original 2: ${p.hs_analytics_source_data_2}`);
        if (p.hs_latest_source) acqLines.push(`Fuente de tráfico más reciente: ${p.hs_latest_source}`);
        if (p.hs_latest_source_data_1) acqLines.push(`Detalle fuente reciente 1: ${p.hs_latest_source_data_1}`);
        if (p.hs_latest_source_data_2) acqLines.push(`Detalle fuente reciente 2: ${p.hs_latest_source_data_2}`);
        if (p.hs_analytics_first_touch_converting_campaign) acqLines.push(`Campaña primera conversión: ${p.hs_analytics_first_touch_converting_campaign}`);
        if (p.hs_analytics_last_touch_converting_campaign) acqLines.push(`Campaña última conversión: ${p.hs_analytics_last_touch_converting_campaign}`);
        if (p.first_conversion_event_name) acqLines.push(`Primera conversión: ${p.first_conversion_event_name}`);
        if (p.recent_conversion_event_name) acqLines.push(`Conversión más reciente: ${p.recent_conversion_event_name}`);
        if (p.num_conversion_events) acqLines.push(`Total de conversiones: ${p.num_conversion_events}`);
        if (p.hs_analytics_last_visit_timestamp) {
          const lastVisit = new Date(p.hs_analytics_last_visit_timestamp);
          if (!isNaN(lastVisit.getTime())) {
            acqLines.push(`Última interacción web: ${lastVisit.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`);
          }
        }
        if (acqLines.length > 0) acquisitionContent = acqLines.join("\n");
      }
    }

    // ── Fetch todos los deals en paralelo ────────────────────────────────────────
    if (allDealIds.size > 0) {
      const dealIds = [...allDealIds];

      // Función helper para obtener notas de un objeto HubSpot (deal o company)
      const fetchHubspotNotes = async (objectType: string, objectId: string): Promise<string[]> => {
        try {
          const notesAssocRes = await hsClient.apiRequest({
            method: "GET",
            path: `/crm/v3/objects/${objectType}/${objectId}/associations/notes?limit=50`,
          });
          if (notesAssocRes.status !== 200) return [];
          const notesAssoc = (await notesAssocRes.json()) as { results?: { id: string }[] };
          const noteIds = (notesAssoc.results ?? []).map((r) => r.id);
          if (noteIds.length === 0) return [];

          const notesBatch = await hsClient.apiRequest({
            method: "POST",
            path: "/crm/v3/objects/notes/batch/read",
            body: {
              inputs: noteIds.map((id) => ({ id })),
              properties: ["hs_note_body", "hs_timestamp", "hs_attachment_ids"],
            },
          });
          if (notesBatch.status !== 200) return [];
          const notesData = (await notesBatch.json()) as {
            results?: { properties: { hs_note_body?: string; hs_timestamp?: string } }[]
          };
          return (notesData.results ?? [])
            .filter((n) => n.properties.hs_note_body?.trim())
            .sort((a, b) => {
              const ta = new Date(a.properties.hs_timestamp ?? 0).getTime();
              const tb = new Date(b.properties.hs_timestamp ?? 0).getTime();
              return tb - ta; // más recientes primero
            })
            .map((n) => {
              const date = n.properties.hs_timestamp
                ? new Date(n.properties.hs_timestamp).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
                : null;
              return date ? `[${date}] ${n.properties.hs_note_body!.trim()}` : n.properties.hs_note_body!.trim();
            });
        } catch {
          return [];
        }
      };

      // Fetch todos los deals + sus notas en paralelo
      const dealsData = await Promise.all(
        dealIds.map(async (dId) => {
          const [dealRes, liRes, dealNotes] = await Promise.all([
            hsClient.apiRequest({
              method: "GET",
              path: `/crm/v3/objects/deals/${dId}?properties=dealname,amount,closedate,dealstage,description,hs_is_closed_won,pipeline`,
            }),
            hsClient.apiRequest({
              method: "GET",
              path: `/crm/v3/objects/deals/${dId}/associations/line_items?limit=50`,
            }),
            fetchHubspotNotes("deals", dId),
          ]);

          const deal = dealRes.status === 200
            ? (await dealRes.json()) as { properties?: { dealname?: string; amount?: string; closedate?: string; dealstage?: string; description?: string; hs_is_closed_won?: string } }
            : null;

          const liAssoc = liRes.status === 200
            ? (await liRes.json()) as { results?: { id: string }[] }
            : null;
          const liIds = (liAssoc?.results ?? []).map((r) => r.id);

          let lineItemsText = "";
          if (liIds.length > 0) {
            const liDetail = await hsClient.apiRequest({
              method: "POST",
              path: "/crm/v3/objects/line_items/batch/read",
              body: {
                inputs: liIds.map((id) => ({ id })),
                properties: ["name", "quantity", "price", "amount", "hs_sku", "description"],
              },
            });
            if (liDetail.status === 200) {
              const liData = (await liDetail.json()) as {
                results?: { properties: { name?: string; quantity?: string; price?: string; amount?: string; hs_sku?: string; description?: string } }[]
              };
              lineItemsText = (liData.results ?? [])
                .map((li) => {
                  const p = li.properties;
                  const parts = [`- **${p.name ?? "Sin nombre"}**`];
                  if (p.hs_sku) parts.push(`SKU: ${p.hs_sku}`);
                  if (p.quantity && p.quantity !== "1") parts.push(`Cantidad: ${p.quantity}`);
                  if (p.amount ?? p.price) parts.push(`Precio: $${parseFloat(p.amount ?? p.price ?? "0").toLocaleString()}`);
                  if (p.description?.trim()) parts.push(`Descripción: ${p.description.trim()}`);
                  return parts.join(" | ");
                })
                .join("\n");
            }
          }

          return { deal, lineItemsText, dealNotes, id: dId };
        })
      );

      // Fetch notas de la empresa (en paralelo con todo lo anterior)
      const companyNotes = client.hubspotCompanyId
        ? await fetchHubspotNotes("companies", client.hubspotCompanyId)
        : [];

      // Construir el bloque de deals
      const dealBlocks = dealsData
        .filter((d) => d.deal?.properties?.dealname)
        .map((d, i) => {
          const p = d.deal!.properties!;
          const name = p.dealname ?? `Deal ${d.id}`;
          const amount = p.amount ? `$${parseFloat(p.amount).toLocaleString()}` : null;
          const closeDate = p.closedate
            ? new Date(p.closedate).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
            : null;
          const stage = p.dealstage ?? null;
          const isWon = p.hs_is_closed_won === "true";

          const lines = [`**Deal ${i + 1}: ${name}**${amount ? ` (${amount})` : ""}${stage ? ` — Etapa: ${stage}` : ""}${closeDate ? ` — Cierre: ${closeDate}` : ""}${isWon ? " ✓ Ganado" : ""}`];
          if (p.description?.trim()) lines.push(`Descripción: ${p.description.trim()}`);
          if (d.lineItemsText) lines.push(`Productos:\n${d.lineItemsText}`);
          if (d.dealNotes.length > 0) {
            lines.push(`Notas del deal (${d.dealNotes.length}):\n${d.dealNotes.slice(0, 10).map((n) => `  • ${n}`).join("\n")}`);
          }
          return lines.join("\n");
        });

      if (dealBlocks.length > 0) {
        dealContent = `## Deals en HubSpot (${dealBlocks.length} total)\n\n` + dealBlocks.join("\n\n---\n\n");
      }

      // Agregar notas de la empresa al dealContent
      if (companyNotes.length > 0) {
        dealContent += `\n\n## Notas de la empresa en HubSpot (${companyNotes.length})\n` +
          companyNotes.slice(0, 15).map((n) => `• ${n}`).join("\n");
      }
    }

    // ── Timeline de HubSpot (notas + llamadas/reuniones con transcript/resumen de Zoom) ──
    // Vía la API v1 de engagements (funciona con los scopes actuales). Alimenta la
    // generación de los canvases que consumen fuentes crudas (handoff, diagnóstico) y, por
    // ende, el cronograma inicial que propone el agente de handoff. Reusa el hsClient ya
    // construido arriba. El kickoff usa el handoff curado (no fuentes crudas), así que no lo ve.
    if (client.hubspotCompanyId) {
      try {
        companyTimelineContent = await fetchCompanyTimeline(hsClient, client.hubspotCompanyId);
      } catch (e) {
        console.error("[analyze] HubSpot company timeline error:", e);
      }
    }
  } catch (e) {
    console.error("[analyze] HubSpot deal error:", e);
    // No es bloqueante — continúa sin los datos del deal
  }

  // ── 4. Buscar y traer transcripciones (Fireflies + Google Meet) ──────────────
  // Cargar TODOS los emails internos del equipo Smarteam — necesarios para:
  //  - Etiquetar sesiones como "puras de ventas" vs "mixtas" (handoff/kickoff).
  //  - Distinguir participantes internos vs externos (cliente, HubSpot reps).
  // Sales = subset con role in ("Sales", "Ventas").
  // OJO: en seed el role es "Sales" (no "Ventas") — antes esta query devolvía
  // vacío y TODAS las sesiones caían en "CS" por defecto.
  const allTeam = await prisma.teamMember.findMany({
    select: { email: true, name: true, area: true },
  });
  const internalEmails = new Set(allTeam.map((m) => m.email.toLowerCase()));
  const salesEmails = new Set(
    allTeam
      .filter((m) => m.area === "Sales" || m.area === "Ventas")
      .map((m) => m.email.toLowerCase()),
  );

  // ── Filtro especial para el agente Handoff Sales→CS ─────────────────────────
  // Estrategia híbrida en 3 niveles para decidir qué sesiones son "input válido
  // para handoff":
  //
  //   1. EXCLUDE por título (precedencia máxima): keywords como "kickoff",
  //      "implementación", "adopción", "review" → la sesión es post-handoff
  //      o irrelevante. Se excluye AUNQUE tenga participantes de Sales (ej.
  //      un Kickoff donde Sales aparece para presentar al CSE).
  //
  //   2. INCLUDE por título: keywords como "hand off", "discovery", "demo",
  //      "propuesta", "cierre" → la sesión es claramente pre-venta o handoff.
  //      Se incluye AUNQUE tenga muchos CSE/PM (caso típico de la sesión
  //      "Hand Off" mixta — Sales+CSE juntos al momento del traspaso).
  //
  //   3. NEUTRO (título no matchea ningún keyword): cae al fallback de
  //      "al menos un participante de Sales".
  //
  // Más filtro temporal: solo últimos 90 días.
  const isHandoffAgent = agent.agentGroup === "handoff";
  const HANDOFF_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
  const handoffCutoffMs = Date.now() - HANDOFF_LOOKBACK_MS;

  // ── Perfil de contexto por agente ─────────────────────────────────────────
  // El MAPEO DE PROCESOS necesita ver MUCHO más transcript que el resto (detectar
  // todos los procesos hablados: ventas, servicio, cobranza…): más sesiones, caps
  // de bloque amplios, timeline extendido y fuentes manuales. Los defaults del
  // "resto" son idénticos a los literales históricos → cero cambio para
  // handoff/diagnóstico/kickoff/planificación.
  const isMapeoAgent = agent.id === "agent-mapeo-inicial";
  const CTX = isMapeoAgent
    ? { maxSales: 7, maxCS: 8, perSessionChars: 9000, salesBlockCap: 60000, csBlockCap: 60000, timelineCap: 12000, manualCap: 20000 }
    : { maxSales: 6, maxCS: 6, perSessionChars: Infinity, salesBlockCap: 4000, csBlockCap: 5000, timelineCap: 8000, manualCap: 12000 };

  // Las listas de keywords y el clasificador de relevancia para handoff viven en
  // lib/handoff/session-relevance.ts (importadas arriba; compartidas con la revisión A2).
  function normalizeTitle(t: string): string {
    // NFD descompone "ó" en "o" + diacrítico combinante. El regex remueve el
    // rango U+0300–U+036F (Combining Diacritical Marks) para que el matching
    // sea insensitive a acentos: "Implementación" → "implementacion".
    return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  type HandoffClassification = { include: boolean; reason: string };

  function classifyForHandoff(s: RawTranscript): HandoffClassification {
    const title = normalizeTitle(s.title || "");
    const excludeHit = HANDOFF_EXCLUDE_TITLE_KEYWORDS.find((kw) => title.includes(kw));
    if (excludeHit) return { include: false, reason: `título contiene "${excludeHit}"` };
    const includeHit = HANDOFF_INCLUDE_TITLE_KEYWORDS.find((kw) => title.includes(kw));
    if (includeHit) return { include: true, reason: `título contiene "${includeHit}"` };
    const hasSales = s.participants.some((p) => salesEmails.has(p.toLowerCase()));
    if (hasSales) return { include: true, reason: "título neutro + al menos un Sales en participantes" };
    return { include: false, reason: "título neutro + sin Sales en participantes" };
  }

  // Helper: si una sesión NO tiene transcript, devolver al menos su metadata
  // (título, fecha, participantes) para que el agente sepa que la reunión
  // existió aunque no haya contenido narrativo todavía.
  const buildFallbackMetadata = async (s: RawTranscript): Promise<string> => {
    const dateStr = new Date(s.date).toLocaleDateString("es-ES", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const participants = s.participants.length > 0
      ? s.participants.slice(0, 10).join(", ")
      : "(sin participantes registrados)";
    return [
      `[Reunión sin transcript disponible — solo metadata]`,
      `Título: ${s.title}`,
      `Fecha: ${dateStr}`,
      `Participantes: ${participants}`,
      `Nota: el transcript de esta reunión aún no fue sincronizado o no se generó. Úsalo solo como señal de que el cliente tuvo actividad en esa fecha, sin asumir contenido narrativo.`,
    ].join("\n");
  };

  // Wrapper: intenta transcript real, si es null devuelve fallback con metadata
  const fetchOrFallback = async (s: RawTranscript): Promise<string> => {
    const content = await fetchTranscriptContent(s.id, s.title);
    if (content?.trim()) return content;
    return buildFallbackMetadata(s);
  };

  let firefliesContent = "";
  let salesFirefliesContent = "";
  let manualSourcesContent = ""; // #handoff-manual — bloque de fuentes manuales (solo handoff)
  let handoffSourceSessionIds: string[] = []; // ids de sesiones de ventas usadas (handoff)

  try {
    let matchingSessions: RawTranscript[] = [];
    // Override por sesión para el handoff (true=forzar incluir, false=forzar excluir,
    // null/ausente=seguir la regla automática). Solo aplica al camino con proyecto.
    const handoffOverrideById = new Map<string, boolean | null>();

    // ── 4a. Fuente de sesiones ────────────────────────────────────────────────
    // Handoff scopeado al proyecto: la fuente son EXACTAMENTE las sesiones
    // vinculadas a ESTE proyecto (SessionProject), traídas directo por id. NO se
    // usa el keyword/domain-search ni el clasificador heurístico de handoff: esos
    // existían para *adivinar* el scope cuando no había vínculo explícito. Ahora
    // que el proyecto declara sus sesiones, ESAS son el material a investigar
    // (aunque haya varias de ventas). Intersectar con el keyword-search perdía
    // sesiones reales del proyecto que no matcheaban dominio/título, y el
    // clasificador llegaba a excluir la única con transcript (p.ej. un título con
    // "revisión") dejando 0 sesiones → el agente corría vacío y fallaba.
    if (isHandoffAgent && bodyProjectId) {
      // Fuente = sesiones del proyecto que PERTENECEN a su cliente (chokepoint único;
      // descarta links cross-client stale/legacy). El override por sesión viene incluido.
      const { sessions } = await getProjectHandoffSessions(bodyProjectId);
      for (const s of sessions) handoffOverrideById.set(s.id, s.handoffOverride);
      matchingSessions = sessions.map(({ id, title, date, participants }) => ({ id, title, date, participants }));
    } else {
      // Resto de agentes (y handoff legacy sin proyecto): TODAS las sesiones del
      // CLIENTE vía el chokepoint (client-scoped por resolvedClientId; sin cross-client).
      const clientSessions = await getClientSessions(clientId, { take: 200 });
      matchingSessions = clientSessions.map(({ id, title, date, participants }) => ({ id, title, date, participants }));
    }

    // Separar sesiones según el tipo de agente.
    let salesSessions: RawTranscript[];
    let csSessions: RawTranscript[];

    if (isHandoffAgent && bodyProjectId) {
      // Handoff scopeado al proyecto: de las sesiones linkeadas entran las de HANDOFF o
      // KICKOFF (por título) O las que tienen Ventas en la sala. El resto (levantamientos
      // semanales, implementación, marketing/service…) son entrega de servicio y se
      // excluyen aunque estén linkeadas. organizerEmail ya viene en participants (arriba).
      salesSessions = matchingSessions.filter((s) => {
        const ov = handoffOverrideById.get(s.id);
        if (ov === false) return false; // la "X" del panel: forzar excluir
        if (ov === true) return true; // agregada a mano desde el pop-up: forzar incluir
        return classifyForHandoff(s).include; // regla automática
      });
      csSessions = [];
    } else if (isHandoffAgent) {
      // Handoff legacy sin proyecto: clasificación híbrida (title-based + Sales),
      // últimos 90 días. NO se le pasan CS-only sessions — sin Sales en la sala
      // y sin título de venta, esa sesión es post-handoff y confunde al agente
      // sobre "qué prometió Ventas".
      salesSessions = matchingSessions.filter(
        (s) => s.date >= handoffCutoffMs && classifyForHandoff(s).include,
      );
      csSessions = []; // intencionalmente vacío
    } else {
      // Resto de agentes: lógica clásica.
      // Sales = al menos UN participante es del equipo de Sales.
      // CS = todos los participantes son no-sales (típicamente handoffs, kickoffs,
      // sesiones de implementación, etc).
      salesSessions = matchingSessions.filter((s) =>
        s.participants.some((p) => salesEmails.has(p.toLowerCase())),
      );
      csSessions = matchingSessions.filter(
        (s) => !s.participants.some((p) => salesEmails.has(p.toLowerCase())),
      );
    }

    // Cap por sesión (perfil): evita que una sesión monstruosa se coma el presupuesto
    // de las demás. Infinity para el resto de agentes (comportamiento histórico).
    const capSession = (c: string) =>
      Number.isFinite(CTX.perSessionChars) ? c.slice(0, CTX.perSessionChars) : c;

    // Transcripciones de CS / Kickoff / Handoff (cap por perfil) — vacío para handoff agent.
    const topCS = csSessions.sort((a, b) => b.date - a.date).slice(0, CTX.maxCS);
    if (topCS.length > 0) {
      const contents = await Promise.all(topCS.map((s) => fetchOrFallback(s)));
      firefliesContent = contents.filter(Boolean).map(capSession).join("\n\n---\n\n");
    }

    // Transcripciones de ventas (cap por perfil).
    // Si no hay transcript, se inyecta metadata (título, fecha, participantes)
    // para que el agente sepa al menos que la reunión existió.
    // El handoff puede traer hasta 10 sesiones de venta; el resto según su perfil.
    const topSales = salesSessions.sort((a, b) => b.date - a.date).slice(0, isHandoffAgent ? 10 : CTX.maxSales);
    if (topSales.length > 0) {
      const contents = await Promise.all(topSales.map((s) => fetchOrFallback(s)));
      salesFirefliesContent = contents.filter(Boolean).map(capSession).join("\n\n---\n\n");
    }
    if (isHandoffAgent) handoffSourceSessionIds = topSales.map((s) => s.id);

    // #handoff-manual — fuentes MANUALES pegadas (reuniones que NO entraron por el sync).
    // Persistidas en HandoffSource → re-leídas en CADA corrida (sobreviven regeneración).
    // Solo para handoff; etiquetadas como manuales para distinguirlas del sync verificado.
    if (isHandoffAgent && bodyProjectId) {
      const manualSources = await prisma.handoffSource.findMany({
        where: { projectId: bodyProjectId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { title: true, content: true },
      });
      if (manualSources.length > 0) {
        const joined = manualSources
          .map((s, i) => `### Fuente manual: ${s.title?.trim() || `(sin título ${i + 1})`}\n${s.content.trim()}`)
          .join("\n\n---\n\n")
          .slice(0, CTX.manualCap);
        manualSourcesContent = `=== FUENTES MANUALES (transcripts/resúmenes pegados a mano — NO vinieron por el sync verificado de Google Workspace; usalos como fuente complementaria y atribuí explícitamente lo que salga de acá) ===\n${joined}\n\n`;
      }
    } else if (isMapeoAgent) {
      // El mapeo corre a nivel CLIENTE: una fuente manual pegada en cualquier proyecto
      // del cliente es evidencia de procesos → entran TODAS, etiquetadas por proyecto.
      const manualSources = await prisma.handoffSource.findMany({
        where: { deletedAt: null, project: { clientId } },
        orderBy: { createdAt: "asc" },
        select: { title: true, content: true, project: { select: { name: true } } },
        take: 30, // el bloque igual se recorta a manualCap; sin take, un cliente con muchas fuentes @db.Text cargaría MB para tirar casi todo
      });
      if (manualSources.length > 0) {
        const joined = manualSources
          .map((s, i) => `### Fuente manual [proyecto: ${s.project?.name ?? "?"}]: ${s.title?.trim() || `(sin título ${i + 1})`}\n${s.content.trim()}`)
          .join("\n\n---\n\n")
          .slice(0, CTX.manualCap);
        manualSourcesContent = `=== FUENTES MANUALES (transcripts/resúmenes pegados a mano por el equipo — fuente complementaria; atribuí explícitamente lo que salga de acá) ===\n${joined}\n\n`;
      }
    }

    if (isHandoffAgent) {
      const scopeLabel = bodyProjectId ? "sesiones del proyecto" : "clasificación 90d";
      console.log(
        `[analyze handoff] ${scopeLabel} (${matchingSessions.length} candidatas → ${salesSessions.length} incluidas → ${topSales.length} usadas):`,
      );
      for (const s of topSales) {
        const dateStr = new Date(s.date).toISOString().slice(0, 10);
        const reason = bodyProjectId ? "vinculada al proyecto" : classifyForHandoff(s).reason;
        console.log(`  ✓ [${dateStr}] "${s.title}" — ${reason}`);
      }
      // Excluidas = candidatas que NO terminaron usadas (por clasificador/90d o por el cap).
      const excluded = matchingSessions.filter(
        (s) => !topSales.some((t) => t.id === s.id),
      );
      for (const s of excluded.slice(0, 8)) {
        const dateStr = new Date(s.date).toISOString().slice(0, 10);
        const inSales = salesSessions.some((sl) => sl.id === s.id);
        const reason = inSales
          ? `no usada (cap de ${isHandoffAgent ? 10 : CTX.maxSales})`
          : bodyProjectId
          ? "vinculada pero no usada"
          : s.date < handoffCutoffMs
          ? "fuera de 90d"
          : classifyForHandoff(s).reason;
        console.log(`  ✗ [${dateStr}] "${s.title}" — ${reason}`);
      }
    }
  } catch (e) {
    console.error("[analyze] Sessions error:", e);
  }

  // ── 5. Fetch notas del Data Lake ──────────────────────────────────────────────
  let dataLakeContent = "";
  try {
    const searchTerm = titleTerms[0] ?? companyName;
    const { data: rows } = await getDataLake()
      .from("hs_notes")
      .select("content")
      .ilike("content", `%${searchTerm}%`)
      .order("id", { ascending: false })
      .limit(20);

    if (rows && rows.length > 0) {
      dataLakeContent = rows
        .map((r: { content: string }, i: number) => `[Nota ${i + 1}]\n${r.content}`)
        .join("\n\n");
    }
  } catch (e) {
    console.error("[analyze] Data Lake error:", e);
  }

  // ── Knowledge base (PUBLISHED + pineados al agente) ──────────────────────
  let knowledgeBaseContent = "";
  try {
    // 1. Pineados al agente: completos, al inicio, marcados como REFERENCIA PRINCIPAL
    const pinnedIds = agent.pinnedKnowledgeIds ?? [];
    const pinnedDocs = pinnedIds.length > 0
      ? await prisma.knowledgeDocument.findMany({
          where: { id: { in: pinnedIds }, status: "PUBLISHED" },
          select: { id: true, type: true, title: true, summary: true, content: true },
        })
      : [];

    // 2. Top 15 PUBLISHED por updatedAt, excluyendo los ya pineados, truncados como antes
    const topDocs = await prisma.knowledgeDocument.findMany({
      where: { status: "PUBLISHED", id: { notIn: pinnedIds } },
      select: { type: true, title: true, summary: true, content: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    });

    const pinnedBlock = pinnedDocs.map(doc => {
      const parts = [`### [REFERENCIA PRINCIPAL — ${doc.type}] ${doc.title}`];
      if (doc.summary?.trim()) parts.push(`**Resumen:** ${doc.summary.trim()}`);
      parts.push(doc.content.trim()); // sin truncar
      return parts.join("\n");
    });

    const topBlock = topDocs.map(doc => {
      const parts = [`### [${doc.type}] ${doc.title}`];
      if (doc.summary?.trim()) parts.push(`**Resumen:** ${doc.summary.trim()}`);
      parts.push(doc.content.trim().slice(0, 1500));
      return parts.join("\n");
    });

    knowledgeBaseContent = [...pinnedBlock, ...topBlock].join("\n\n---\n\n");
  } catch (e) {
    console.error("[analyze] Knowledge base error:", e);
  }

  // ── 6. Construir contexto de notas por subetapa ──────────────────────────────
  const stageNotesContent = stageNotes
    .filter((n) => n.content?.trim())
    .map((n) => `[Etapa ${n.stage} / Paso ${n.step}]\n${n.content}`)
    .join("\n\n");

  // ── 7. Construir contexto de documentos adjuntos ──────────────────────────────
  const docsContent = clientDocuments
    .map((d) => {
      if (d.content?.trim()) {
        return `[Doc: ${d.title}]\n${d.content}`;
      }
      // FILE documents without extracted content — mention their existence
      if (d.type === "FILE") {
        const meta = [d.fileName, d.mimeType, d.fileSize ? `${(d.fileSize / 1024).toFixed(0)}KB` : null].filter(Boolean).join(" · ");
        return `[Archivo adjunto: ${d.title}] (${meta}) — sin texto extraído`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n\n");

  // ── 8. Construir contexto previo de las cards ────────────────────────────────
  const previousCards = existingCards.length > 0
    ? existingCards
        .filter((c) => c.content.trim())
        .map((c) => `**${c.title}:**\n${c.content}`)
        .join("\n\n")
    : "";

  // ── 9. Tipo de output del agente ──────────────────────────────────────────────
  const isFlowchart         = agent.outputType === "FLOWCHART";
  const isCardsAndFlowcharts = agent.outputType === "CARDS_AND_FLOWCHARTS";

  // ── 9a2. Resolver canvas destino para agentes no-default ────────────────────
  // AGENT_GROUP_TO_CANVAS se importa de lib/canvas/default-canvases.ts (fuente única).
  let targetCanvasId: string | null = null;
  if (bodyProjectId && agent.agentGroup && AGENT_GROUP_TO_CANVAS[agent.agentGroup]) {
    const targetCanvas = await prisma.projectCanvas.findFirst({
      where: { projectId: bodyProjectId, name: AGENT_GROUP_TO_CANVAS[agent.agentGroup] },
      select: { id: true },
    });
    if (targetCanvas) targetCanvasId = targetCanvas.id;
  }

  // ── 9b. System prompt efectivo ────────────────────────────────────────────────
  let effectiveSystemPrompt = agent.additionalInstructions
    ? `${agent.systemPrompt}\n\n${agent.additionalInstructions}`
    : agent.systemPrompt;

  // ESTILO obligatorio para TODOS los agentes (la salida es de cara al cliente). Se
  // appendea acá para que pise cualquier voseo que tenga el prompt del agente en la DB.
  effectiveSystemPrompt +=
    "\n\n---\nESTILO (OBLIGATORIO): Usa español con TUTEO neutro (segunda persona con \"tú\"). Conjuga SIEMPRE en forma de tú: \"Transforma\", \"centraliza\", \"optimiza\", \"conecta\", \"tienes\", \"puedes\", \"necesitas\", \"tu equipo\". PROHIBIDO el voseo: NUNCA escribas \"Transformá\", \"centralizá\", \"optimizá\", \"tenés\", \"querés\", \"podés\", \"necesitás\" ni \"vos\".";

  // Para CARDS_AND_FLOWCHARTS: instrucción sobre CUÁNTOS flowcharts generar. El agente de MAPEO
  // (agent-mapeo-inicial, prompt v4) mapea TODOS los procesos con sustancia — la legibilidad es
  // POR diagrama (10-18 nodos), no un límite de cantidad. ⚠ Mantener alineado con el prompt en DB
  // (scripts/update-mapeo-agent.ts): si uno dice "todos" y el otro "1-3", el agente recibe
  // órdenes contradictorias. Los demás CAF (p.ej. diagnóstico) conservan su exhaustividad propia.
  if (isCardsAndFlowcharts) {
    if (isMapeoAgent) {
      effectiveSystemPrompt +=
        "\n\n---\nINSTRUCCIÓN: PRIMERO enumera los procesos operativos DISTINTOS que el cliente describió CON SUSTANCIA en las fuentes (ventas, servicio/tickets, cobranza, onboarding, integración…). Genera UN flowchart por CADA UNO (típico 2-5). La legibilidad se logra POR diagrama (pipeline: 10-18 nodos; mapa de sistemas: 3-8 sistemas — consolida micro-pasos), NO recortando procesos. No dupliques un proceso ya cubierto como etapa de otro salvo zoom con detalle nuevo. Si un proceso se menciona al pasar sin detalle operativo, no inventes el diagrama: va a 'Puntos ciegos' de la card.";
    } else {
      effectiveSystemPrompt +=
        "\n\n---\nINSTRUCCIÓN CRÍTICA: Analiza los datos del cliente como si fuera la PRIMERA VEZ que los ves, sin asumir ningún resultado previo. Identifica TODOS los procesos operacionales distintos mencionados en las transcripciones, notas y documentos. Cada proceso que tenga un flujo de trabajo propio (con pasos, responsables o herramientas diferentes) debe tener SU PROPIO flowchart independiente. Reglas estrictas: (1) Sé exhaustivo — NO omitas ningún proceso identificable. (2) NO combines procesos distintos en un solo flowchart. (3) El número final de flowcharts debe reflejar exactamente cuántos procesos operacionales distintos encontraste. (4) Si identificas N procesos → genera N flowcharts. Nunca menos.";
    }
  }

  // Agente de subetapa no-primero: tiene step específico asignado y no es el paso 1.
  // Los agentes globales/wildcard (associatedStep === null) no participan en la cadena.
  // Encadenar si el agente tiene step específico y no es el primero (step 0)
  const isStepChained = agent.associatedStep !== null && bodyStep > 0;

  // Para todos los agentes encadenados: priorizar enriquecimiento humano del CSE.
  // El user message incluirá cards del step anterior etiquetadas con su fuente.
  if (isStepChained) {
    effectiveSystemPrompt +=
      "\n\n---\nREGLA DE ENRIQUECIMIENTO HUMANO: En el contexto que recibirás aparecerán cards del análisis anterior etiquetadas con su origen. Debes tratarlas así:\n" +
      "- [AGENTE]: generada por IA en la subetapa anterior. Úsala como base.\n" +
      "- [MODIFICADO POR CSE ⚠️]: el consultor humano corrigió o enriqueció esta card. Su contenido es verdad validada — NUNCA lo contradigas, ignores ni reemplaces. Incorpóralo íntegramente en tu análisis.\n" +
      "- [CREADO POR CSE ⚠️]: el consultor humano creó esta card desde cero. Representa conocimiento experto directo — dale MÁXIMA PRIORIDAD y asegúrate de que esté reflejado en tu output.\n" +
      "En caso de conflicto entre lo que dicen las transcripciones/documentos y una card marcada con ⚠️, prevalece siempre la card del CSE.";
  }

  // Instrucción de prioridad del canvas de proyecto
  effectiveSystemPrompt +=
    "\n\n---\nPRIORIDAD DEL CANVAS: La sección 'CANVAS DEL PROYECTO' contiene información que el consultor revisó y validó. " +
    "Si hay contradicciones entre el canvas y otras fuentes (transcripciones, ejecuciones anteriores, datos del CRM), " +
    "PRIORIZA SIEMPRE lo que dice el canvas. El canvas es la fuente de verdad del proyecto.";

  // Inyectar reglas de formato para agentes que apuntan a canvases no-default.
  // Los GRUPOS que usan el formato sections+blocks (en lugar de cards): handoff,
  // kickoff, diagnostico y planificacion. El render de esos canvases
  // (CanvasLinearView / SectionBlockList / KickoffLanding) lee CanvasBlock, no
  // ClientContextCard — por eso estos agentes deben persistir como blocks.
  // Se chequea por agentGroup (no por id) para no hardcodear el cuid del handoff
  // y para que cualquier agente futuro del grupo herede el formato. Los agentes
  // dormidos del grupo "diagnostico" (funnel/marketing) no tienen disparador en
  // la UI, así que esto no cambia su comportamiento en la práctica.
  const BLOCK_FORMAT_GROUPS = new Set(["handoff", "kickoff", "diagnostico", "planificacion"]);
  const useBlockFormat =
    !!targetCanvasId && !!agent.agentGroup && BLOCK_FORMAT_GROUPS.has(agent.agentGroup);
  if (targetCanvasId) {
    const tcSections = await prisma.canvasSection.findMany({
      where: { canvasId: targetCanvasId },
      orderBy: { order: "asc" },
      select: { key: true, label: true },
    });
    if (tcSections.length > 0) {
      if (useBlockFormat) {
        effectiveSystemPrompt += getBlockOutputFormatInstructions({ targetSections: tcSections });
      } else {
        effectiveSystemPrompt += getOutputFormatInstructions({ targetSections: tcSections });
      }
    }
  } else if (bodyProjectId && agent.outputType === "CARDS") {
    // Para agentes CARDS apuntando al canvas por defecto: inyectar secciones del canvas
    // para que el agente distribuya sus cards correctamente con canvasSection.
    const defaultCanvasSections = [
      { key: "objetivo_alcance", label: "Objetivo y alcance" },
      { key: "hipotesis_recomendaciones", label: "Hipótesis y recomendaciones" },
      { key: "procesos", label: "Procesos" },
      { key: "plan_implementacion", label: "Plan de implementación" },
    ];
    effectiveSystemPrompt += getOutputFormatInstructions({ targetSections: defaultCanvasSections });
  }

  // ── 9c. Canvas: cargar para contexto ──────────────────────────────────────────
  const clientCanvas = (client.canvas as ClientCanvas | null) ?? EMPTY_CLIENT_CANVAS;

  // Canvas de proyecto: ahora se lee desde ClientContextCard en vez de Project.canvas JSON
  let projectCanvasText = "";
  if (bodyProjectId) {
    const canvasCards = await prisma.clientContextCard.findMany({
      where: { projectId: bodyProjectId, canvasSection: { not: null } },
      orderBy: [{ canvasSection: "asc" }, { canvasOrder: "asc" }],
      select: { title: true, content: true, canvasSection: true, cardType: true },
    });

    if (canvasCards.length > 0) {
      const sectionLabels: Record<string, string> = {
        objetivo_alcance: "Objetivo y alcance",
        hipotesis_recomendaciones: "Hipótesis y recomendaciones",
        procesos: "Procesos",
        plan_implementacion: "Plan de implementación",
        documentos: "Documentos del cliente",
      };
      const grouped = new Map<string, typeof canvasCards>();
      canvasCards.forEach((c) => {
        const s = c.canvasSection!;
        if (!grouped.has(s)) grouped.set(s, []);
        grouped.get(s)!.push(c);
      });
      const parts: string[] = [];
      for (const [sectionKey, cards] of grouped.entries()) {
        const label = sectionLabels[sectionKey] ?? sectionKey;
        parts.push(`[Sección: ${label}]`);
        for (const c of cards) {
          if (c.cardType === "FLOWCHART") {
            parts.push(`- Card: "${c.title}" → (diagrama de proceso)`);
          } else {
            parts.push(`- Card: "${c.title}" → ${c.content.slice(0, 500)}`);
          }
        }
      }
      projectCanvasText = parts.join("\n");
    }
  }

  // Set de IDs de cards que ya están en el canvas (para excluir del step chaining)
  const canvasCardIds = new Set<string>();
  if (bodyProjectId) {
    const idsInCanvas = await prisma.clientContextCard.findMany({
      where: { projectId: bodyProjectId, canvasSection: { not: null } },
      select: { id: true, parentCardId: true },
    });
    idsInCanvas.forEach((c) => {
      canvasCardIds.add(c.id);
      if (c.parentCardId) canvasCardIds.add(c.parentCardId); // Excluir también el original
    });
  }

  // ── 10. Construir user message unificado ──────────────────────────────────────
  // Siempre incluir serviceType si está disponible (aunque no haya deal en HubSpot)
  const serviceTypeLabel = dealProject?.serviceType ?? null;

  // Clasificación del proyecto (tira de tags): modalidad impl/re-impl + productos/alcance.
  // Alimenta a TODOS los agentes que leen este bloque (handoff, kickoff, detalle del
  // cronograma) para que razonen el #6 (tarea de BD) y el #7 (fase técnica).
  const classificationLabel = (() => {
    const parts: string[] = [];
    if (dealProject?.implementationType) parts.push(`Modalidad: ${MODALITY_LABEL[dealProject.implementationType]}`);
    const labels = tagLabels(sanitizeTags(dealProject?.tags ?? []));
    if (labels.length) parts.push(`Productos/alcance: ${labels.join(", ")}`);
    return parts.length ? parts.join(" · ") : null;
  })();

  // ── 3c. Output del agente de la subetapa anterior (step - 1) ─────────────────
  // Cada agente se alimenta del output estructurado del agente anterior en la cadena.
  let prevStepCards: { title: string; content: string; source: string }[] = [];
  let prevStepLabel: string | null = null;
  // También incluir cards manuales (HUMAN) y modificadas (MODIFIED) que el CSE añadió
  // al pool del cliente aunque no estén vinculadas a un run específico.
  let prevStepHumanCards: { title: string; content: string; source: string }[] = [];
  if (isStepChained) {
    // Encadenamiento por grupo temático: traer runs de agentes con groupOrder menor
    // Fallback a stage/step si el agente no tiene groupOrder
    const currentGroupOrder = agent?.groupOrder ?? 0;
    const prevRuns = await prisma.agentRun.findMany({
      where: {
        clientId,
        ...(bodyProjectId ? { projectId: bodyProjectId } : {}),
        status: "DONE",
        agent: currentGroupOrder > 0
          ? { groupOrder: { lt: currentGroupOrder } }
          : { associatedStep: { lt: bodyStep } },
      },
      orderBy: [{ createdAt: "desc" }],
      distinct: ["agentId"],
      select: { id: true, step: true, stepLabel: true, agent: { select: { name: true } } },
    });

    if (prevRuns.length > 0) {
      prevStepLabel = prevRuns.map((r) => r.agent?.name ?? r.stepLabel ?? `Step ${r.step}`).join(" → ");
      const runIds = prevRuns.map((r) => r.id);
      const allPrevCards = await prisma.clientContextCard.findMany({
        where: { agentRunId: { in: runIds } },
        orderBy: { order: "asc" },
        select: { id: true, title: true, content: true, source: true },
      });
      // Excluir cards que ya están en el canvas (se reciben por la vía del canvas)
      prevStepCards = allPrevCards
        .filter((c) => !canvasCardIds.has(c.id))
        .map(({ title, content, source }) => ({ title, content, source }));
    }
    // Cards creadas manualmente por el CSE (sin agentRunId), excluyendo las del canvas
    const allHumanCards = await prisma.clientContextCard.findMany({
      where: { clientId, agentRunId: null, source: "HUMAN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, content: true, source: true },
    });
    prevStepHumanCards = allHumanCards
      .filter((c) => !canvasCardIds.has(c.id))
      .map(({ title, content, source }) => ({ title, content, source }));
  }

  // Bloque del timeline de HubSpot (notas + Zoom), inyectado junto a las fuentes crudas.
  const hubspotTimelineBlock = companyTimelineContent.trim()
    ? `=== TIMELINE DE HUBSPOT (notas + llamadas/reuniones Zoom) ===
${companyTimelineContent.slice(0, CTX.timelineCap)}

`
    : "";

  const baseUserMessage = `Empresa: ${companyName}
Industria: ${client.industry ?? "No especificada"}
Notas base: ${client.notes ?? "Sin notas"}
${serviceTypeLabel ? `Tipo de servicio contratado: ${serviceTypeLabel}` : ""}
${classificationLabel ? `Clasificación del proyecto: ${classificationLabel}` : ""}

${(() => {
  const escala = (clientCanvas as unknown as Record<string, unknown>)?.escala_rendimiento as { general?: number; por_hub?: { marketing?: number; sales?: number; service?: number }; objetivo?: number } | undefined;
  if (!escala || (escala.general ?? 0) === 0) return "";
  const hubLines = [];
  if (escala.por_hub?.marketing) hubLines.push(`  - Marketing Hub: nivel ${escala.por_hub.marketing}/4`);
  if (escala.por_hub?.sales) hubLines.push(`  - Sales Hub: nivel ${escala.por_hub.sales}/4`);
  if (escala.por_hub?.service) hubLines.push(`  - Service Hub: nivel ${escala.por_hub.service}/4`);
  return `=== ESCALA DE RENDIMIENTO DEL CLIENTE ===
⚠️ IMPORTANTE: El cliente está en NIVEL ${escala.general}/4 de madurez.
${hubLines.join("\n")}
${escala.objetivo ? `Meta: llegar a nivel ${escala.objetivo}/4.` : ""}

Calibra tus recomendaciones a este nivel:
- NO propongas soluciones de nivel ${Math.min((escala.general ?? 0) + 2, 4)} a un cliente en nivel ${escala.general}.
- La meta es avanzar AL SIGUIENTE nivel, no saltar dos o tres niveles.
- Referencia: Nivel 0=Deficiente, 1=Básico, 2=Estructurado, 3=Optimizado, 4=Inteligente.

`;
})()}${bodyProjectId ? `=== CANVAS DE EMPRESA (conocimiento compartido del cliente) ===
Úsalo como base. Contenido existente = conocimiento validado. Campos vacíos = oportunidad de llenar.
${JSON.stringify(clientCanvas, null, 2)}

${projectCanvasText ? `=== CANVAS DEL PROYECTO (información validada por el consultor — PRIORIDAD MÁXIMA) ===
La siguiente información fue revisada y validada por el consultor. Si hay contradicciones entre el canvas y otras fuentes (transcripciones, ejecuciones anteriores), PRIORIZA lo que dice el canvas.

${projectCanvasText}` : "=== CANVAS DEL PROYECTO ===\n(Sin información validada aún)"}

` : ""}${prevStepCards.length > 0 || prevStepHumanCards.length > 0 ? `=== ANÁLISIS DE LA SUBETAPA ANTERIOR${prevStepLabel ? ` (${prevStepLabel})` : ""} ===
Cards del paso anterior para referencia:

${[
  ...prevStepCards.map((c) => {
    const tag = c.source === "MODIFIED" ? "[MODIFICADO POR CSE ⚠️]" : c.source === "HUMAN" ? "[CREADO POR CSE ⚠️]" : "[AGENTE]";
    return `${tag} **${c.title}:**\n${c.content}`;
  }),
  ...prevStepHumanCards.map((c) => `[CREADO POR CSE ⚠️] **${c.title}:**\n${c.content}`),
].join("\n\n")}\n\n` : ""}${acquisitionContent ? `=== DATOS DE ADQUISICIÓN (HubSpot empresa) ===\n${acquisitionContent}\n\n` : ""}${dealContent ? `=== DEAL CERRADO Y PRODUCTOS (HubSpot) ===\n${dealContent}\n\n` : serviceTypeLabel ? `=== SERVICIO CONTRATADO ===\nTipo de servicio: ${serviceTypeLabel}\n(No se encontró deal en HubSpot, pero el tipo de servicio contratado es ${serviceTypeLabel})\n\n` : ""}${hubspotTimelineBlock}${!isCardsAndFlowcharts && previousCards ? `=== CONTEXTO ACTUAL (ya registrado) ===\n${previousCards.slice(0, 3000)}\n\n` : ""}${stageNotesContent ? `=== NOTAS DEL WORKSPACE (por subetapa) ===\n${stageNotesContent.slice(0, 3000)}\n\n` : ""}${docsContent ? `=== DOCUMENTOS ADJUNTOS (propuestas, archivos del cliente, páginas web) ===\n${docsContent.slice(0, isHandoffAgent ? 12000 : 3000)}\n\n` : ""}${dataLakeContent ? `=== NOTAS DE HUBSPOT (Data Lake) ===\n${dataLakeContent.slice(0, 4000)}\n\n` : ""}${salesFirefliesContent ? `=== TRANSCRIPCIONES DE VENTAS (llamadas comerciales pre-venta) ===\nEstas son llamadas donde participó el equipo de ventas. Contienen información valiosa sobre: qué se prometió, por qué el cliente compró, dolores mencionados, objeciones, expectativas, y acuerdos verbales.\n${salesFirefliesContent.slice(0, isHandoffAgent ? 12000 : CTX.salesBlockCap)}\n\n` : ""}${manualSourcesContent}${firefliesContent ? `=== TRANSCRIPCIONES DE CS/KICKOFF (sesiones de implementación) ===\n${firefliesContent.slice(0, CTX.csBlockCap)}\n\n` : ""}${knowledgeBaseContent ? `=== BASE DE CONOCIMIENTO ===\n${knowledgeBaseContent.slice(0, 4000)}\n\n` : ""}
Analiza toda la información anterior y completa las secciones de contexto del cliente.`;

  // ── 10b. Input del agente Kickoff ─────────────────────────────────────────────
  // El Kickoff NO consume las fuentes crudas (transcripts/docs/deal): su input es
  // el HANDOFF ya curado (bloques CONFIRMED) + el cronograma. Gateado por id para
  // no afectar a ningún otro agente (diagnóstico, handoff, etc. quedan intactos).
  const isKickoffAgent = agent.id === "agent-kickoff-canvas";
  let userMessage = baseUserMessage;
  if (isKickoffAgent && bodyProjectId) {
    // El kickoff es interno: usa el handoff GENERADO aunque esté en borrador (no se
    // exige aceptación). El guard de arriba ya cortó si no hay handoff, así que el
    // fallback de abajo es una red de seguridad inalcanzable en la práctica.
    const handoffCtx = await loadCanvasContext(bodyProjectId, "Handoff", { onlyConfirmed: false });
    const timelineCtx = await loadTimelineContext(bodyProjectId);
    userMessage = `Empresa: ${companyName}
Industria: ${client.industry ?? "No especificada"}
${serviceTypeLabel ? `Tipo de servicio contratado: ${serviceTypeLabel}\n` : ""}
=== HANDOFF DEL PROYECTO (ESTA ES TU ÚNICA FUENTE) ===
${handoffCtx || "(Sin handoff todavía. Indicá en cada sección que falta el handoff; no inventes contenido.)"}

${timelineCtx ? `${timelineCtx}\n\n` : ""}Generá la landing de kickoff de cara al cliente siguiendo tus instrucciones: tono cliente, sin inflar alcance/objetivos (solo lo respaldado por el handoff), métricas como propuesta de Smarteam si no están explícitas, y NO reproduzcas el cronograma en prosa (la plantilla lo muestra aparte).`;
  }

  // ── 10b''. Input del agente de Planificación ─────────────────────────────────
  // Como el Kickoff, NO consume fuentes crudas: su input es el HANDOFF + el
  // DIAGNÓSTICO ya curados del proyecto. Gateado por grupo (planificacion).
  const isPlanificacionAgent = agent.agentGroup === "planificacion";
  if (isPlanificacionAgent && bodyProjectId) {
    const handoffCtx = await loadCanvasContext(bodyProjectId, "Handoff", { onlyConfirmed: false });
    const diagnosticoCtx = await loadCanvasContext(bodyProjectId, "Diagnóstico", { onlyConfirmed: false });
    userMessage = `Empresa: ${companyName}
Industria: ${client.industry ?? "No especificada"}
${serviceTypeLabel ? `Tipo de servicio contratado: ${serviceTypeLabel}\n` : ""}
=== HANDOFF DEL PROYECTO (alcance contratado, expectativas, acuerdos) ===
${handoffCtx || "(Sin handoff todavía.)"}

=== DIAGNÓSTICO DEL PROYECTO (estado actual, gaps, recomendaciones) ===
${diagnosticoCtx || "(Sin diagnóstico todavía. Si falta, indicá en cada sección qué necesitás del diagnóstico; no inventes contenido.)"}

Generá el plan de implementación siguiendo tus instrucciones: arquitectura de la solución, roadmap, definición de procesos y métricas de éxito. Cíñete a lo respaldado por el handoff y el diagnóstico; no inventes alcance ni fechas.`;
  }

  // ── 10b'. Input del agente de Detalle de Cronograma (D.1) ────────────────────
  // Como el Kickoff, NO consume fuentes crudas: su input es el cronograma
  // EXISTENTE (fases con ids — debe referenciarlas, no crearlas) + el handoff
  // curado para que las tareas sean del proyecto real. Sin fechas en el
  // contexto: el agente no las calcula.
  if (isTimelineDetailAgent && bodyProjectId) {
    const handoffCtx = await loadCanvasContext(bodyProjectId, "Handoff", { onlyConfirmed: true });
    const timelineCtx = await loadTimelineContext(bodyProjectId, { includeIds: true });

    // Reglas #6 (tarea de BD) y #7 (tareas técnicas) derivadas de la clasificación del proyecto.
    const projTagSlugs = sanitizeTags(dealProject?.tags ?? []);
    const isReimpl = dealProject?.implementationType === "REIMPLEMENTATION";
    const hasMigration = projTagSlugs.includes("crm_migration");
    const hasTechnical = projTagSlugs.includes("custom_dev") || projTagSlugs.includes("insider_one");
    const dbTaskRule = isReimpl && !hasMigration
      ? `- BASE DE DATOS (#6): es una RE-IMPLEMENTACIÓN sobre un HubSpot que el cliente YA usa, SIN migración desde otro CRM. NO incluyas una tarea de "cargar/crear la base de datos"; en su lugar, en la primera fase, incluí una tarea de REVISIÓN DE ESTRUCTURA Y LIMPIEZA de la base existente (propiedades, duplicados, datos sucios).`
      : `- BASE DE DATOS (#6): ${isReimpl ? "es una re-implementación pero CON migración desde otro CRM" : "es una implementación desde cero"}, así que SÍ incluí en la primera fase una tarea de CARGAR/ESTRUCTURAR LA BASE DE DATOS (importar y modelar los datos en HubSpot).`;
    const techRule = hasTechnical
      ? `\n- DESARROLLO/INTEGRACIÓN (#7): el proyecto lleva desarrollo a medida o Insider One. Las tareas técnicas (integraciones, desarrollo, APIs) marcalas con responsable "DEV" y, si existe una fase de "Desarrollo / Integración", ubicalas SOLO ahí (no las mezcles con las tareas funcionales de otras fases).`
      : "";

    userMessage = `Empresa: ${companyName}
Industria: ${client.industry ?? "No especificada"}
${serviceTypeLabel ? `Tipo de servicio contratado: ${serviceTypeLabel}\n` : ""}${classificationLabel ? `Clasificación del proyecto: ${classificationLabel}\n` : ""}
=== CRONOGRAMA A DETALLAR (fases EXISTENTES — no cambies nombres, duraciones ni orden) ===
${timelineCtx}

=== HANDOFF CURADO (bloques confirmados por el CSE) ===
${handoffCtx || '(Sin handoff confirmado. Generá las tareas típicas del tipo de cada fase y marcá CADA una con "porValidar": true. Títulos limpios, sin marcadores.)'}

=== REGLAS SEGÚN LA CLASIFICACIÓN ===
${dbTaskRule}${techRule}

Detallá el cronograma siguiendo tus instrucciones: asigná un activityType a cada fase y proponé las tareas por semana (weekIndex relativo a la fase, < durationWeeks). Usá los ids EXACTOS del input.`;
  }

  // ── 10c. Marco breve de relación previa (solo agente Handoff) ────────────────
  // Le da al agente conciencia de la relación previa del cliente con Smarteam
  // (proyectos/handoffs anteriores) ADEMÁS del deal ancla en profundidad. Budget
  // chico (~2.5k chars) y aditivo — no diluye las fuentes principales.
  if (isHandoffAgent) {
    try {
      const [priorProjects, priorHandoffs] = await Promise.all([
        prisma.project.findMany({
          where: {
            clientId,
            serviceType: { not: "__strategy__" },
            ...(bodyProjectId ? { id: { not: bodyProjectId } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { name: true, status: true, serviceType: true, createdAt: true },
        }),
        prisma.handoff.findMany({
          where: { clientId, ...(bodyProjectId ? { projectId: { not: bodyProjectId } } : {}) },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { createdAt: true, hubspotDealId: true, project: { select: { name: true } } },
        }),
      ]);
      if (priorProjects.length > 0 || priorHandoffs.length > 0) {
        const projLines = priorProjects.map(
          (p) => `- ${p.name}${p.serviceType ? ` (${p.serviceType})` : ""} · ${p.status} · ${p.createdAt.toISOString().slice(0, 10)}`,
        );
        const hoLines = priorHandoffs.map(
          (h) => `- ${h.project.name} · ${h.createdAt.toISOString().slice(0, 10)}${h.hubspotDealId ? ` · deal ${h.hubspotDealId}` : ""}`,
        );
        const frame = [
          "=== RELACIÓN PREVIA DEL CLIENTE CON SMARTEAM (contexto — no lo repitas literal) ===",
          "Este puede NO ser el primer proyecto del cliente. Usalo solo para no contradecir la historia previa ni duplicar lo ya entregado; el foco de tu análisis sigue siendo el deal ancla y las sesiones de ventas.",
          priorProjects.length ? `Proyectos previos (${priorProjects.length}):\n${projLines.join("\n")}` : "",
          priorHandoffs.length ? `Handoffs previos (${priorHandoffs.length}):\n${hoLines.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 2500);
        userMessage = `${userMessage}\n\n${frame}`;
      }
    } catch (e) {
      console.error("[analyze handoff] marco relación previa error:", e);
    }
  }

  // ── 11. Llamar a Claude ───────────────────────────────────────────────────────
  // CARDS_AND_FLOWCHARTS genera varios diagramas grandes (8-15 nodos c/u) + cards;
  // con 16k la salida se trunca (stop_reason=max_tokens) → JSON irrecuperable →
  // invalid_response → run fallido. Más techo evita la truncación.
  // El mapeo puede emitir 4-6 diagramas (~4-6k tokens c/u) + card → 32k es riesgo
  // cierto de max_tokens; 64k da margen (Sonnet lo soporta con streaming, que este
  // path ya usa; el techo no cuesta — se factura lo generado).
  const maxTokens = isCardsAndFlowcharts ? (isMapeoAgent ? 64000 : 32000) : 16000;
  let analysisJson: {
    cards?: { title: string; content: string }[];
    suggestions?: Array<{ title?: string; content?: string; type?: string; suggestedSection?: string }>;
    nodes?: unknown[]; edges?: unknown[]; title?: string;
    flowcharts?: Array<{ title?: string; description?: string; nodes: unknown[]; edges: unknown[] }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sections?: any[];
    pendingItems?: Array<{ text?: string; source?: string }>;
    // D.1 — output del agente de detalle de cronograma
    timelineDetail?: { phases?: unknown[] };
  } | null = null;

  try {
    // CARDS_AND_FLOWCHARTS usa max_tokens alto (32k) → el SDK de Anthropic EXIGE
    // streaming para requests que podrían tardar >10 min en no-streaming ("Streaming
    // is required for operations that may take longer than 10 minutes"). .stream()
    // .finalMessage() acumula y devuelve el mismo Message. temperature 0 = salidas
    // deterministas entre ejecuciones.
    const msg = isCardsAndFlowcharts
      ? await anthropic.messages
          .stream({
            model: "claude-sonnet-4-6",
            max_tokens: maxTokens,
            temperature: 0,
            system: effectiveSystemPrompt,
            messages: [{ role: "user", content: userMessage }],
          })
          .finalMessage()
      : await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: maxTokens,
          system: effectiveSystemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

    const stopReason = msg.stop_reason;
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();

    // ── Logging diagnóstico para CARDS_AND_FLOWCHARTS ─────────────────────────
    if (isCardsAndFlowcharts) {
      console.log(`[analyze CAF] stop_reason=${stopReason} | chars=${raw.length} | maxTokens=${maxTokens}`);
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        analysisJson = JSON.parse(jsonMatch[0]);
        if (isCardsAndFlowcharts) {
          console.log(`[analyze CAF] JSON OK – cards=${analysisJson?.cards?.length ?? 0} flowcharts=${analysisJson?.flowcharts?.length ?? 0}`);
          if (stopReason === "max_tokens") {
            console.warn("[analyze CAF] stop_reason=max_tokens con JSON válido — posible truncación de flowcharts");
          }
        }
      } catch {
        if (isCardsAndFlowcharts) {
          // Intentar reparar JSON truncado (ocurre cuando stop_reason=max_tokens)
          console.warn(`[analyze CAF] JSON.parse falló (stop_reason=${stopReason}), intentando reparación...`);
          const repaired = repairTruncatedJson(jsonMatch[0]);
          if (repaired) {
            try {
              analysisJson = JSON.parse(repaired);
              // Filtrar flowcharts incompletos (sin nodos) que quedaron al cortar
              if (analysisJson?.flowcharts) {
                const before = analysisJson.flowcharts.length;
                analysisJson.flowcharts = analysisJson.flowcharts.filter(
                  (fc) => Array.isArray((fc as { nodes?: unknown[] }).nodes) && (fc as { nodes: unknown[] }).nodes.length > 0
                );
                console.log(`[analyze CAF] Reparado: ${before} → ${analysisJson.flowcharts.length} flowcharts válidos`);
              }
            } catch {
              console.error("[analyze CAF] Reparación fallida — JSON irrecuperable");
            }
          }
        } else if (useBlockFormat) {
          // Recuperación para block format (sections + blocks)
          console.warn(`[analyze blocks] JSON.parse falló (stop_reason=${stopReason}), intentando reparación...`);
          const repaired = repairTruncatedJson(jsonMatch[0]);
          if (repaired) {
            try {
              analysisJson = JSON.parse(repaired);
              if (analysisJson?.sections) {
                // Filter sections with at least one block that has content
                analysisJson.sections = analysisJson.sections.filter(
                  (s: { blocks?: Array<{ type?: string }> }) => (s.blocks?.length ?? 0) > 0
                );
                console.log(`[analyze blocks] Reparado: ${analysisJson.sections.length} secciones válidas`);
              }
            } catch {
              console.error("[analyze blocks] Reparación fallida");
            }
          }
        } else if (!isFlowchart) {
          // Recuperación parcial para CARDS
          const partialCards: { title: string; content: string }[] = [];
          const cardRegex = /\{\s*"title"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
          let m;
          while ((m = cardRegex.exec(jsonMatch[0])) !== null) {
            partialCards.push({
              title: m[1],
              content: m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
            });
          }
          if (partialCards.length > 0) {
            console.warn(`[analyze] JSON truncado — recuperadas ${partialCards.length} cards`);
            analysisJson = { cards: partialCards };
          } else {
            console.error("[analyze] JSON truncado sin cards recuperables");
          }
        }
      }
    }
  } catch (e: unknown) {
    console.error("[analyze] Claude error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    const isCredits = msg.includes("credit balance") || msg.includes("too low");
    return NextResponse.json(
      {
        error: isCredits ? "NO_CREDITS" : "CLAUDE_ERROR",
        message: isCredits
          ? "Sin créditos en la API de Anthropic. Recarga en console.anthropic.com → Billing."
          : "Error al ejecutar el agente. Intenta de nuevo.",
      },
      { status: 500 }
    );
  }

  // Validar según outputType. Mensajes legibles: el agente a veces devuelve un
  // output vacío/malformado (típico cuando se cortó por tokens) → el CSE necesita
  // saber que es reintentable, no un código seco.
  if (isFlowchart) {
    if (!analysisJson?.nodes || !Array.isArray(analysisJson.nodes) || analysisJson.nodes.length === 0) {
      return NextResponse.json({ error: "El agente devolvió un diagrama vacío o inválido. Probá de nuevo." }, { status: 500 });
    }
  } else if (isCardsAndFlowcharts) {
    // Cards son opcionales (el agente puede generar solo flowcharts)
    if (!analysisJson?.flowcharts?.length && !analysisJson?.cards?.length) {
      return NextResponse.json({ error: "El agente no devolvió contenido. Probá de nuevo." }, { status: 500 });
    }
  } else if (isTimelineDetailAgent) {
    // D.1: el agente de detalle emite timelineDetail, no cards/sections.
    if (!analysisJson?.timelineDetail?.phases?.length) {
      return NextResponse.json({ error: "El agente devolvió un detalle de cronograma inválido. Probá de nuevo." }, { status: 500 });
    }
  } else if (useBlockFormat) {
    if (!analysisJson?.sections?.length) {
      return NextResponse.json({ error: "El agente devolvió bloques inválidos. Probá de nuevo." }, { status: 500 });
    }
  } else {
    if (!analysisJson?.cards?.length) {
      return NextResponse.json({ error: "El agente devolvió una respuesta inválida. Probá de nuevo." }, { status: 500 });
    }
  }

  // ── 12. Guardar AgentRun ─────────────────────────────────────────────────────
  // Modo async (existingRunId): el run ya existe RUNNING → se actualiza con el
  // output SIN tocar status (lo pasa a DONE el wrapper detached al final, para que
  // el polling no vea DONE antes de que se persistan las cards/blocks).
  // Modo síncrono: se crea ya en DONE (comportamiento de siempre).
  const run = existingRunId
    ? await prisma.agentRun.update({
        where: { id: existingRunId },
        data: {
          output:           JSON.stringify(analysisJson),
          sourceSessionIds: handoffSourceSessionIds,
          serviceType:      dealProject?.serviceType ?? null,
        },
      })
    : await prisma.agentRun.create({
        data: {
          agentId:      agent.id,
          clientId,
          projectId:    bodyProjectId,
          stage:        bodyStage,
          step:         bodyStep,
          stepLabel:    bodyStepLabel,
          sectionLabel: bodySectionLabel ?? agent.sectionLabel ?? null,
          serviceType:  dealProject?.serviceType ?? null,
          status:       "DONE",
          output:       JSON.stringify(analysisJson),
          // Trazabilidad: para el handoff, qué sesiones de ventas se usaron (item de validación).
          sourceSessionIds: handoffSourceSessionIds,
        },
      });

  // ── 12a'. D.1: persistir detalle del cronograma y cortar ────────────────────
  // El output del agente de detalle no es cards/blocks: se persiste sobre
  // ProjectTimeline/TimelineTask y se responde acá — no debe pasar por
  // updateCanvasAsync ni por el path de cards.
  if (isTimelineDetailAgent) {
    const detail = await persistTimelineDetailFromAgentOutput(bodyProjectId, analysisJson, run.id);
    return NextResponse.json({
      timelineDetail: detail,
      run: { id: run.id, createdAt: run.createdAt, status: run.status, step: run.step, stepLabel: run.stepLabel, agent: { name: agent.name } },
    });
  }

  // ── 12b. Disparar agente de canvas post-ejecución (fire-and-forget) ──────────
  if (bodyProjectId && analysisJson?.cards?.length) {
    updateCanvasAsync(clientId, bodyProjectId, run.id, analysisJson.cards).catch((e) =>
      console.error("[canvas-update] Error:", e)
    );
  }

  // ── 13. Si es FLOWCHART, crear ClientContextCard tipo FLOWCHART ──────────────
  if (isFlowchart) {
    // analysisJson puede tener un solo flowchart o un array de flowcharts.
    // (cast: analysisJson viene tipado con el shape de "sections" del otro modo
    // de análisis — acá isFlowchart garantiza el shape de flowcharts.)
    const flowcharts = (analysisJson?.flowcharts ?? (analysisJson?.nodes ? [analysisJson] : [])) as Array<{
      title?: string;
      description?: string;
      nodes: unknown[];
      edges: unknown[];
    }>;

    if (flowcharts.length > 0) {
      await prisma.clientContextCard.createMany({
        data: flowcharts.map((fc, i) => ({
          clientId,
          projectId:   bodyProjectId,
          agentRunId:  run.id,
          title:       fc.title?.trim() || "Diagrama de proceso",
          content:     fc.description ?? "",
          order:       i,
          source:      "AGENT" as const,
          cardType:    "FLOWCHART" as const,
          diagramData: { nodes: fc.nodes, edges: fc.edges } as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
    }

    const runCards = await prisma.clientContextCard.findMany({
      where: { agentRunId: run.id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({
      cards: runCards,
      flowchart: analysisJson,
      run: { id: run.id, createdAt: run.createdAt, status: run.status, step: run.step, stepLabel: run.stepLabel, agent: { name: agent.name } },
    });
  }

  // Mapeo de grupo del agente → sección por defecto del canvas de resumen
  const GROUP_TO_SECTION: Record<string, string> = {
    preparacion:   "procesos",
    diagnostico:   "hipotesis_recomendaciones",
    planificacion: "plan_implementacion",
    ejecucion:     "plan_implementacion",
    adopcion:      "plan_implementacion",
  };
  const defaultSection = bodyProjectId
    ? (GROUP_TO_SECTION[agent.agentGroup ?? ""] ?? "procesos")
    : null;

  // Build section labels map for post-processing (non-default canvases only)
  let targetSectionLabels: Record<string, string> = {};
  if (targetCanvasId) {
    const tc = await prisma.projectCanvas.findUnique({
      where: { id: targetCanvasId },
      select: { sections: true },
    });
    const secs = (tc?.sections ?? []) as Array<{ key: string; label: string }>;
    targetSectionLabels = Object.fromEntries(secs.map((s) => [s.key, s.label]));
  }

  // Post-process cards if targeting a non-default canvas
  if (targetCanvasId && analysisJson?.cards) {
    analysisJson.cards = postProcessCards(
      analysisJson.cards as Array<{ title: string; content: string; canvasSection?: string }>,
      { sectionLabels: targetSectionLabels }
    );
  }

  // ── 13a2. Si es block format, guardar CanvasBlock records ─────────────────────
  const isBlockFormat = useBlockFormat && analysisJson?.sections && Array.isArray(analysisJson.sections);
  if (isBlockFormat && targetCanvasId) {
    // Resolve CanvasSection IDs
    const dbSections = await prisma.canvasSection.findMany({
      where: { canvasId: targetCanvasId },
      select: { id: true, key: true },
    });
    const sectionMap = new Map(dbSections.map((s) => [s.key, s.id]));

    let totalBlocks = 0;
    // #1 — Handoff/Kickoff: los bloques nacen CONFIRMED (sin paso de "Aceptar"; borrar = rechazar).
    // El staging (snapshot al "Subir al cliente") sigue siendo el ÚNICO gate de exposición externa —
    // generar NO expone nada. Diagnóstico/planificación siguen DRAFT (conservan su revisión).
    const bornConfirmed = agent.agentGroup === "handoff" || agent.agentGroup === "kickoff";
    const outputSections = analysisJson.sections as Array<{
      key: string;
      blocks: Array<{ type: string; content?: string; data?: unknown }>;
    }>;

    for (const section of outputSections) {
      const sectionId = sectionMap.get(section.key);
      if (!sectionId || !section.blocks?.length) continue;

      // Atómico: borrar la salida anterior del AGENTE + crear la nueva en UNA transacción. Con
      // born-CONFIRMED el delete borra TODOS los bloques del agente (no solo DRAFT), sino se
      // duplicarían al regenerar; lo editado a mano (MODIFIED, incl. IA por el PUT) y lo manual
      // (HUMAN) sobreviven. La tx evita dejar la sección vacía si el createMany falla entre medio.
      const blockData: Prisma.CanvasBlockCreateManyInput[] = section.blocks.map((block, i) => {
        const bt = (block.type?.toLowerCase() ?? "text") as BlockType;
        // Conservative rowSpan — user can resize if needed
        const contentLen = (block.content ?? "").length;
        const tableRows = (block.data as { rows?: unknown[] } | null)?.rows?.length ?? 0;
        let rowSpan: number;
        if (bt === "heading") rowSpan = 1;
        else if (bt === "metric") rowSpan = 1;
        else if (bt === "table") rowSpan = Math.max(2, Math.ceil((tableRows + 1) * 35 / 125));
        else if (bt === "flowchart") rowSpan = 3;
        else rowSpan = Math.max(1, Math.ceil(contentLen / 800));
        return {
          sectionId,
          blockType: (bt.toUpperCase()) as "TEXT" | "HEADING" | "TABLE" | "METRIC" | "CALLOUT" | "CARD" | "FLOWCHART" | "CHART" | "IMAGE",
          content: block.content ?? null,
          data: block.data ?? undefined,
          order: i,
          colSpan: DEFAULT_COL_SPAN[bt] ?? 4,
          rowSpan,
          source: "AGENT" as const,
          status: bornConfirmed ? "CONFIRMED" : "DRAFT",
          agentRunId: run.id,
        };
      });
      await prisma.$transaction([
        prisma.canvasBlock.deleteMany({
          where: bornConfirmed
            ? { sectionId, source: "AGENT" }
            : { sectionId, status: "DRAFT", source: "AGENT" },
        }),
        prisma.canvasBlock.createMany({ data: blockData }),
      ]);
      totalBlocks += section.blocks.length;
    }

    console.log(`[analyze blocks] Saved ${totalBlocks} blocks across ${outputSections.length} sections`);

    // Persistir el cronograma si el agente lo devolvió (mismo helper que el path de cards)
    await persistTimelineFromAgentOutput(bodyProjectId, analysisJson, run.id);

    const savedBlocks = await prisma.canvasBlock.findMany({
      where: { agentRunId: run.id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      blocks: savedBlocks,
      format: "blocks",
      run: { id: run.id, createdAt: run.createdAt, status: run.status, step: run.step, stepLabel: run.stepLabel, agent: { name: agent.name } },
    });
  }

  // ── 13b. Si es CARDS_AND_FLOWCHARTS, guardar cards de texto + cards FLOWCHART ─
  if (isCardsAndFlowcharts) {
    try {
    const validCards = (analysisJson!.cards ?? []).filter(
      (card: { title?: string; content?: string }) => card.title?.trim()
    );

    // Crear cards de texto (con canvasSection si la tienen). El MAPEO no crea
    // ClientContextCards: su card "Procesos Clave" va como bloque TEXT CONFIRMED a la
    // sección Procesos vía syncFlowchartsToProcesos (abajo) — nada que aceptar. Los demás
    // CAF (diagnóstico-marketing…) conservan su flujo de revisión (draft + banner).
    if (validCards.length > 0 && !isMapeoAgent) {
      await prisma.clientContextCard.createMany({
        data: validCards.map((card: { title: string; content: string; canvasSection?: string }, i: number) => ({
          clientId,
          projectId:   bodyProjectId,
          agentRunId:  run.id,
          title:       card.title.trim(),
          content:     card.content ?? "",
          order:       i,
          source:      "AGENT" as const,
          cardType:    "TEXT" as const,
          canvasId:    targetCanvasId,
          canvasSection: card.canvasSection ?? defaultSection,
          canvasStatus:  "draft",
          canvasOrder:   i,
        })),
        skipDuplicates: true,
      });
    }

    // Flowcharts → bloques FLOWCHART en la sección "Procesos" del canvas "Información del
    // cliente" (lo que lee la pestaña vía read-procesos). ÚNICA vía: nacen CONFIRMED y
    // REEMPLAZAN los del MISMO agente (no duplican al regenerar) — mismo patrón que el handoff.
    // La antigua copia en ClientContextCard (cardType FLOWCHART) se eliminó: era redundante
    // (la pestaña nunca la leía, solo el CanvasBlock).
    const flowcharts = analysisJson!.flowcharts ?? [];
    console.log(`[analyze CAF] Saving ${flowcharts.length} flowcharts, projectId=${bodyProjectId}, clientId=${clientId}`);
    try {
      const nBlocks = await syncFlowchartsToProcesos(clientId, flowcharts, {
        agentId: agent.id,
        agentRunId: run.id,
        summaryCards: isMapeoAgent ? validCards : undefined,
      });
      console.log(`[analyze CAF] syncFlowchartsToProcesos → ${nBlocks} bloque(s) en Procesos`);
    } catch (e) {
      console.error("[analyze CAF] syncFlowchartsToProcesos error:", e);
    }

    // Guardar suggestions off-canvas (si las hay)
    const cafSuggestions = (analysisJson as { suggestions?: Array<{ title?: string; content?: string; type?: string; suggestedSection?: string; relatedCard?: string }> })?.suggestions ?? [];
    if (cafSuggestions.length > 0) {
      const validCafSuggestions = cafSuggestions.filter((s) => s.title?.trim());
      if (validCafSuggestions.length > 0) {
        await prisma.clientContextCard.createMany({
          data: validCafSuggestions.map((s, i) => ({
            clientId,
            projectId:     bodyProjectId,
            agentRunId:    run.id,
            title:         s.title!.trim(),
            content:       s.content ?? "",
            order:         validCards.length + flowcharts.length + i,
            source:        "AGENT" as const,
            cardType:      "TEXT" as const,
            canvasSection: null,
            canvasStatus:  "confirmed",
            canvasOrder:   null,
            diagramData:   {
              suggestionType:   s.type ?? "hypothesis",
              relatedCard:      s.relatedCard ?? null,
              suggestedSection: s.suggestedSection ?? "procesos",
            },
          })),
          skipDuplicates: true,
        });
      }
    }

    // Backup en AgentRun.output: cards + flowcharts. Las cards del mapeo NO viven en
    // ClientContextCard (van a CanvasBlock vía el sync) → sin esto, si el sync falla o el
    // guard corta (0 flowcharts válidos), el texto de la card no quedaría en ningún lado.
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { output: JSON.stringify({ cards: validCards, flowcharts }) },
    });

    const runCards = await prisma.clientContextCard.findMany({
      where: { agentRunId: run.id },
      orderBy: { order: "asc" },
    });

    // Mergear pendingItems del agente (CARDS_AND_FLOWCHARTS path)
    let pendingMergedCAF = { added: 0, skipped: 0, total: 0 };
    try {
      pendingMergedCAF = await mergePendingItemsToProject(
        bodyProjectId,
        (analysisJson?.pendingItems ?? []).map((it) => ({
          text: it?.text ?? "",
          source: it?.source || agent.name,
        })),
      );
    } catch (e) {
      console.error("[analyze CAF] mergePendingItems error:", e);
    }

    return NextResponse.json({
      cards: runCards,
      flowcharts,
      pendingMerged: pendingMergedCAF,
      run: { id: run.id, createdAt: run.createdAt, status: run.status, step: run.step, stepLabel: run.stepLabel, agent: { name: agent.name } },
    });
    } catch (cafErr) {
      console.error("[analyze CAF] Error saving cards/flowcharts:", cafErr);
      return NextResponse.json({ error: "Error guardando flowcharts", detail: String(cafErr) }, { status: 500 });
    }
  }

  // ── 13c. Si es CARDS, guardar ClientContextCard vinculadas al run ─────────────
  // Leer secciones y cards existentes del canvas para auto-matching y detección de updates
  let canvasSections: string[] = [];
  let existingCanvasCards: Array<{ id: string; title: string; canvasSection: string }> = [];
  if (bodyProjectId) {
    const existingCards = await prisma.clientContextCard.findMany({
      where: { projectId: bodyProjectId, canvasSection: { not: null } },
      select: { id: true, title: true, canvasSection: true },
    });
    canvasSections = [...new Set(existingCards.map((c) => c.canvasSection!))];
    existingCanvasCards = existingCards as Array<{ id: string; title: string; canvasSection: string }>;
  }

  // Secciones estándar del canvas de proyecto (resumen)
  const STANDARD_SECTIONS: Record<string, string> = {
    objetivo_alcance: "objetivo_alcance",
    hipotesis_recomendaciones: "hipotesis_recomendaciones",
    procesos: "procesos",
    plan_implementacion: "plan_implementacion",
  };
  // Si hay un canvas target, incluir sus secciones como válidas
  let targetCanvasSections: string[] = [];
  if (targetCanvasId) {
    const tc = await prisma.projectCanvas.findUnique({
      where: { id: targetCanvasId },
      select: { sections: true },
    });
    const secs = (tc?.sections ?? []) as Array<{ key: string }>;
    targetCanvasSections = secs.map((s) => s.key);
  }
  const allKnownSections = [...Object.keys(STANDARD_SECTIONS), ...canvasSections, ...targetCanvasSections];

  const validCards = (analysisJson!.cards ?? []).filter(
    (card: { title?: string; content?: string }) => card.title?.trim()
  );

  // Para cada card, determinar si va al canvas como draft y si es un update
  const cardDataList = validCards.map((card: { title: string; content: string; canvasSection?: string }, i: number) => {
    let section: string | null = null;

    // 1. Si el agente sugirió una sección explícita
    if (card.canvasSection && (allKnownSections.includes(card.canvasSection) || STANDARD_SECTIONS[card.canvasSection])) {
      section = card.canvasSection;
    }

    // 2. Fallback: asignar sección por defecto según grupo del agente
    if (!section && defaultSection) {
      section = defaultSection;
    }

    // 3. Detectar si es un update de una card existente (mismo título en misma sección)
    let parentCardId: string | null = null;
    if (section) {
      const existing = existingCanvasCards.find(
        (c) => c.canvasSection === section &&
               c.title.toLowerCase().trim() === card.title.trim().toLowerCase()
      );
      if (existing) {
        parentCardId = existing.id; // Link como update de la card existente
      }
    }

    return {
      clientId,
      projectId:     bodyProjectId,
      agentRunId:    run.id,
      title:         card.title.trim(),
      content:       card.content ?? "",
      parentCardId,
      order:         i,
      source:        "AGENT" as const,
      canvasId:      targetCanvasId,
      canvasSection: section,
      canvasStatus:  section ? "draft" : "confirmed",
      canvasOrder:   section ? i : null,
    };
  });

  const savedCards = await prisma.clientContextCard.createMany({
    data: cardDataList,
    skipDuplicates: true,
  });
  void savedCards;

  // ── 13d. Guardar suggestions (cards exploratorias off-canvas) ──────────────
  const suggestions = (analysisJson as { suggestions?: Array<{ title?: string; content?: string; type?: string; suggestedSection?: string; relatedCard?: string }> })?.suggestions ?? [];
  if (suggestions.length > 0) {
    const validSuggestions = suggestions.filter((s) => s.title?.trim());
    if (validSuggestions.length > 0) {
      await prisma.clientContextCard.createMany({
        data: validSuggestions.map((s, i) => ({
          clientId,
          projectId:     bodyProjectId,
          agentRunId:    run.id,
          title:         s.title!.trim(),
          content:       s.content ?? "",
          order:         cardDataList.length + i,
          source:        "AGENT" as const,
          cardType:      "TEXT" as const,
          canvasSection: null,       // OFF-CANVAS: no va al canvas automáticamente
          canvasStatus:  "confirmed",
          canvasOrder:   null,
          // Metadata: tipo de suggestion, card relacionada, sección sugerida
          diagramData:   {
            suggestionType:    s.type ?? "hypothesis",
            relatedCard:       s.relatedCard ?? null,
            suggestedSection:  s.suggestedSection ?? null,
          },
        })),
        skipDuplicates: true,
      });
    }
  }

  // ── 14. Project tags (clasificación) ─────────────────────────────────────────
  // Se persiste dentro de `persistTimelineFromAgentOutput` (junto a la modalidad) para que
  // valga TAMBIÉN en el branch block-format del handoff, que retorna antes de llegar acá.

  // ── 14b. Mergear pendingItems del agente al Project.pendingItems[] ─────────
  // El agente puede devolver además de "cards" un campo "pendingItems" con
  // acciones concretas detectadas en el análisis. Se mergean idempotentemente.
  let pendingMerged = { added: 0, skipped: 0, total: 0 };
  try {
    pendingMerged = await mergePendingItemsToProject(
      bodyProjectId,
      (analysisJson?.pendingItems ?? []).map((it) => ({
        text: it?.text ?? "",
        source: it?.source || agent.name,
      })),
    );
  } catch (e) {
    console.error("[analyze] mergePendingItems error:", e);
  }

  // ── 14c. Persistir cronograma sugerido por el agente (Fase 2 módulo externo) ─
  // Se llama desde ambos paths (cards y block format) — ver función helper abajo.
  await persistTimelineFromAgentOutput(bodyProjectId, analysisJson, run.id);

  // ── 15. Retornar las cards recién creadas + metadata del run ─────────────────
  const runCards = await prisma.clientContextCard.findMany({
    where: { agentRunId: run.id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({
    cards: runCards,
    pendingMerged,
    run: {
      id:        run.id,
      createdAt: run.createdAt,
      status:    run.status,
      step:      run.step,
      stepLabel: run.stepLabel,
      agent:     { name: agent.name },
    },
  });
  }; // ← fin de runAnalysisWork

  // ── A2: el AgentRun se crea SIEMPRE upfront (RUNNING), ANTES del LLM, para que un
  // fallo nunca quede sin rastro (antes el run se creaba después del LLM → cualquier
  // error previo dejaba 0 registros e invisible). El status pasa a DONE/ERROR recién
  // acá al final, tras persistir cards/blocks → el polling nunca ve DONE antes de tiempo.
  const pre = await prisma.agentRun.create({
    data: {
      agentId:      agent.id,
      clientId,
      projectId:    bodyProjectId,
      stage:        bodyStage,
      step:         bodyStep,
      stepLabel:    bodyStepLabel,
      sectionLabel: bodySectionLabel ?? agent.sectionLabel ?? null,
      status:       "RUNNING",
      output:       "{}",
    },
  });

  const markDone = (res: NextResponse) =>
    prisma.agentRun
      .update({ where: { id: pre.id }, data: { status: res.status >= 400 ? "ERROR" : "DONE" } })
      .catch(() => {});
  const markError = (e: unknown) =>
    prisma.agentRun
      // Guardamos el mensaje YA humanizado en output → el GET [runId] lo expone y el
      // frontend (polling) muestra la razón real (créditos, key, rate limit, …).
      .update({ where: { id: pre.id }, data: { status: "ERROR", output: JSON.stringify({ error: humanizeAgentError(e) }) } })
      .catch(() => {});

  // Background para agentes pesados (CARDS_AND_FLOWCHARTS) o cuando el cliente lo pide:
  // el trabajo corre detached (en dev el proceso sigue vivo y lo completa aunque el
  // cliente no sostenga la conexión → adiós "Error de conexión" a los 3 min). El cliente
  // trackea por polling al GET [runId]. Funciona desde CUALQUIER disparador (pop-up de
  // agentes, tarjeta, sub-paso) — NO depende del flag async del cliente.
  const runDetached = body?.async === true || agent.outputType === "CARDS_AND_FLOWCHARTS";
  if (runDetached) {
    void (async () => {
      try { await markDone(await runAnalysisWork(pre.id)); }
      catch (e) { await markError(e); }
    })();
    return NextResponse.json({ runId: pre.id, status: "RUNNING", async: true });
  }

  // Síncrono (agentes livianos): se espera el resultado y se devuelve tal cual.
  try {
    const res = await runAnalysisWork(pre.id);
    await markDone(res);
    return res;
  } catch (e) {
    await markError(e);
    return NextResponse.json({ error: "AGENT_ERROR", message: humanizeAgentError(e), runId: pre.id }, { status: 500 });
  }
});

// ── Helpers a nivel módulo ────────────────────────────────────────────────────

/**
 * Persiste el cronograma estructurado (ProjectTimeline + TimelinePhase) si el
 * agente lo devolvió en su output JSON. Conservador: si ya existe un timeline
 * para el proyecto, NO pisa (la propuesta nueva queda solo en AgentRun.output
 * para trazabilidad — el CSE puede borrar manualmente para regenerar).
 *
 * Se llama desde DOS paths del POST handler:
 *   - branch de block format (canvases custom como Handoff Sales→CS)
 *   - branch de cards (canvas Resumen y similares)
 *
 * El cronograma vive a nivel proyecto, independiente del tipo de output del
 * agente — por eso se factoriza acá.
 */
async function persistTimelineFromAgentOutput(
  bodyProjectId: string | null,
  analysisJson: unknown,
  agentRunId: string,
): Promise<void> {
  try {
    // Implementación vs re-implementación: el agente lo infiere; el CSE puede corregir luego.
    // Se persiste a nivel Project ANTES del early-return del timeline (vale aunque no haya fases).
    if (bodyProjectId) {
      const implType = (analysisJson as { implementationType?: unknown } | null)?.implementationType;
      if (implType === "IMPLEMENTATION" || implType === "REIMPLEMENTATION") {
        await prisma.project
          .update({ where: { id: bodyProjectId }, data: { implementationType: implType } })
          .catch((e) => console.warn("[analyze] implementationType no guardado:", e instanceof Error ? e.message : e));
      }
    }

    // Tags de producto/alcance (mismo catálogo que la tira). Co-locado con la modalidad porque
    // ambos son "la clasificación" y este helper corre en AMBOS paths (block format y cards) —
    // el branch block-format del handoff retorna ANTES de la auto-derivación de la sección 14.
    // ADITIVO + slug-based: deriva del serviceType, une lo que el agente emita, normaliza legacy.
    if (bodyProjectId) {
      try {
        const proj = await prisma.project.findUnique({
          where: { id: bodyProjectId },
          select: { tags: true, serviceType: true },
        });
        const current = sanitizeTags(proj?.tags ?? []);
        const next = [...current];
        const push = (slug: string | undefined) => { if (slug && !next.includes(slug)) next.push(slug); };
        if (proj?.serviceType) push(SERVICE_TO_PRODUCT[proj.serviceType]);
        sanitizeTags((analysisJson as { tags?: unknown } | null)?.tags).forEach(push);
        if (JSON.stringify(next) !== JSON.stringify(proj?.tags ?? [])) {
          await prisma.project.update({ where: { id: bodyProjectId }, data: { tags: next } });
        }
      } catch (e) {
        console.warn("[analyze] tags no guardados:", e instanceof Error ? e.message : e);
      }
    }

    const timelineRaw = (analysisJson as { timeline?: { phases?: unknown } } | null)
      ?.timeline?.phases;
    if (!bodyProjectId || !Array.isArray(timelineRaw) || timelineRaw.length === 0) return;

    // Validador inline (sin Zod, consistente con el resto del codebase)
    const validPhases = timelineRaw
      .filter((p: unknown): p is { name: string; durationWeeks: number; sessionCount?: number; notes?: string; estimated?: boolean; startWeek?: number } => {
        if (!p || typeof p !== "object") return false;
        const obj = p as Record<string, unknown>;
        return typeof obj.name === "string"
          && obj.name.trim().length > 0
          && typeof obj.durationWeeks === "number"
          && obj.durationWeeks > 0;
      })
      .map((p, i) => ({
        name: p.name.trim(),
        order: i,
        durationWeeks: Math.floor(p.durationWeeks),
        // startWeek: inicio explícito (paralelo) si el agente lo dio; null = contigua tras la anterior.
        startWeek: typeof p.startWeek === "number" && p.startWeek >= 0 ? Math.floor(p.startWeek) : null,
        sessionCount: typeof p.sessionCount === "number" && p.sessionCount > 0
          ? Math.floor(p.sessionCount)
          : null,
        notes: typeof p.notes === "string" && p.notes.trim().length > 0
          ? p.notes.trim()
          : null,
        // El agente marca "estimated" cuando no tuvo datos de tiempos en ventas → badge "estimada".
        needsValidation: p.estimated === true,
        source: "AGENT" as const,
      }));

    if (validPhases.length === 0) return;

    // Si YA existe un cronograma NO se pisa (protege ediciones + progreso de tareas).
    // En vez de descartar la propuesta nueva, se reconcilia contra las fases actuales y
    // se guarda como `pendingProposal` (shape del PUT) para que el canvas la muestre como
    // vista previa aplicable. Reconciliación: cada fase propuesta toma el id de la fase
    // existente que matchea (por nombre normalizado; si no, por posición) → al aplicar, el
    // PUT la ACTUALIZA en vez de recrear. Se OMITE `tasks` en TODAS las fases → el PUT no
    // toca las tareas (preserva detalle y estados). Las fases existentes no matcheadas se
    // re-emiten idénticas (modo aditivo: el re-run nunca borra fases con progreso).
    const existing = await prisma.projectTimeline.findUnique({
      where: { projectId: bodyProjectId },
      select: {
        anchorStartDate: true,
        phases: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, durationWeeks: true, startWeek: true, sessionCount: true, notes: true, activityType: true },
        },
      },
    });
    if (existing) {
      const norm = (s: string) => s.trim().toLowerCase();
      const byName = new Map<string, (typeof existing.phases)[number]>();
      for (const ph of existing.phases) if (!byName.has(norm(ph.name))) byName.set(norm(ph.name), ph);
      const consumed = new Set<string>();

      type ProposalPhase = {
        id?: string;
        name: string;
        order: number;
        durationWeeks: number;
        startWeek?: number | null;
        sessionCount: number | null;
        notes: string | null;
        activityType?: string | null;
      };
      const proposedPhases: ProposalPhase[] = [];

      // 1) Fases propuestas por el agente (en su orden), matcheadas a existentes por
      //    nombre normalizado y, si no, por posición. Las matcheadas llevan su id +
      //    el activityType existente (mejora el preview; no-op al aplicar).
      validPhases.forEach((p, i) => {
        let match: (typeof existing.phases)[number] | undefined = byName.get(norm(p.name));
        if (match && consumed.has(match.id)) match = undefined;
        if (!match) {
          const positional = existing.phases[i];
          if (positional && !consumed.has(positional.id)) match = positional;
        }
        if (match) {
          consumed.add(match.id);
          proposedPhases.push({
            id: match.id,
            name: p.name,
            order: i,
            durationWeeks: p.durationWeeks,
            startWeek: p.startWeek,
            sessionCount: p.sessionCount,
            notes: p.notes,
            activityType: match.activityType,
          });
        } else {
          proposedPhases.push({
            name: p.name,
            order: i,
            durationWeeks: p.durationWeeks,
            startWeek: p.startWeek,
            sessionCount: p.sessionCount,
            notes: p.notes,
          });
        }
      });

      // 2) Fases existentes NO matcheadas → re-emitir idénticas (nunca borrar).
      let nextOrder = proposedPhases.length;
      for (const ph of existing.phases) {
        if (consumed.has(ph.id)) continue;
        proposedPhases.push({
          id: ph.id,
          name: ph.name,
          order: nextOrder++,
          durationWeeks: ph.durationWeeks,
          startWeek: ph.startWeek,
          sessionCount: ph.sessionCount,
          notes: ph.notes,
          activityType: ph.activityType,
        });
      }

      // Si el anchor sigue vacío, derivarlo de la sesión de kickoff (la propuesta lo
      // lleva → al aplicarla, el PUT lo persiste). Si ya está, se conserva (no se pisa).
      const pendingProposal = {
        anchorStartDate:
          existing.anchorStartDate?.toISOString() ??
          (await getKickoffSessionDate(bodyProjectId))?.toISOString() ??
          null,
        phases: proposedPhases,
      };

      await prisma.projectTimeline.update({
        where: { projectId: bodyProjectId },
        data: {
          pendingProposal: pendingProposal as Prisma.InputJsonValue,
          pendingProposalRunId: agentRunId,
        },
      });
      console.log(
        `[analyze] ✓ pendingProposal guardada (${proposedPhases.length} fases; ${validPhases.length} propuestas por el agente) para project ${bodyProjectId} (run ${agentRunId}).`,
      );
      return;
    }

    // KICKOFF SIEMPRE: la 1ra fase debe ser un Kick-off. Si el agente no lo puso, lo anteponemos
    // (estimado → needsValidation). Garantiza el invariante "todo cronograma arranca con Kickoff".
    const startsWithSemana0 = /semana\s*0|semana\s*cero|kick.?off|arranque/i.test(
      validPhases[0]?.name ?? "",
    );
    const phasesToCreate = startsWithSemana0
      ? validPhases
      : [
          {
            name: "Semana 0",
            order: 0,
            durationWeeks: 1,
            startWeek: 0 as number | null,
            sessionCount: 1 as number | null,
            notes: "Kickoff y levantamiento inicial con el cliente",
            needsValidation: true,
            source: "AGENT" as const,
          },
          // Al anteponer Semana 0 (durationWeeks 1 en week 0), el origen del agente se corre +1 semana.
          // Las contiguas (startWeek null) las recoloca solo computePhaseRanges (el cursor arranca tras
          // Semana 0). Las que traen startWeek EXPLÍCITO (paralelo) hay que correrlas +1 a mano, o
          // quedarían una semana antes de lo que el agente quiso.
          ...validPhases.map((p) => ({
            ...p,
            order: p.order + 1,
            startWeek: p.startWeek != null ? p.startWeek + 1 : p.startWeek,
          })),
        ];

    // Fecha de arranque por defecto = sesión de kickoff del proyecto (null si no hay).
    // Editable después por el CSE vía PUT /timeline.
    const kickoffDate = await getKickoffSessionDate(bodyProjectId);
    await prisma.projectTimeline.create({
      data: {
        projectId: bodyProjectId,
        generatedByAgentRunId: agentRunId,
        anchorStartDate: kickoffDate,
        phases: { create: phasesToCreate },
      },
    });
    console.log(
      `[analyze] ✓ ProjectTimeline creado con ${phasesToCreate.length} fases (AgentRun ${agentRunId})` +
        (kickoffDate ? ` · anchor=${kickoffDate.toISOString().slice(0, 10)} (kickoff)` : " · sin anchor (sin kickoff)"),
    );
  } catch (e) {
    console.error("[analyze] Timeline persist error:", e);
    // No fallar la respuesta — el handoff principal (cards/blocks) ya quedó persistido.
  }
}

// ── D.1: persistencia del DETALLE del cronograma ──────────────────────────────

const DETAIL_ACTIVITY_TYPES = [
  "EXPLORACION",
  "PLANIFICACION",
  "CONFIGURACION",
  "ADOPCION",
  "SEGUIMIENTO",
] as const;

/**
 * La marca "por validar" vive SOLO en la columna needsValidation: si el modelo
 * desobedece y mete el marcador en el título, se limpia acá — el título cruza
 * al cliente tal cual cuando el CSE confirma el detalle.
 */
function sanitizeTaskTitle(raw: string): string {
  const cleaned = raw
    .replace(/^\s*(?:⚠️?\s*)*(?:\[?\s*por\s+validar\s*\]?\s*[:—–-]?\s*)/i, "")
    .trim();
  return cleaned || raw.trim();
}

interface TimelineDetailResult {
  skipped: boolean;
  reason?: string;
  phasesTyped: number;
  tasksCreated: number;
  discardedPhaseIds: number;
}

/**
 * Persiste el detalle del cronograma (activityType + tareas por semana) emitido
 * por el agente "agent-timeline-detail". Espejo de persistTimelineFromAgentOutput
 * pero con tres diferencias deliberadas:
 *
 *  - ENRIQUECE in-place el timeline existente: no toca name/duración/orden/anchor
 *    (las fechas no son suyas — el esqueleto es del handoff/CSE).
 *  - Corre DENTRO de una transacción: el check de idempotencia y los writes son
 *    atómicos (un doble click no duplica tareas).
 *  - Idempotencia espejo de la del esqueleto: si el timeline YA tiene alguna
 *    tarea → skip total; la propuesta queda en AgentRun.output. Regenerar =
 *    DELETE /timeline/detail + re-correr.
 *
 * Reglas: ids de fase validados contra el set real (alucinados se descartan y
 * loguean); activityType solo se setea si la fase lo tiene en null (no pisa lo
 * seteado a mano); weekIndex clampeado a [0, durationWeeks); tasks nacen
 * AGENT/PENDING con needsValidation desde `porValidar`. NO toca
 * lastEditedByHuman (señal de edición humana — heurística limpia para D.2).
 */
async function persistTimelineDetailFromAgentOutput(
  bodyProjectId: string | null,
  analysisJson: unknown,
  agentRunId: string,
): Promise<TimelineDetailResult> {
  const empty: TimelineDetailResult = { skipped: true, phasesTyped: 0, tasksCreated: 0, discardedPhaseIds: 0 };
  const detailRaw = (analysisJson as { timelineDetail?: { phases?: unknown } } | null)
    ?.timelineDetail?.phases;
  if (!bodyProjectId || !Array.isArray(detailRaw) || detailRaw.length === 0) {
    return { ...empty, reason: "empty_output" };
  }

  return prisma.$transaction(async (tx) => {
    const tl = await tx.projectTimeline.findUnique({
      where: { projectId: bodyProjectId },
      select: {
        id: true,
        phases: {
          select: {
            id: true,
            name: true,
            order: true,
            durationWeeks: true,
            activityType: true,
            _count: { select: { tasks: true } },
          },
        },
      },
    });
    if (!tl || tl.phases.length === 0) return { ...empty, reason: "no_timeline" };

    // Idempotencia: saltamos si YA existe detalle generado por IA. La señal es source ∈ {AGENT,
    // MODIFIED}: MODIFIED es una tarea AGENT que el CSE editó (el PUT del timeline voltea AGENT→MODIFIED
    // al editar contenido) — sigue siendo "detalle generado", solo retocado. Contar SOLO "AGENT" reabría
    // duplicación: si el CSE edita TODAS las tareas antes de publicar, el count caía a 0, el CTA "Generar"
    // reaparecía y un re-run creaba un set AGENT nuevo ALADO de las MODIFIED (sin dedup). Las tareas
    // MANUALES (source=HUMAN, que el CSE agregó a la base) NO cuentan → no bloquean la generación inicial,
    // el detalle se suma sin pisarlas. Mismo predicado en el UI (hasAiDetail) para que CTA y server coincidan.
    const existingAgentCount = await tx.timelineTask.count({
      where: { phase: { timelineId: tl.id }, source: { in: ["AGENT", "MODIFIED"] } },
    });
    if (existingAgentCount > 0) {
      console.log(
        `[analyze] Skipping timeline detail: ya hay ${existingAgentCount} tareas IA (AGENT/MODIFIED) para project ${bodyProjectId}. Propuesta queda en AgentRun.output (${agentRunId}).`,
      );
      return { ...empty, reason: "detail_exists" };
    }

    const phaseById = new Map(tl.phases.map((p) => [p.id, p]));
    let phasesTyped = 0;
    let tasksCreated = 0;
    let discardedPhaseIds = 0;

    for (const raw of detailRaw) {
      if (!raw || typeof raw !== "object") continue;
      const ph = raw as Record<string, unknown>;
      const phaseId = typeof ph.id === "string" ? ph.id : null;
      const phase = phaseId ? phaseById.get(phaseId) : undefined;
      if (!phase) {
        discardedPhaseIds++;
        console.warn(`[analyze] timeline detail: fase desconocida "${phaseId}" — descartada (anti-alucinación)`);
        continue;
      }

      // activityType — UPDATE solo-si-null (no pisa lo seteado a mano por el CSE)
      const at =
        typeof ph.activityType === "string" &&
        (DETAIL_ACTIVITY_TYPES as readonly string[]).includes(ph.activityType)
          ? (ph.activityType as (typeof DETAIL_ACTIVITY_TYPES)[number])
          : null;
      if (at && phase.activityType === null) {
        await tx.timelinePhase.update({ where: { id: phase.id }, data: { activityType: at } });
        phasesTyped++;
      }
      // B — base para el fallback de party cuando el agente no lo manda (tipo efectivo de la fase).
      const effectiveActivity = phase.activityType ?? at;

      // tasks — clamp de weekIndex, order incremental dentro de cada semana
      const tasksRaw = Array.isArray(ph.tasks) ? ph.tasks : [];
      const perWeekCount = new Map<number, number>();
      const toCreate: Array<{
        phaseId: string;
        title: string;
        weekIndex: number;
        order: number;
        notes: string | null;
        needsValidation: boolean;
        party: "CLIENTE" | "SMARTEAM" | "AMBOS" | null;
        type: "SESSION" | "TASK";
        source: "AGENT";
        status: "PENDING";
      }> = [];
      for (const tRaw of tasksRaw) {
        if (!tRaw || typeof tRaw !== "object") continue;
        const t = tRaw as Record<string, unknown>;
        const titleRaw = typeof t.title === "string" ? t.title.trim() : "";
        if (!titleRaw) continue;
        const wRaw =
          typeof t.weekIndex === "number" && Number.isInteger(t.weekIndex) ? t.weekIndex : 0;
        const weekIndex = Math.min(Math.max(wRaw, 0), Math.max(phase.durationWeeks - 1, 0));
        const order = perWeekCount.get(weekIndex) ?? 0;
        perWeekCount.set(weekIndex, order + 1);
        // B — party del agente (validado) o fallback por el tipo de actividad de la fase.
        const partyRaw = typeof t.party === "string" ? t.party.toUpperCase() : "";
        // Toda tarea tiene dueño: si el agente no lo da, se infiere por activityType;
        // el último fallback es SMARTEAM (nunca null).
        const party: "CLIENTE" | "SMARTEAM" | "AMBOS" =
          partyRaw === "CLIENTE" || partyRaw === "SMARTEAM" || partyRaw === "AMBOS"
            ? partyRaw
            : effectiveActivity === "CONFIGURACION"
              ? "SMARTEAM"
              : effectiveActivity
                ? "AMBOS"
                : "SMARTEAM";
        // Tipo de tarea del agente (validado) — fallback TASK si no manda un valor válido.
        const typeRaw = typeof t.type === "string" ? t.type.toUpperCase() : "";
        const type: "SESSION" | "TASK" = typeRaw === "SESSION" ? "SESSION" : "TASK";
        toCreate.push({
          phaseId: phase.id,
          title: sanitizeTaskTitle(titleRaw),
          weekIndex,
          order,
          notes: typeof t.notes === "string" && t.notes.trim() ? t.notes.trim() : null,
          needsValidation: t.porValidar === true,
          party,
          type,
          source: "AGENT",
          status: "PENDING",
        });
      }
      if (toCreate.length > 0) {
        await tx.timelineTask.createMany({ data: toCreate });
        tasksCreated += toCreate.length;
      }
    }

    // C — tareas fijas que SIEMPRE arrancan el proyecto: sembradas en la "Semana 0" (kickoff +
    // levantamiento inicial) en la generación inicial (garantizado por la idempotencia de arriba;
    // data histórica intacta). Parties mixtas (entregas del cliente + acciones de Smarteam). La
    // tarea de base de datos RAMIFICA por implementationType: si el cliente YA usa HubSpot
    // (REIMPLEMENTATION) se revisa/limpia la base existente en vez de pedir que la entregue. Dedup
    // por título normalizado contra lo que el agente ya creó para esa fase; el CSE puede editarlas.
    const normName = (s: string) => s.trim().toLowerCase();
    const phasesArr = [...phaseById.values()];
    // La Semana 0 es la 1ra fase (order 0). Fallback por nombre cubre cronogramas viejos ("Kick-off").
    const kickoff =
      phasesArr.find((p) => p.order === 0) ??
      phasesArr.find((p) => normName(p.name).includes("semana 0") || normName(p.name).includes("kick")) ??
      null;
    if (kickoff) {
      const isReimpl =
        (await tx.project.findUnique({
          where: { id: bodyProjectId },
          select: { implementationType: true },
        }))?.implementationType === "REIMPLEMENTATION";
      const SEED_TASKS: { title: string; party: "CLIENTE" | "SMARTEAM" | "AMBOS" }[] = [
        { title: "Entregar documentación de procesos involucrados", party: "CLIENTE" },
        // Regla 4 — rama de base de datos según implementación vs re-implementación.
        isReimpl
          ? { title: "Revisar y limpiar la base de datos existente", party: "AMBOS" }
          : { title: "Proporcionar bases de datos a importar", party: "CLIENTE" },
        { title: "Entregar listado de usuarios a ingresar al CRM", party: "CLIENTE" },
        // Regla 2 — Smarteam asigna la ruta de HubSpot Academy al cliente.
        { title: "Asignar la lista de reproducción de HubSpot Academy al cliente", party: "SMARTEAM" },
        // Regla 3 — el cliente nos da acceso a su portal de HubSpot.
        { title: "Proporcionar acceso al portal de HubSpot a Smarteam", party: "CLIENTE" },
      ];
      const existing = await tx.timelineTask.findMany({
        where: { phaseId: kickoff.id },
        select: { title: true, weekIndex: true },
      });
      const existingNorm = new Set(existing.map((t) => normName(t.title)));
      const week0Count = existing.filter((t) => t.weekIndex === 0).length;
      const seeds = SEED_TASKS.filter((t) => !existingNorm.has(normName(t.title))).map(
        (t, i) => ({
          phaseId: kickoff.id,
          title: t.title,
          weekIndex: 0,
          order: week0Count + i,
          notes: null,
          needsValidation: false,
          party: t.party,
          type: "TASK" as const, // las tareas fijas son entregables/accesos, no reuniones
          source: "AGENT" as const,
          status: "PENDING" as const,
        }),
      );
      if (seeds.length > 0) {
        await tx.timelineTask.createMany({ data: seeds });
        tasksCreated += seeds.length;
        console.log(
          `[analyze] ✓ C: ${seeds.length} tareas fijas sembradas en "${kickoff.name}" (project ${bodyProjectId}, ${isReimpl ? "REIMPLEMENTATION" : "IMPLEMENTATION"})`,
        );
      }
    }

    // Trazabilidad del run que detalló. NO se toca lastEditedByHuman.
    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: { detailGeneratedByAgentRunId: agentRunId },
    });

    console.log(
      `[analyze] ✓ Detalle de cronograma: ${tasksCreated} tareas, ${phasesTyped} fases tipadas, ${discardedPhaseIds} ids descartados (AgentRun ${agentRunId})`,
    );
    return { skipped: false, phasesTyped, tasksCreated, discardedPhaseIds };
  });
}
