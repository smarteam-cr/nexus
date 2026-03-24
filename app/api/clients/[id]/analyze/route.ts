import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";
import { dataLake } from "@/lib/data-lake/client";
import { anthropic } from "@/lib/anthropic";
import { normalize, extractTitleTerms, extractDomain } from "@/lib/utils/matching";
import { EMPTY_CLIENT_CANVAS, EMPTY_PROJECT_CANVAS } from "@/lib/canvas/template";
import type { ClientCanvas, ProjectCanvas } from "@/lib/canvas/template";
import { updateCanvasAsync } from "@/lib/canvas/update-agent";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

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

// ── Fireflies helpers ─────────────────────────────────────────────────────────

type RawSession = { id: string; title: string; date: number; participants: string[] };
type RawTranscript = RawSession;

/**
 * Busca sesiones de Fireflies en la caché local (FirefliesSession) antes de
 * tocar la API. Devuelve un array vacío si no hay coincidencias en DB.
 */
async function searchFirefliesFromDB(
  sessionKeywords: string[],
  titleTerms: string[],
  domainFilter: string | null
): Promise<RawSession[]> {
  try {
    const terms = [...new Set([...sessionKeywords, ...titleTerms])].filter(Boolean);
    if (terms.length === 0) return [];

    const sessions = await prisma.firefliesSession.findMany({
      where: {
        OR: terms.map((term) => ({
          title: { contains: term, mode: "insensitive" as const },
        })),
      },
      select: { id: true, title: true, date: true, participants: true },
      orderBy: { date: "desc" },
      take: 20,
    });

    const filtered = domainFilter
      ? sessions.filter((s) =>
          s.participants.some((p) => p.toLowerCase().includes(`@${domainFilter}`))
        )
      : sessions;

    return filtered.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date.getTime(), // Fireflies API usa timestamps en ms
      participants: s.participants,
    }));
  } catch {
    return [];
  }
}

async function fetchFirefliesPage(apiKey: string, skip: number): Promise<RawSession[]> {
  try {
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: `{ transcripts(limit: 50, skip: ${skip}) { id title date participants } }`,
      }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { transcripts?: RawSession[] } };
    return data.data?.transcripts ?? [];
  } catch {
    return [];
  }
}

async function fetchMatchingTranscripts(
  apiKey: string,
  matcher: (t: RawTranscript) => boolean,
  maxPages = 20
): Promise<RawTranscript[]> {
  const BATCH = 4;
  const seen = new Set<string>();
  const matched: RawTranscript[] = [];

  for (let start = 0; start < maxPages; start += BATCH) {
    const count = Math.min(BATCH, maxPages - start);
    const pages = await Promise.all(
      Array.from({ length: count }, (_, i) => fetchFirefliesPage(apiKey, (start + i) * 50))
    );

    for (const page of pages) {
      for (const t of page) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        if (matcher(t)) matched.push(t);
      }
    }

    if ((pages[pages.length - 1]?.length ?? 0) < 50) break;
  }

  return matched;
}

