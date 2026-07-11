/**
 * lib/cs/account-brief.ts
 *
 * RESUMEN EJECUTIVO CITADO por cuenta (agente "agent-cs-account-brief", prompt
 * en DB): el agente redacta el estado de la cuenta desde el contexto disponible
 * y CADA afirmación cita una fuente con fecha ("Minuta kickoff · 2 jul",
 * "HubSpot Partner · hoy").
 *
 * GARANTÍA DE PROCEDENCIA (la regla del módulo): el contexto declara cada bloque
 * como FUENTE con token estable `kind:id`; el agente cita ese token y el runner
 * resuelve label+fecha DESDE EL CONTEXTO (nunca del modelo). Un statement cuya
 * cita no existe en el contexto SE DESCARTA — sin fuente no hay afirmación.
 *
 * El contexto reusa loadCsAccount (misma data que ve la página de la cuenta).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { anthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { loadCsAccount, type CsAccountData, type AccountBriefStatement } from "./load-account";
import { HS_STATUS_LABEL } from "@/components/cs/dashboard/chart-theme";

const AGENT_ID = "agent-cs-account-brief";
const AGENT_SLUG = "cs-account-brief";
const BRIEF_MODEL = "claude-sonnet-4-6";
// Holgura de tokens: 3000 truncaba en cuentas cargadas (varias minutas + partner +
// señales) → el output quedaba a medias y el parse tiraba error genérico.
const BRIEF_MAX_TOKENS = 5000;
// Caps del contexto de entrada: menos truncación, menos costo, más señal.
const MAX_MINUTAS = 6;
const MAX_BLOCK_CHARS = 1800;

/**
 * Mensaje accionable para el usuario según la causa. Las fallas de "mala salida del
 * agente" (JSON/parse/truncado/sin fuente) piden reintentar; el resto delega en
 * humanizeAgentError (créditos/timeout/genérico). Lo usa el endpoint y el output del run.
 */
export function humanizeBriefError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (raw.includes("output del agente") || raw.includes("statement con fuente") || raw.includes("truncado")) {
    return "La IA devolvió un resumen incompleto o mal formado. Probá de nuevo.";
  }
  return humanizeAgentError(e);
}

export interface BriefSource {
  kind: string;
  id: string;
  label: string;
  date: string | null;
}

export interface AccountBriefContext {
  serialized: string;
  sources: Map<string, BriefSource>; // key = `${kind}:${id}`
  data: CsAccountData;
}

const fmtShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "sin fecha";

