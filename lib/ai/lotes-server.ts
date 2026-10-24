/**
 * lib/ai/lotes-server.ts — LA ÚNICA PUERTA A LA API BATCH DE ANTHROPIC. SERVIDOR.
 *
 *  · `encolarEnLote` guarda un pedido (`PedidoEnLote`) con su tipo, sus parámetros y lo que su manejador va a necesitar.
 *    Lo mismo no se encola dos veces (`claveUnica`).
 *  · `correrTickDeLotes` (job «ia-lotes», cada tick): manda los pendientes en un lote cuando se juntaron o esperaron lo
 *    suficiente (lo automático, si queda presupuesto automático; lo que pidió una persona, como la recuperación de las
 *    lecturas, no lo espera), y solo los tipos prendidos (`tipoPrendido`), mira los lotes enviados cada `MIRAR_CADA_MS` y, cuando terminan,
 *    anota cada llamada en el medidor (a mitad de precio, `lote: true`) y le pasa la respuesta al manejador de su tipo
 *    (lib/ai/lotes-manejadores.ts). Un pedido sin respuesta en `HORAS_PARA_VENCER` queda vencido.
 *
 * ⚠ El cliente sigue siendo el de lib/anthropic.ts: `messages.batches` no pasa por el medidor del proxy (no es
 * `create` ni `stream`), así que la anotación la hace esta puerta, una vez por resultado. Nadie más llama a
 * `messages.batches` (lo vigila lib/ai/lotes.test.ts).
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { getAnthropic } from "@/lib/anthropic";
import { registrarLlamada } from "./medidor";
import { quedaPresupuestoAutomatico } from "./guardia-de-presupuesto";
import { MANEJADORES } from "./lotes-manejadores";
import {
  esTipoDeLote,
  estadoDelResultado,
  hayQueEnviar,
  idParaAnthropic,
  MAX_PEDIDOS_POR_LOTE,
  MIRAR_CADA_MS,
  seVencio,
  TIPOS_DE_LOTE,
  tipoPrendido,
  tiposQueSeMandan,
  origenDelLote,
  ESTADOS_VIVOS,
  type TipoDeLote,
} from "./lotes";

/* ── ¿Está el SQL? ──────────────────────────────────────────────────────────── */

const REMIRAR_MS = 30_000;
let mirado: { ok: boolean; en: number } | null = null;

/** ¿El cliente de Prisma conoce el modelo Y la base tiene la tabla? En verde no se vuelve a preguntar. */
export async function lotesDisponible(): Promise<boolean> {
  if (!modeloDisponible((prisma as unknown as { pedidoEnLote?: unknown }).pedidoEnLote)) return false;
  if (mirado?.ok) return true;
  if (mirado && performance.now() - mirado.en < REMIRAR_MS) return false;
  try {
    const filas = await prisma.$queryRaw<{ existe: boolean }[]>`SELECT to_regclass('public."PedidoEnLote"') IS NOT NULL AS existe`;
    mirado = { ok: filas[0]?.existe === true, en: performance.now() };
    return mirado.ok;
  } catch {
    return false;
  }
}

/* ── Encolar ─────────────────────────────────────────────────────────────── */

export interface PedidoParaElLote {
  tipo: TipoDeLote;
  claveUnica: string;
  pedido: Anthropic.Messages.MessageCreateParamsNonStreaming;
  contexto: unknown;
  agentSlug?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}

/** Encola un pedido. «ya_estaba» si la misma clave ya está (en cualquier estado); «sin_tabla» sin el SQL. */
export async function encolarEnLote(p: PedidoParaElLote): Promise<"encolado" | "ya_estaba" | "sin_tabla"> {
  if (!(await lotesDisponible())) return "sin_tabla";
  try {
    await prisma.pedidoEnLote.create({
      data: {
        tipo: p.tipo,
        claveUnica: p.claveUnica,
        pedido: p.pedido as unknown as Prisma.InputJsonValue,
        contexto: (p.contexto ?? {}) as Prisma.InputJsonValue,
        agentSlug: p.agentSlug ?? null,
        clientId: p.clientId ?? null,
        projectId: p.projectId ?? null,
      },
      select: { id: true },
    });
    return "encolado";
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "ya_estaba";
    throw e;
  }
}

