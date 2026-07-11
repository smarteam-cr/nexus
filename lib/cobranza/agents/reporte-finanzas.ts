/**
 * lib/cobranza/agents/reporte-finanzas.ts
 *
 * REPORTER DE FINANZAS (fase 3 — 2 voces). Genera el reporte de cartera AGREGADA
 * (sin cliente: AgentRun.clientId = null) con métricas FRESCAS (computeMetricasCartera
 * en vivo — no depende de que hoy haya corte), serie histórica de snapshots, riesgo
 * de pago, alertas vigentes y proyección de ingresos.
 *
 * Patrón calcado de lib/cobranza/agents/borrador-cobro.ts: sync sin polling,
 * prompt en fila Agent (DB — se calibra sin deploy), AgentRun RUNNING→DONE/ERROR.
 * Regla de NO-FABRICACIÓN en el prompt: SOLO los números del contexto; CRC y USD
 * jamás se suman; con <2 cortes de historia NO se habla de tendencias.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { addDaysISO, computeMetricasCartera, type MetricasMoneda } from "../engine";
import {
  buildCarteraEngineInput,
  loadAlertas,
  loadProyeccion,
  loadRiesgo,
  loadSnapshotSeries,
} from "../queries";

const AGENT_ID = "agent-finanzas-reporter";
export const REPORTE_AGENT_SLUG = "cobranza-reporte-finanzas";

export type VozReporte = "operativa" | "ejecutiva";

/** El agente no está seedeado en DB — la route lo mapea a un 409 accionable. */
export class ReporteAgentNotSeededError extends Error {
  constructor() {
    super("El agente de reportes no está creado (correr el seed create-finanzas-reporter-agent).");
    this.name = "ReporteAgentNotSeededError";
  }
}

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

const fmt = (n: number) => n.toLocaleString("es-CR", { maximumFractionDigits: 2 });
const diffDias = (aISO: string, bISO: string) =>
  Math.round((new Date(`${bISO}T00:00:00Z`).getTime() - new Date(`${aISO}T00:00:00Z`).getTime()) / 86_400_000);

/** Serializa las métricas de UNA moneda (null = "sin datos", nunca cero). */
function serializarMoneda(tag: "CRC" | "USD", m: MetricasMoneda): string {
  return [
    `${tag}: vencido ${fmt(m.totalVencido)} · por cobrar ${fmt(m.totalPorCobrar)} · programado ${fmt(m.totalProgramado)} · cobrado desde el último corte ${fmt(m.totalCobradoDesdeUltimoCorte)} · proyectado al próximo corte ${fmt(m.proyectadoProximoCorte)}`,
    `${tag} aging de vencidos: 0-30d ${fmt(m.aging.d0_30)} · 31-60d ${fmt(m.aging.d31_60)} · 61-90d ${fmt(m.aging.d61_90)} · +90d ${fmt(m.aging.d90mas)}`,
    `${tag} DSO (proxy de control): ${m.dso == null ? "sin datos" : `${m.dso} día(s)`} · días promedio de cobro realizado: ${m.diasPromedioCobro == null ? "sin datos" : `${m.diasPromedioCobro} día(s)`}`,
  ].join("\n");
}

/**
 * Genera el reporte de finanzas de la cartera completa en la voz pedida.
 * Contexto = SOLO datos reales de queries/engine (regla de no-fabricación).
 */