export async function buildAccountBriefContext(clientId: string): Promise<AccountBriefContext | null> {
  const data = await loadCsAccount(clientId, null);
  if (!data) return null;

  const sources = new Map<string, BriefSource>();
  const blocks: string[] = [];
  const addSource = (s: BriefSource, content: string) => {
    sources.set(`${s.kind}:${s.id}`, s);
    // Cap por bloque: una minuta larga no puede comerse el presupuesto de tokens.
    blocks.push(`### FUENTE [${s.kind}:${s.id}] — ${s.label} (${fmtShort(s.date)})\n${content.slice(0, MAX_BLOCK_CHARS)}`);
  };

  blocks.push(`# CUENTA: ${data.clientName}${data.clientCompany ? ` (${data.clientCompany})` : ""}`);

  // ── HubSpot Partner (uso/licencias/MRR/renovación) ────────────────────────
  if (data.partner) {
    const p = data.partner;
    const seats = p.seats
      ? Object.entries(p.seats)
          .filter(([, v]) => v && (v.assigned !== null || v.limit !== null))
          .map(([hub, v]) => `${hub}: ${v.assigned ?? "?"}/${v.limit ?? "?"} asignadas (${v.available ?? 0} libres)`)
          .join("; ")
      : "";
    addSource(
      { kind: "hubspot_partner", id: clientId, label: "HubSpot Partner", date: p.fetchedAt },
      [
        `Uso unificado (UUS): ${p.uusScore ?? "sin dato"} · tendencia 4 semanas: ${p.uusTrend ?? "sin dato"}`,
        `Scores por hub — Marketing: ${p.marketingScore ?? "—"} · Sales: ${p.salesScore ?? "—"} · Service: ${p.serviceScore ?? "—"}`,
        seats ? `Licencias: ${seats}` : "",
        `MRR total: ${p.mrrTotal ?? "—"} · por renovar: ${p.mrrUpForRenewal ?? "—"} · próxima renovación: ${fmtShort(p.nextRenewalAt)}`,
        p.cancellationHubs ? `⚠ CANCELACIÓN PRÓXIMA registrada: ${p.cancellationHubs}` : "",
        p.revenueSignal ? `Señal de ingresos: ${p.revenueSignal}${p.revenueSignalDetail ? ` — ${p.revenueSignalDetail.replace(/<[^>]+>/g, " ").slice(0, 300)}` : ""}` : "",
        p.activeProducts ? `Productos activos: ${p.activeProducts}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  // ── Señales HubSpot (engagement/tickets) ──────────────────────────────────
  if (data.signals) {
    const s = data.signals;
    addSource(
      { kind: "hubspot_signals", id: clientId, label: "Señales HubSpot", date: s.fetchedAt },
      [
        `Último engagement: ${fmtShort(s.lastEngagementAt)} · interacciones 90d: ${s.engagements90d ?? "—"}`,
        s.ticketsSupported ? `Tickets de soporte abiertos: ${s.openTicketCount ?? 0}` : "Tickets: sin permiso de lectura",
      ].join("\n"),
    );
  }

  // ── Por proyecto: cronograma (Nexus) + operativa (HubSpot) ────────────────
  for (const pr of data.projects) {
    const s = pr.summary;
    addSource(
      { kind: "cronograma", id: pr.projectId, label: `Cronograma · ${pr.projectName}`, date: null },
      [
        `Avance: ${Math.round(s.progress.pct * 100)}% (${s.progress.tasksDone}/${s.progress.tasksTotal} tareas, ${s.progress.phasesDone}/${s.progress.phasesTotal} fases) · salud: ${s.health.resolved}${s.health.source === "override" ? " (curada por humano)" : ""}`,
        s.overduePhases > 0 ? `Fases vencidas: ${s.overduePhases}${s.worstOverduePhase ? ` (peor: "${s.worstOverduePhase.name}" con ${s.worstOverduePhase.daysLate} días)` : ""}` : "",
        s.overdueTasks > 0 ? `Tareas vencidas: ${s.overdueTasks}` : "",
        s.stalled ? `ESTANCADO: sin actividad hace ${s.daysSinceActivity} días` : "",
        s.scope.exceeded && !s.scope.attenuated ? `Alcance excedido vs baseline: +${s.scope.addedTasks} tareas, +${s.scope.weeksDelta} semanas` : "",
        !s.hasBaseline ? "Sin baseline activa (avance no contrastable contra lo vendido)" : "",
      ].filter(Boolean).join("\n") || "Sin señales de riesgo en el cronograma.",
    );

    const ops = data.projectOps[pr.projectId];
    if (ops && (ops.hubspotStatus || ops.hubspotPriority || ops.hubspotBlockReason || ops.hubspotAdoptionState)) {
      addSource(
        { kind: "hubspot_proyecto", id: pr.projectId, label: `HubSpot · ${pr.projectName}`, date: null },
        [
          `Etapa del pipeline: ${pr.stageLabel ?? "sin etapa"} · prioridad: ${ops.hubspotPriority ?? "sin valor"} · status: ${ops.hubspotStatus ? (HS_STATUS_LABEL[ops.hubspotStatus] ?? ops.hubspotStatus) : "sin valor"}`,
          ops.hubspotBlockReason ? `Motivo de bloqueo: ${ops.hubspotBlockReason}${ops.hubspotBlockDetail ? ` — detalle: ${ops.hubspotBlockDetail}` : ""}` : "",
          ops.hubspotAdoptionState ? `Estado de adopción (según CSE): ${ops.hubspotAdoptionState}` : "",
        ].filter(Boolean).join("\n"),
      );
    }
  }

  // ── Minutas recientes (cap: las más recientes; evita inflar cuentas cargadas) ──
  for (const m of data.minutes.slice(0, MAX_MINUTAS)) {
    addSource(
      { kind: "minuta", id: m.sessionId, label: `Minuta · ${m.sessionTitle.slice(0, 60)}`, date: m.date },
      [
        m.summary,
        m.risks.length > 0 ? `Riesgos: ${m.risks.map((r) => `${r.text}${r.severity ? ` [${r.severity}]` : ""}`).join(" · ")}` : "",
        m.agreements.length > 0 ? `Acuerdos: ${m.agreements.map((a) => a.text).slice(0, 5).join(" · ")}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  // ── Alertas vigentes del watchdog ─────────────────────────────────────────
  for (const a of data.alerts) {
    addSource(
      { kind: "alerta", id: a.id, label: `Alerta watchdog · ${a.severity}`, date: a.lastDetectedAt },
      `[${a.category}] ${a.title} — ${a.reason}${a.suggestedAction ? ` Acción sugerida: ${a.suggestedAction}` : ""}`,
    );
  }

  return { serialized: blocks.join("\n\n"), sources, data };
}

export interface AccountBriefResult {
  status: "ok" | "skipped";
  reason?: string;
  runId?: string;
  headline?: string;
  statements?: AccountBriefStatement[];
  discarded?: number;
}

/** Extrae el primer objeto JSON BALANCEADO del texto (la regex greedy fallaba si
 *  el modelo escribía prosa con llaves alrededor del JSON). */
function extractJson(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** Parsea la salida del agente. LANZA en malformado; DESCARTA statements con cita
 *  inválida (fuente inexistente en el contexto) — sin fuente no hay afirmación. */
function parseBrief(
  rawText: string,
  sources: Map<string, BriefSource>,
): { headline: string | null; statements: AccountBriefStatement[]; discarded: number } {
  const jsonText = extractJson(rawText);
  if (!jsonText) throw new Error("output del agente sin JSON");
  let parsed: { headline?: unknown; statements?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { headline?: unknown; statements?: unknown };
  } catch {
    throw new Error("output del agente con JSON inválido");
  }
  if (!Array.isArray(parsed.statements)) throw new Error("output del agente sin array `statements`");

  const statements: AccountBriefStatement[] = [];
  // El prompt pide máx 12; toleramos hasta 15 y el excedente CUENTA como descartado.
  let discarded = Math.max(0, parsed.statements.length - 15);
  for (const raw of parsed.statements.slice(0, 15)) {
    const s = raw as Record<string, unknown>;
    const text = typeof s.text === "string" ? s.text.trim() : "";
    const key = typeof s.source === "string" ? s.source.trim().replace(/^\[|\]$/g, "") : "";
    const src = sources.get(key);
    if (!text || !src) {
      discarded++;
      continue;
    }
    statements.push({ text, source: { kind: src.kind, id: src.id, label: src.label, date: src.date } });
  }
  if (statements.length === 0) throw new Error("el agente no produjo ningún statement con fuente válida");
  return {
    headline: typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim().slice(0, 400) : null,
    statements,
    discarded,
  };
}

/** Llama al agente; si el output se TRUNCA (max_tokens), reintenta UNA vez pidiendo
 *  ser más conciso antes de rendirse. Los errores transitorios de la API (429/5xx/529)
 *  ya los reintenta el SDK de Anthropic (maxRetries default). Devuelve el texto crudo. */
async function generateBriefText(systemPrompt: string, serialized: string): Promise<string> {
  const ask = (extra: string) =>
    anthropic.messages.create({
      model: BRIEF_MODEL,
      max_tokens: BRIEF_MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${serialized}\n\nRedactá el resumen ejecutivo de esta cuenta según tus instrucciones. Devolvé SOLO el JSON.${extra}`,
        },
      ],
    });
  const textOf = (msg: Awaited<ReturnType<typeof ask>>) =>
    msg.content.map((b) => (b.type === "text" ? (b as { text: string }).text : "")).join("").trim();

  let msg = await ask("");
  if (msg.stop_reason === "max_tokens") {
    // Reintento conciso: menos afirmaciones para no volver a truncar.
    msg = await ask("\n\nIMPORTANTE: sé conciso — máximo 8 afirmaciones, sin repetir.");
    if (msg.stop_reason === "max_tokens") throw new Error("output del agente truncado (max_tokens)");
  }
  return textOf(msg);
}

/** Genera (o regenera) el brief citado de la cuenta. El caller maneja concurrencia. */
export async function runAccountBrief(clientId: string): Promise<AccountBriefResult> {
  const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID }, select: { systemPrompt: true } });
  if (!agent) return { status: "skipped", reason: "agent_not_seeded" };

  // El cliente debe existir ANTES de crear el run (AgentRun.clientId tiene FK a Client):
  // sin esto, un clientId inválido reventaría el create con FK violation en vez de
  // devolver skipped. El endpoint ya lo valida, pero esto blinda a cualquier otro caller.
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return { status: "skipped", reason: "no_client" };

  // Run creado PRIMERO: cualquier falla posterior (incluido armar el contexto o un error
  // de Prisma) queda con su causa en AgentRun.output — auditable, nunca un fallo mudo.
  const run = await prisma.agentRun.create({
    data: { agentId: AGENT_ID, agentSlug: AGENT_SLUG, clientId, status: "RUNNING", stepLabel: "Resumen de cuenta (CS)" },
    select: { id: true },
  });

  try {
    // Marca temporal ANTES de leer el contexto: un staleAt seteado por el sync
    // DURANTE la generación (2 PCs) debe SOBREVIVIR al upsert de abajo.
    const contextBuiltAt = new Date();
    const ctx = await buildAccountBriefContext(clientId);
    if (!ctx) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "ERROR", output: JSON.stringify({ error: "No se pudo armar el contexto de la cuenta." }) },
      });
      return { status: "skipped", reason: "no_client", runId: run.id };
    }

    const rawText = await generateBriefText(agent.systemPrompt, ctx.serialized);
    const { headline, statements, discarded } = parseBrief(rawText, ctx.sources);

    await prisma.csAccountBrief.upsert({
      where: { clientId },
      create: {
        clientId,
        headline,
        statements: statements as unknown as Prisma.InputJsonValue,
        agentRunId: run.id,
        generatedAt: new Date(),
      },
      update: {
        headline,
        statements: statements as unknown as Prisma.InputJsonValue,
        agentRunId: run.id,
        generatedAt: new Date(),
      },
    });
    // Limpiar staleAt SOLO si es anterior a la lectura del contexto (este brief
    // ya refleja ese cambio); uno marcado durante la generación queda vigente.
    await prisma.csAccountBrief.updateMany({
      where: { clientId, staleAt: { lt: contextBuiltAt } },
      data: { staleAt: null },
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify({ headline, statements: statements.length, discarded }) },
    });
    console.log(`[cs-brief] ✓ ${clientId}: ${statements.length} statements (${discarded} descartados por cita inválida) — run ${run.id}`);
    return { status: "ok", runId: run.id, headline: headline ?? undefined, statements, discarded };
  } catch (e) {
    // Persistir la causa (humanizada + cruda) en el run — el fallo deja rastro auditable.
    await prisma.agentRun
      .update({
        where: { id: run.id },
        data: {
          status: "ERROR",
          output: JSON.stringify({ error: humanizeBriefError(e), raw: e instanceof Error ? e.message : String(e) }),
        },
      })
      .catch(() => {});
    throw e;
  }
}