async function fetchTranscriptContent(apiKey: string, sessionId: string, title: string): Promise<string | null> {
  // Intentar leer de la caché DB primero
  try {
    const cached = await prisma.firefliesSession.findUnique({
      where: { id: sessionId },
      select: { summary: true, transcript: true, title: true },
    });

    if (cached?.summary || cached?.transcript) {
      const parts: string[] = [`### Sesión: ${cached.title || title}`];
      const s = cached.summary as { keywords?: string[]; overview?: string; action_items?: string } | null;
      if (s?.keywords?.length) parts.push(`**Temas clave:** ${s.keywords.join(", ")}`);
      if (s?.overview?.trim()) parts.push(`**Resumen:**\n${s.overview.trim().slice(0, 1500)}`);
      if (s?.action_items?.trim()) parts.push(`**Compromisos:**\n${s.action_items.trim().slice(0, 800)}`);
      if (parts.length === 1 && cached.transcript?.trim()) parts.push(cached.transcript.slice(0, 3000));
      if (parts.length > 1) return parts.join("\n\n");
    }
  } catch {
    // Si falla la lectura de caché, continuar con Fireflies API
  }

  try {
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: `{
          transcript(id: "${sessionId}") {
            title
            summary { keywords action_items overview shorthand_bullet }
            sentences { text speaker_name }
          }
        }`,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        transcript?: {
          title: string;
          summary?: {
            keywords?: string[];
            action_items?: string | null;
            overview?: string | null;
            shorthand_bullet?: string | null;
          } | null;
          sentences?: { text: string; speaker_name: string }[];
        };
      };
    };
    const t = data.data?.transcript;
    if (!t) return null;

    const sessionTitle = t.title || title;
    const parts: string[] = [`### Sesión: ${sessionTitle}`];

    // Preferir el summary estructurado (más compacto y útil que las sentences raw)
    const s = t.summary;
    const hasSummary = s && (
      (s.keywords?.length ?? 0) > 0 ||
      s.overview?.trim() ||
      s.action_items?.trim()
    );

    if (hasSummary) {
      if (s!.keywords?.length) {
        parts.push(`**Temas clave:** ${s!.keywords!.join(", ")}`);
      }
      if (s!.overview?.trim()) {
        parts.push(`**Resumen:**\n${s!.overview!.trim().slice(0, 1500)}`);
      }
      if (s!.action_items?.trim()) {
        parts.push(`**Compromisos:**\n${s!.action_items!.trim().slice(0, 800)}`);
      }
    } else {
      // Fallback: primeras 3000 chars de sentences
      const text = (t.sentences ?? [])
        .map((sen) => `${sen.speaker_name}: ${sen.text}`)
        .join("\n")
        .slice(0, 3000);
      if (text.trim()) parts.push(text);
    }

    return parts.length > 1 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

type Params = { params: Promise<{ id: string }> };