/** ¿Hay un pedido vivo (esperando o enviado) con esta clave? */
export async function hayPedidoVivo(claveUnica: string): Promise<boolean> {
  if (!(await lotesDisponible())) return false;
  return !!(await prisma.pedidoEnLote.findFirst({ where: { claveUnica, estado: { in: [...ESTADOS_VIVOS] } }, select: { id: true } }));
}

/* ── El tick ─────────────────────────────────────────────────────────────── */

export interface ResultadoDelTick {
  enviados: number;
  lotesMirados: number;
  aplicados: number;
  fallidos: number;
  vencidos: number;
  errores: string[];
}

let ultimaMirada = 0;

/** Solo para tests: olvida cuándo se miró por última vez. */
export function _olvidarLaMirada(): void {
  ultimaMirada = 0;
  mirado = null;
}

/** Una vuelta del job: mandar lo que espera, mirar lo enviado y aplicar lo que volvió. null sin la tabla. */
export async function correrTickDeLotes(ahora = new Date()): Promise<ResultadoDelTick | null> {
  if (!(await lotesDisponible())) return null;
  const r: ResultadoDelTick = { enviados: 0, lotesMirados: 0, aplicados: 0, fallidos: 0, vencidos: 0, errores: [] };
  await enviarLosPendientes(ahora, r);
  if (ahora.getTime() - ultimaMirada >= MIRAR_CADA_MS) {
    ultimaMirada = ahora.getTime();
    await mirarLosEnviados(ahora, r);
  }
  return r;
}

async function enviarLosPendientes(ahora: Date, r: ResultadoDelTick): Promise<void> {
  // Un tipo apagado (su vuelta atrás) no se manda: lo suyo espera. Lo automático, sin presupuesto del día, espera a
  // mañana (no se pierde). Lo que encoló una persona con su tope (la recuperación) no espera al automático: se anota a
  // nombre de quien lo pidió (presupuesto humano, compartido). Los tipos se eligen ANTES de buscar los pendientes:
  // 100 pedidos automáticos esperando no tapan a los que sí pueden salir.
  const prendidos = TIPOS_DE_LOTE.filter((t) => tipoPrendido(t, process.env));
  if (!(await prisma.pedidoEnLote.count({ where: { estado: "en_espera", tipo: { in: prendidos } } }))) return;
  const quedaAutomatico = await quedaPresupuestoAutomatico(ahora);
  const tipos = tiposQueSeMandan(process.env, quedaAutomatico);
  if (!quedaAutomatico) {
    const esperan = await prisma.pedidoEnLote.count({ where: { estado: "en_espera", tipo: { in: prendidos.filter((t) => !tipos.includes(t)) } } });
    if (esperan) r.errores.push(`${esperan} pedido(s) esperan: no queda presupuesto automático hoy`);
  }
  if (!tipos.length) return;
  const pendientes = await prisma.pedidoEnLote.findMany({
    where: { estado: "en_espera", tipo: { in: tipos } },
    orderBy: { createdAt: "asc" },
    take: MAX_PEDIDOS_POR_LOTE,
    select: { id: true, pedido: true, createdAt: true },
  });
  if (!hayQueEnviar(pendientes, ahora)) return;
  const lote = await getAnthropic().messages.batches.create({
    requests: pendientes.map((p) => ({ custom_id: idParaAnthropic(p.id), params: p.pedido as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming })),
  });
  await prisma.pedidoEnLote.updateMany({
    where: { id: { in: pendientes.map((p) => p.id) }, estado: "en_espera" },
    data: { estado: "enviado", loteId: lote.id, enviadoAt: ahora },
  });
  r.enviados += pendientes.length;
}

