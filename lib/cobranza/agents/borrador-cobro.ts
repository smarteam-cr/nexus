/**
 * lib/cobranza/agents/borrador-cobro.ts
 *
 * BORRADOR DE CORREO DE COBRO (feature 1 — el mayor ahorro de tiempo de Alex).
 * Patrón calcado de lib/cs/account-brief.ts: sync sin polling, prompt en fila
 * Agent (DB — Alex calibra el tono sin deploy), AgentRun RUNNING→DONE/ERROR.
 *
 * Autonomía-vs-confirmación: esto GENERA un borrador; la persona lo edita y lo
 * envía a mano (CommunicationPort v1 "bitacora" — SIN envío automático). Regla
 * de NO-FABRICACIÓN en el prompt: contexto delgado ⇒ recordatorio genérico.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import type { BorradorMensaje, CommunicationPort } from "../ports";
import { getCommunicationPort } from "../adapters";
import { DEFAULT_CREDITO_DIAS } from "../engine";

const AGENT_ID = "agent-cobranza-borrador";
export const BORRADOR_AGENT_SLUG = "cobranza-borrador-cobro";

export type BorradorCobroResult =
  | {
      status: "done";
      runId: string;
      borrador: BorradorMensaje;
      mailtoUrl: string | null; // null si la cuenta no tiene correoCobro
      correoCobro: string | null;
    }
  | { status: "skipped"; reason: "agent_not_seeded" | "cobro_no_existe" | "cobro_ya_cobrado" };

/** Extrae el primer objeto JSON BALANCEADO (copia local — no hay helper compartido, deuda #11). */
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

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const diffDias = (aISO: string, bISO: string) =>
  Math.round((new Date(`${bISO}T00:00:00Z`).getTime() - new Date(`${aISO}T00:00:00Z`).getTime()) / 86_400_000);

/**
 * Genera el borrador de correo para UN cobro. El contexto de comunicación entra
 * por el CommunicationPort (DI por parámetro — default "bitacora"; cuando exista
 * el adaptador de Gmail se enchufa acá sin tocar esta función).
 */
export async function runBorradorCobro(
  cobroId: string,
  byEmail: string,
  todayISO: string,
  comm: CommunicationPort = getCommunicationPort(),
): Promise<BorradorCobroResult> {
  const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID }, select: { systemPrompt: true } });
  if (!agent) return { status: "skipped", reason: "agent_not_seeded" };

  const cobro = await prisma.cobro.findUnique({
    where: { id: cobroId },
    include: {
      servicio: { select: { tipoServicio: true, descripcion: true } },
      cuenta: {
        select: {
          id: true,
          clientId: true,
          creditoDias: true,
          viaCobro: true,
          responsableCobroTerceros: true,
          client: { select: { name: true } },
        },
      },
    },
  });
  if (!cobro) return { status: "skipped", reason: "cobro_no_existe" };
  if (cobro.estado === "COBRADO") return { status: "skipped", reason: "cobro_ya_cobrado" };

  const ctxCom = await comm.obtenerContexto(cobro.cuenta.id);

  // ── Contexto serializado (SOLO datos reales — la regla de no-fabricación) ──
  const fechaISO = isoDay(cobro.fechaProgramada)!;
  const dias = diffDias(fechaISO, todayISO);
  const estadoTexto =
    dias > 0 ? `VENCIDO hace ${dias} día(s) (fecha original ${fechaISO})` : dias === 0 ? "vence HOY" : `por vencer en ${-dias} día(s)`;
  const bloques = [
    `# COBRO A GESTIONAR`,
    `Cliente: ${cobro.cuenta.client.name}`,
    `Monto: ${Number(cobro.monto).toLocaleString("es-CR")} ${cobro.moneda} · ${cobro.numCuota != null ? `cuota #${cobro.numCuota} · ` : ""}período ${cobro.periodo} · programado ${fechaISO} · ${estadoTexto}`,
    `Servicio: ${cobro.servicio.tipoServicio}${cobro.servicio.descripcion ? ` — ${cobro.servicio.descripcion}` : ""}`,
    `Crédito: ${cobro.cuenta.creditoDias ?? DEFAULT_CREDITO_DIAS} días · vía de cobro: ${cobro.cuenta.viaCobro}${cobro.cuenta.responsableCobroTerceros ? ` · cobro de terceros a cargo de: ${cobro.cuenta.responsableCobroTerceros}` : ""}`,
    ``,
    `# CONTEXTO DE COMUNICACIÓN (fuente: ${comm.slot})`,
    ctxCom.ultimaComunicacion
      ? `Última comunicación humana: ${ctxCom.ultimaComunicacion.fechaISO} · ${ctxCom.ultimaComunicacion.tipo} — ${ctxCom.ultimaComunicacion.resumen}`
      : `Sin historial de comunicación registrado — redactá un recordatorio genérico cortés.`,
    ctxCom.hiloReciente ? `Hilo de correo reciente (pegado a mano):\n"""\n${ctxCom.hiloReciente}\n"""` : "",
  ].filter(Boolean);

  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID,
      agentSlug: BORRADOR_AGENT_SLUG,
      clientId: cobro.cuenta.clientId,
      status: "RUNNING",
      stepLabel: "Borrador de cobro",
    },
    select: { id: true },
  });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: agent.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${bloques.join("\n")}\n\nRedactá el borrador de correo de cobro según tus instrucciones. Devolvé SOLO el JSON.`,
        },
      ],
    });
    if (msg.stop_reason === "max_tokens") throw new Error("output del agente truncado (max_tokens)");
    const rawText = msg.content
      .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
      .join("")
      .trim();
    const jsonText = extractJson(rawText);
    if (!jsonText) throw new Error("output del agente sin JSON");
    let parsed: { asunto?: unknown; cuerpo?: unknown };
    try {
      parsed = JSON.parse(jsonText) as { asunto?: unknown; cuerpo?: unknown };
    } catch {
      throw new Error("output del agente con JSON inválido");
    }
    const asunto = typeof parsed.asunto === "string" ? parsed.asunto.trim().slice(0, 300) : "";
    const cuerpo = typeof parsed.cuerpo === "string" ? parsed.cuerpo.trim().slice(0, 6000) : "";
    if (!asunto || !cuerpo) throw new Error("output del agente sin asunto o cuerpo");
    const borrador: BorradorMensaje = { asunto, cuerpo };

    // Entrega v1 = manual: registra la gestión en bitácora y arma el mailto.
    const entrega = await comm.registrarEntrega(cobro.cuenta.id, cobro.id, borrador, { byEmail });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify({ asunto, cuerpoChars: cuerpo.length }) },
    });
    return {
      status: "done",
      runId: run.id,
      borrador,
      mailtoUrl: entrega.mailtoUrl,
      correoCobro: ctxCom.correoCobro,
    };
  } catch (e) {
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: e instanceof Error ? e.message : "error" } })
      .catch(() => {});
    throw e;
  }
}