export async function runReporteFinanzas(
  voz: VozReporte,
  byEmail: string,
  todayISO: string,
): Promise<{ titulo: string; cuerpo: string; runId: string }> {
  const agent = await prisma.agent.findUnique({ where: { id: AGENT_ID }, select: { systemPrompt: true } });
  if (!agent) throw new ReporteAgentNotSeededError();

  // ── Contexto (SOLO datos reales) ──────────────────────────────────────────────
  // Último corte registrado: da la antigüedad de los datos y la ventana de "cobrado
  // desde el último corte" (mismo criterio que el digest — null en el primer corte).
  const ultimoSnap = await prisma.snapshotCartera.findFirst({
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  const desdeUltimoCorteISO = ultimoSnap ? ultimoSnap.capturedAt.toISOString().slice(0, 10) : null;

  // Métricas FRESCAS (en vivo — no dependen de que hoy haya corte).
  const cartera = await buildCarteraEngineInput();
  const metricas = computeMetricasCartera(cartera, {
    todayISO,
    desdeUltimoCorteISO,
    proximoCorteISO: addDaysISO(todayISO, 7),
  });

  const serie = await loadSnapshotSeries(8);
  const riesgo = (await loadRiesgo(todayISO)).slice(0, 15);
  const alertas = await loadAlertas({ estados: ["ABIERTA", "VISTA"] });
  const proyeccion = await loadProyeccion(todayISO);

  // ── Serialización del contexto ────────────────────────────────────────────────
  const cob = metricas.cobertura;
  const historia =
    serie.length < 2
      ? `HISTORIA: insuficiente (${serie.length} corte/s) — NO hables de tendencias.`
      : serie
          .map((s) => {
            const c = s.metricas.moneda.CRC;
            const u = s.metricas.moneda.USD;
            return `${s.capturedAt.slice(0, 10)}: CRC vencido ${fmt(c.totalVencido)} / cobrado en ventana ${fmt(c.totalCobradoDesdeUltimoCorte)} · USD vencido ${fmt(u.totalVencido)} / cobrado en ventana ${fmt(u.totalCobradoDesdeUltimoCorte)} · cuentas rojas ${s.metricas.cuentasRojas} · amarillas ${s.metricas.cuentasAmarillas}`;
          })
          .join("\n");

  const countsPorTipo = new Map<string, number>();
  for (const a of alertas) countsPorTipo.set(a.tipo, (countsPorTipo.get(a.tipo) ?? 0) + 1);
  const alertasAltas = alertas.filter((a) => a.urgencia === "ALTA").slice(0, 5);

  const bloques = [
    `# REPORTE DE CARTERA DE COBRANZA`,
    `VOZ: ${voz.toUpperCase()}`,
    `Fecha del reporte: ${todayISO}`,
    `Antigüedad de los datos: métricas computadas EN VIVO hoy ${todayISO}. Último corte de cartera registrado: ${desdeUltimoCorteISO ?? "nunca (todavía no hay cortes)"}.`,
    ``,
    `# COBERTURA (declarala SIEMPRE en el reporte)`,
    `Cuentas en el universo: ${cob.cuentasTotales} · configuradas: ${cob.cuentasConfiguradas} · pendientes de datos: ${cob.cuentasPendienteDatos} · configuradas sin cobros: ${cob.cuentasSinCobros}`,
    ``,
    `# MÉTRICAS FRESCAS (por moneda — CRC y USD JAMÁS se suman ni convierten)`,
    serializarMoneda("CRC", metricas.moneda.CRC),
    serializarMoneda("USD", metricas.moneda.USD),
    `Cuentas en rojo: ${metricas.cuentasRojas} · en amarillo: ${metricas.cuentasAmarillas}`,
    ``,
    `# HISTORIA DE CORTES (${serie.length} corte/s con métricas)`,
    historia,
    ``,
    `# RIESGO DE PAGO (top ${riesgo.length} en vivo — regla V1: atraso sobre el comportamiento histórico)`,
    riesgo.length === 0
      ? `Sin cobros en riesgo hoy.`
      : riesgo
          .map(
            (r) =>
              `- ${r.clienteNombre}: ${fmt(r.monto)} ${r.moneda ?? "(sin moneda)"} · programado ${r.fechaProgramadaISO} · ${r.diasAtraso} día(s) de atraso · histórico ${r.promedioHistoricoDias == null ? "sin datos" : `${r.promedioHistoricoDias} día(s)`} · excedente ${r.excedenteDias} día(s)`,
          )
          .join("\n"),
    ``,
    `# ALERTAS VIGENTES (ABIERTA + VISTA: ${alertas.length})`,
    countsPorTipo.size === 0
      ? `Sin alertas vigentes.`
      : [...countsPorTipo.entries()].map(([tipo, n]) => `${tipo}: ${n}`).join(" · "),
    alertasAltas.length > 0
      ? `Urgencia ALTA (top ${alertasAltas.length}):\n${alertasAltas.map((a) => `- ${a.mensaje}`).join("\n")}`
      : "",
    ``,
    `# PROYECCIÓN DE INGRESOS (totales por bucket — CRC y USD separados)`,
    `Vencidos en riesgo (APARTE de los buckets): CRC ${fmt(proyeccion.vencidos.totales.CRC)} · USD ${fmt(proyeccion.vencidos.totales.USD)} (${proyeccion.vencidos.cobros.length} cobro/s)`,
    proyeccion.buckets
      .map((b) => `${b.etiqueta} (${b.granularidad}): CRC ${fmt(b.totales.CRC)} · USD ${fmt(b.totales.USD)} (${b.cobros.length} cobro/s)`)
      .join("\n"),
    `Cobros fuera del horizonte: ${proyeccion.fueraDeHorizonte}`,
  ].filter((l) => l !== "");

  // Delta por voz: la OPERATIVA agrega la lista accionable de vencidos (a quién
  // apretar, montos, días); la EJECUTIVA queda solo con los agregados de arriba.
  if (voz === "operativa") {
    const gestion = proyeccion.vencidos.cobros
      .map((c) => ({ ...c, dias: diffDias(c.fechaProgramadaISO, todayISO) }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 20);
    bloques.push(
      ``,
      `# LISTA DE GESTIÓN (vencidos a apretar — solo voz operativa, top ${gestion.length})`,
      gestion.length === 0
        ? `Sin cobros vencidos que gestionar hoy.`
        : gestion
            .map((c) => `- ${c.clienteNombre}: ${fmt(c.monto)} ${c.moneda} · programado ${c.fechaProgramadaISO} · ${c.dias} día(s) de atraso`)
            .join("\n"),
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID,
      agentSlug: REPORTE_AGENT_SLUG,
      // null a propósito: reporte de cartera AGREGADA, no pertenece a UN cliente.
      clientId: null,
      status: "RUNNING",
      stepLabel: `Reporte de finanzas (${voz})`,
    },
    select: { id: true },
  });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: agent.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${bloques.join("\n")}\n\nGenerá el reporte según tus instrucciones. Devolvé SOLO el JSON.`,
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
    let parsed: { titulo?: unknown; cuerpo?: unknown };
    try {
      parsed = JSON.parse(jsonText) as { titulo?: unknown; cuerpo?: unknown };
    } catch {
      throw new Error("output del agente con JSON inválido");
    }
    const titulo = typeof parsed.titulo === "string" ? parsed.titulo.trim().slice(0, 300) : "";
    const cuerpo = typeof parsed.cuerpo === "string" ? parsed.cuerpo.trim().slice(0, 20_000) : "";
    if (!titulo || !cuerpo) throw new Error("output del agente sin titulo o cuerpo");

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        output: JSON.stringify({ voz, solicitadoPor: byEmail, titulo, cuerpoChars: cuerpo.length }),
      },
    });
    return { titulo, cuerpo, runId: run.id };
  } catch (e) {
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: e instanceof Error ? e.message : "error" } })
      .catch(() => {});
    throw e;
  }
}