async function mirarLosEnviados(ahora: Date, r: ResultadoDelTick): Promise<void> {
  const enviados = await prisma.pedidoEnLote.findMany({
    where: { estado: "enviado" },
    select: { id: true, tipo: true, loteId: true, contexto: true, pedido: true, enviadoAt: true, agentSlug: true, clientId: true, projectId: true },
  });
  const porLote = new Map<string, typeof enviados>();
  for (const p of enviados) {
    if (!p.loteId) continue;
    porLote.set(p.loteId, [...(porLote.get(p.loteId) ?? []), p]);
  }
  for (const [loteId, pedidos] of porLote) {
    r.lotesMirados++;
    let lote: Anthropic.Messages.Batches.MessageBatch;
    try {
      lote = await getAnthropic().messages.batches.retrieve(loteId);
    } catch (e) {
      r.errores.push(`lote ${loteId}: ${(e as Error).message}`);
      continue;
    }
    if (lote.processing_status !== "ended") {
      if (pedidos.every((p) => seVencio(p.enviadoAt, ahora))) {
        for (const p of pedidos) await cerrar(p, "vencido", "Anthropic no respondió en 26 horas", r);
      }
      continue;
    }
    const porId = new Map(pedidos.map((p) => [p.id, p]));
    const vistos = new Set<string>();
    for await (const res of await getAnthropic().messages.batches.results(loteId)) {
      const p = porId.get(res.custom_id);
      if (!p) continue;
      vistos.add(p.id);
      if (res.result.type === "succeeded") await aplicar(p, res.result.message, r);
      else {
        const motivo = res.result.type === "errored" ? `Anthropic: ${JSON.stringify(res.result.error).slice(0, 300)}` : `El lote terminó como «${res.result.type}»`;
        await cerrar(p, estadoDelResultado(res.result.type) === "vencido" ? "vencido" : "error", motivo, r);
      }
    }
    for (const p of pedidos) if (!vistos.has(p.id)) await cerrar(p, "error", "El lote terminó sin la respuesta de este pedido", r);
  }
}

type PedidoEnviado = { id: string; tipo: string; contexto: unknown; pedido: unknown; agentSlug: string | null; clientId: string | null; projectId: string | null };

async function aplicar(p: PedidoEnviado, mensaje: Anthropic.Messages.Message, r: ResultadoDelTick): Promise<void> {
  const model = (p.pedido as { model?: string }).model ?? mensaje.model;
  let agentRunId: string | null = null;
  let quien: string | null = null;
  let error: string | null = null;
  try {
    if (!esTipoDeLote(p.tipo)) throw new Error(`no hay manejador para «${p.tipo}»`);
    const manejador = await MANEJADORES[p.tipo]();
    quien = manejador.quienPidio?.(p.contexto) ?? null;
    agentRunId = (await manejador.aplicar({ pedidoId: p.id, contexto: p.contexto, mensaje })).agentRunId ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  // Se pagó aunque el manejador haya fallado: la llamada se anota igual, a mitad de precio (y a nombre de quien la pidió).
  registrarLlamada({
    model,
    usage: mensaje.usage,
    durationMs: 0,
    ok: true,
    lote: true,
    ctx: { agentSlug: p.agentSlug, agentRunId, clientId: p.clientId, projectId: p.projectId, triggeredByEmail: quien, origen: origenDelLote(p.tipo) },
  });
  if (error) {
    r.errores.push(`${p.tipo} ${p.id}: ${error}`);
    r.fallidos++;
    await prisma.pedidoEnLote.update({ where: { id: p.id }, data: { estado: "error", error: error.slice(0, 2_000), terminadoAt: new Date() } }).catch(() => undefined);
    return;
  }
  r.aplicados++;
  await prisma.pedidoEnLote.update({ where: { id: p.id }, data: { estado: "listo", terminadoAt: new Date(), error: null } });
}

async function cerrar(p: PedidoEnviado, estado: "error" | "vencido", motivo: string, r: ResultadoDelTick): Promise<void> {
  if (estado === "vencido") r.vencidos++;
  else r.fallidos++;
  r.errores.push(`${p.tipo} ${p.id}: ${motivo}`);
  await prisma.pedidoEnLote.update({ where: { id: p.id }, data: { estado, error: motivo.slice(0, 2_000), terminadoAt: new Date() } }).catch(() => undefined);
  if (esTipoDeLote(p.tipo)) {
    const manejador = await MANEJADORES[p.tipo]().catch(() => null);
    await manejador?.alFallar?.({ pedidoId: p.id, contexto: p.contexto, error: motivo }).catch(() => undefined);
  }
}