// ── GET: secciones del agente para la subetapa actual ────────────────────────
// Retorna { sections: SectionInfo[] } donde cada sección corresponde a un agente
// activo configurado para ese stage+step. Si hay múltiples agentes con distinto
// sectionLabel, cada uno forma su propio bloque visual independiente.
export const GET = withAuth(async (_req: NextRequest, { params }: Params) => {
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
export const POST = withAuth(async (_req: NextRequest, { params }: Params) => {
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
  };
  const bodyStage: number        = typeof body?.stage === "number" ? body.stage : 1;
  const bodyStep: number         = typeof body?.step  === "number" ? body.step  : 0;
  const bodyStepLabel: string | null    = body?.stepLabel    ?? null;
  const bodySectionLabel: string | null = body?.sectionLabel ?? null;
  const bodyAgentId: string | null      = body?.agentId      ?? null;
  const sessionKeywords: string[] = Array.isArray(body?.sessionKeywords) ? body.sessionKeywords : [];
  const bodyProjectId: string | null = body?.projectId ?? null;

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

  const domainFilter = client.company ? extractDomain(client.company) : null;

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
        where: { clientId, NOT: { content: null } },
        select: { stage: true, step: true, title: true, content: true, type: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      // Buscar el deal asociado al proyecto (si hay projectId)
      bodyProjectId
        ? prisma.project.findUnique({ where: { id: bodyProjectId }, select: { hubspotDealId: true, serviceType: true, canvas: true } })
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

    let dealId = dealProject?.hubspotDealId ?? null;

    // Si no hay deal guardado en el proyecto, buscar por empresa
    if (!dealId && client.hubspotCompanyId) {
      const assocRes = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/companies/${client.hubspotCompanyId}/associations/deals?limit=10`,
      });
      if (assocRes.status === 200) {
        const assocData = (await assocRes.json()) as { results?: { id: string }[] };
        // Tomar el primer deal (más reciente)
        dealId = assocData.results?.[0]?.id ?? null;
      }
    }

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

    if (dealId) {
      // Fetch deal + line items en paralelo
      const [dealRes, liRes] = await Promise.all([
        hsClient.apiRequest({
          method: "GET",
          path: `/crm/v3/objects/deals/${dealId}?properties=dealname,amount,closedate,description`,
        }),
        hsClient.apiRequest({
          method: "GET",
          path: `/crm/v3/objects/deals/${dealId}/associations/line_items?limit=50`,
        }),
      ]);

      const dealData = dealRes.status === 200
        ? (await dealRes.json()) as { properties?: { dealname?: string; amount?: string; closedate?: string; description?: string } }
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

      const dealName = dealData?.properties?.dealname ?? `Deal ${dealId}`;
      const dealAmount = dealData?.properties?.amount ? `$${parseFloat(dealData.properties.amount).toLocaleString()}` : null;
      dealContent = `Nombre del deal (servicio contratado): ${dealName}${dealAmount ? ` (${dealAmount})` : ""}\n` +
        (lineItemsText ? `Productos incluidos:\n${lineItemsText}` : "Sin productos adicionales registrados en HubSpot (el nombre del deal indica el servicio vendido).");
    }
  } catch (e) {
    console.error("[analyze] HubSpot deal error:", e);
    // No es bloqueante — continúa sin los datos del deal
  }

  // ── 4. Buscar y traer transcripciones de Fireflies ────────────────────────────
  let firefliesContent = "";
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (apiKey) {
    try {
      let matchingSessions: RawTranscript[] = [];

      // ── 4a. Intentar primero desde la caché DB (evita llamadas innecesarias a la API) ──
      const dbSessions = await searchFirefliesFromDB(sessionKeywords, titleTerms, domainFilter);

      if (dbSessions.length > 0) {
        // Tenemos coincidencias en la caché local — no llamamos a la API
        matchingSessions = dbSessions;
      } else {
        // ── 4b. Fallback: buscar en la API de Fireflies (caché vacía o sin coincidencias) ──
        if (sessionKeywords.length > 0) {
          const keywordTerms = sessionKeywords.map((k) =>
            k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          );
          matchingSessions = await fetchMatchingTranscripts(apiKey, (t) => {
            const titleNorm = (t.title ?? "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            return keywordTerms.some((kw) => titleNorm.includes(kw));
          }, 10);
          matchingSessions = matchingSessions.slice(0, 10);
        }

        if (matchingSessions.length === 0 && titleTerms.length > 0) {
          matchingSessions = await fetchMatchingTranscripts(apiKey, (t) => {
            const titleNorm = normalize(t.title ?? "");
            const byTitle = titleTerms.some((term) => titleNorm.includes(term));
            const byDomain = domainFilter
              ? t.participants.some((p) => p.toLowerCase().includes(`@${domainFilter}`))
              : false;
            return byTitle || byDomain;
          }, 20);
          matchingSessions = matchingSessions.slice(0, 20);
        }
      }

      const top8 = matchingSessions.sort((a, b) => b.date - a.date).slice(0, 8);
      if (top8.length > 0) {
        const contents = await Promise.all(
          top8.map((s) => fetchTranscriptContent(apiKey, s.id, s.title))
        );
        firefliesContent = contents.filter(Boolean).join("\n\n---\n\n");
      }
    } catch (e) {
      console.error("[analyze] Fireflies error:", e);
    }
  }

  // ── 5. Fetch notas del Data Lake ──────────────────────────────────────────────
  let dataLakeContent = "";
  try {
    const searchTerm = titleTerms[0] ?? companyName;
    const { data: rows } = await dataLake
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

  // ── Knowledge base (documentos PUBLISHED) ─────────────────────────────────
  let knowledgeBaseContent = "";
  try {
    const knowledgeDocs = await prisma.knowledgeDocument.findMany({
      where: { status: "PUBLISHED" },
      select: { type: true, title: true, summary: true, content: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    });
    if (knowledgeDocs.length > 0) {
      knowledgeBaseContent = knowledgeDocs
        .map(doc => {
          const parts = [`### [${doc.type}] ${doc.title}`];
          if (doc.summary?.trim()) parts.push(`**Resumen:** ${doc.summary.trim()}`);
          parts.push(doc.content.trim().slice(0, 1500));
          return parts.join("\n");
        })
        .join("\n\n---\n\n");
    }
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
    .filter((d) => d.content?.trim())
    .map((d) => `[Doc: ${d.title}]\n${d.content}`)
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

  // ── 9b. System prompt efectivo ────────────────────────────────────────────────
  let effectiveSystemPrompt = agent.additionalInstructions
    ? `${agent.systemPrompt}\n\n${agent.additionalInstructions}`
    : agent.systemPrompt;

  // Para CARDS_AND_FLOWCHARTS: requerir explícitamente UN flowchart por proceso identificado.
  if (isCardsAndFlowcharts) {
    effectiveSystemPrompt +=
      "\n\n---\nINSTRUCCIÓN CRÍTICA: Analiza los datos del cliente como si fuera la PRIMERA VEZ que los ves, sin asumir ningún resultado previo. Identifica TODOS los procesos operacionales distintos mencionados en las transcripciones, notas y documentos. Cada proceso que tenga un flujo de trabajo propio (con pasos, responsables o herramientas diferentes) debe tener SU PROPIO flowchart independiente. Reglas estrictas: (1) Sé exhaustivo — NO omitas ningún proceso identificable. (2) NO combines procesos distintos en un solo flowchart. (3) El número final de flowcharts debe reflejar exactamente cuántos procesos operacionales distintos encontraste. (4) Si identificas N procesos → genera N flowcharts. Nunca menos.";
  }

  // Agente de subetapa no-primero: tiene step específico asignado y no es el paso 1.
  // Los agentes globales/wildcard (associatedStep === null) no participan en la cadena.
  const isStepChained = agent.associatedStep !== null && bodyStep > 1;

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

  // ── 9c. Canvas: cargar para contexto ──────────────────────────────────────────
  const clientCanvas = (client.canvas as ClientCanvas | null) ?? EMPTY_CLIENT_CANVAS;
  const projectCanvas = (dealProject?.canvas as ProjectCanvas | null) ?? EMPTY_PROJECT_CANVAS;

  // ── 10. Construir user message unificado ──────────────────────────────────────
  // Siempre incluir serviceType si está disponible (aunque no haya deal en HubSpot)
  const serviceTypeLabel = dealProject?.serviceType ?? null;

  // ── 3c. Output del agente de la subetapa anterior (step - 1) ─────────────────
  // Cada agente se alimenta del output estructurado del agente anterior en la cadena.
  let prevStepCards: { title: string; content: string; source: string }[] = [];
  let prevStepLabel: string | null = null;
  // También incluir cards manuales (HUMAN) y modificadas (MODIFIED) que el CSE añadió
  // al pool del cliente aunque no estén vinculadas a un run específico.
  let prevStepHumanCards: { title: string; content: string; source: string }[] = [];
  if (isStepChained) {
    const prevRun = await prisma.agentRun.findFirst({
      where: {
        clientId,
        ...(bodyProjectId ? { projectId: bodyProjectId } : {}),
        stage: bodyStage,
        step: bodyStep - 1,
        status: "DONE",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, stepLabel: true },
    });
    if (prevRun) {
      prevStepLabel = prevRun.stepLabel;
      prevStepCards = await prisma.clientContextCard.findMany({
        where: { agentRunId: prevRun.id },
        orderBy: { order: "asc" },
        select: { title: true, content: true, source: true },
      });
    }
    // Cards creadas manualmente por el CSE (sin agentRunId): anotaciones propias
    // que no pertenecen a ningún run pero enriquecen el contexto.
    prevStepHumanCards = await prisma.clientContextCard.findMany({
      where: { clientId, agentRunId: null, source: "HUMAN" },
      orderBy: { createdAt: "asc" },
      select: { title: true, content: true, source: true },
    });
  }

  const userMessage = `Empresa: ${companyName}
Industria: ${client.industry ?? "No especificada"}
Notas base: ${client.notes ?? "Sin notas"}
${serviceTypeLabel ? `Tipo de servicio contratado: ${serviceTypeLabel}` : ""}

${bodyProjectId ? `=== CANVAS DE EMPRESA (conocimiento compartido del cliente) ===
Úsalo como base. Contenido existente = conocimiento validado. Campos vacíos = oportunidad de llenar.
${JSON.stringify(clientCanvas, null, 2)}

=== CANVAS DEL PROYECTO (conocimiento del caso de uso actual) ===
${JSON.stringify(projectCanvas, null, 2)}

` : ""}${prevStepCards.length > 0 || prevStepHumanCards.length > 0 ? `=== ANÁLISIS DE LA SUBETAPA ANTERIOR${prevStepLabel ? ` (${prevStepLabel})` : ""} ===
Cards del paso anterior para referencia:

${[
  ...prevStepCards.map((c) => {
    const tag = c.source === "MODIFIED" ? "[MODIFICADO POR CSE ⚠️]" : c.source === "HUMAN" ? "[CREADO POR CSE ⚠️]" : "[AGENTE]";
    return `${tag} **${c.title}:**\n${c.content}`;
  }),
  ...prevStepHumanCards.map((c) => `[CREADO POR CSE ⚠️] **${c.title}:**\n${c.content}`),
].join("\n\n")}\n\n` : ""}${acquisitionContent ? `=== DATOS DE ADQUISICIÓN (HubSpot empresa) ===\n${acquisitionContent}\n\n` : ""}${dealContent ? `=== DEAL CERRADO Y PRODUCTOS (HubSpot) ===\n${dealContent}\n\n` : serviceTypeLabel ? `=== SERVICIO CONTRATADO ===\nTipo de servicio: ${serviceTypeLabel}\n(No se encontró deal en HubSpot, pero el tipo de servicio contratado es ${serviceTypeLabel})\n\n` : ""}${!isCardsAndFlowcharts && previousCards ? `=== CONTEXTO ACTUAL (ya registrado) ===\n${previousCards.slice(0, 3000)}\n\n` : ""}${stageNotesContent ? `=== NOTAS DEL WORKSPACE (por subetapa) ===\n${stageNotesContent.slice(0, 3000)}\n\n` : ""}${docsContent ? `=== DOCUMENTOS ADJUNTOS ===\n${docsContent.slice(0, 3000)}\n\n` : ""}${dataLakeContent ? `=== NOTAS DE HUBSPOT (Data Lake) ===\n${dataLakeContent.slice(0, 4000)}\n\n` : ""}${firefliesContent ? `=== TRANSCRIPCIONES DE SESIONES (Fireflies) ===\n${firefliesContent.slice(0, 5000)}\n\n` : ""}${knowledgeBaseContent ? `=== BASE DE CONOCIMIENTO ===\n${knowledgeBaseContent.slice(0, 4000)}\n\n` : ""}
Analiza toda la información anterior y completa las secciones de contexto del cliente.`;

  // ── 11. Llamar a Claude ───────────────────────────────────────────────────────
  const maxTokens = isCardsAndFlowcharts ? 16000 : 8192;
  let analysisJson: {
    cards?: { title: string; content: string }[];
    nodes?: unknown[]; edges?: unknown[]; title?: string;
    flowcharts?: Array<{ title?: string; description?: string; nodes: unknown[]; edges: unknown[] }>;
  } | null = null;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      // temperature 0 para CARDS_AND_FLOWCHARTS: salidas más deterministas entre ejecuciones
      ...(isCardsAndFlowcharts ? { temperature: 0 } : {}),
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

  // Validar según outputType
  if (isFlowchart) {
    if (!analysisJson?.nodes || !Array.isArray(analysisJson.nodes) || analysisJson.nodes.length === 0) {
      return NextResponse.json({ error: "invalid_flowchart_response" }, { status: 500 });
    }
  } else if (isCardsAndFlowcharts) {
    if (!analysisJson?.cards?.length) {
      return NextResponse.json({ error: "invalid_response_cards" }, { status: 500 });
    }
    if (!analysisJson?.flowcharts?.length) {
      return NextResponse.json({ error: "invalid_response_flowcharts" }, { status: 500 });
    }
  } else {
    if (!analysisJson?.cards?.length) {
      return NextResponse.json({ error: "invalid_response" }, { status: 500 });
    }
  }

  // ── 12. Guardar AgentRun ─────────────────────────────────────────────────────
  const run = await prisma.agentRun.create({
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
    },
  });

  // ── 12b. Disparar agente de canvas post-ejecución (fire-and-forget) ──────────
  if (bodyProjectId && analysisJson?.cards?.length) {
    updateCanvasAsync(clientId, bodyProjectId, run.id, analysisJson.cards).catch((e) =>
      console.error("[canvas-update] Error:", e)
    );
  }

  // ── 13. Si es FLOWCHART, devolver directo (sin ClientContextCard) ─────────────
  if (isFlowchart) {
    return NextResponse.json({
      flowchart: analysisJson,
      run: { id: run.id, createdAt: run.createdAt, status: run.status, step: run.step, stepLabel: run.stepLabel, agent: { name: agent.name } },
    });
  }

  // ── 13b. Si es CARDS_AND_FLOWCHARTS, guardar cards Y flowcharts ───────────────
  if (isCardsAndFlowcharts) {
    const validCards = (analysisJson!.cards ?? []).filter(
      (card: { title?: string; content?: string }) => card.title?.trim()
    );
    await prisma.clientContextCard.createMany({
      data: validCards.map((card: { title: string; content: string }, i: number) => ({
        clientId,
        projectId:   bodyProjectId,
        agentRunId:  run.id,
        title:       card.title.trim(),
        content:     card.content ?? "",
        order:       i,
        source:      "AGENT" as const,
      })),
      skipDuplicates: true,
    });
    // Guardar los flowcharts en el output del run
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { output: JSON.stringify({ flowcharts: analysisJson!.flowcharts }) },
    });
    const runCards = await prisma.clientContextCard.findMany({
      where: { agentRunId: run.id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({
      cards: runCards,
      flowcharts: analysisJson!.flowcharts,
      run: { id: run.id, createdAt: run.createdAt, status: run.status, step: run.step, stepLabel: run.stepLabel, agent: { name: agent.name } },
    });
  }

  // ── 13c. Si es CARDS, guardar ClientContextCard vinculadas al run ─────────────
  const validCards = (analysisJson!.cards ?? []).filter(
    (card: { title?: string; content?: string }) => card.title?.trim()
  );
  const savedCards = await prisma.clientContextCard.createMany({
    data: validCards.map((card: { title: string; content: string }, i: number) => ({
      clientId,
      projectId:   bodyProjectId,
      agentRunId:  run.id,
      title:       card.title.trim(),
      content:     card.content ?? "",
      order:       i,
      source:      "AGENT" as const,
    })),
    skipDuplicates: true,
  });
  void savedCards;

  // ── 14. Retornar las cards recién creadas + metadata del run ─────────────────
  const runCards = await prisma.clientContextCard.findMany({
    where: { agentRunId: run.id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({
    cards: runCards,
    run: {
      id:        run.id,
      createdAt: run.createdAt,
      status:    run.status,
      step:      run.step,
      stepLabel: run.stepLabel,
      agent:     { name: agent.name },
    },
  });
});
