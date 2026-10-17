/**
 * lib/nexus-chat/uso-server.ts — cuánto se usa y cuánto cuesta el chat de Nexus. SERVER-ONLY, solo lectura.
 *
 * El costo sale del medidor (`LlmCall`, que escribe lib/anthropic.ts en cada llamada): cada llamada del chat va con el
 * agente «nexus-chat», quién la pidió y `origen = "nexus-chat:<hiloId>"` (./turno-server.ts). Así se suma por hilo y por
 * persona sin otra columna. Los mensajes de hoy se cuentan en TODOS sus hilos del chat (no solo el vivo: «empezar de
 * cero» no saltea el tope).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { inicioDelDiaCr } from "@/lib/ai/presupuesto";
import { PIEZA_NEXUS, SLUG_DEL_CHAT_DE_NEXUS, origenDelHilo } from "./constantes";

export interface UsoDeHoy {
  mensajes: number;
  usd: number;
}

export async function usoDeHoy(usuarioEmail: string, ahora = new Date()): Promise<UsoDeHoy> {
  const desde = inicioDelDiaCr(ahora);
  const [mensajes, gasto] = await Promise.all([
    prisma.mensajeDeChat.count({ where: { rol: "CSE", createdAt: { gte: desde }, hilo: { pieza: PIEZA_NEXUS, usuarioEmail } } }),
    prisma.llmCall.aggregate({ _sum: { costUsd: true }, where: { agentSlug: SLUG_DEL_CHAT_DE_NEXUS, triggeredByEmail: usuarioEmail, at: { gte: desde } } }),
  ]);
  return { mensajes, usd: gasto._sum.costUsd ?? 0 };
}

/** Lo que costó un hilo entero (todas sus llamadas). */
export async function costoDelHilo(hiloId: string): Promise<number> {
  const r = await prisma.llmCall.aggregate({ _sum: { costUsd: true }, where: { origen: { startsWith: origenDelHilo(hiloId) } } });
  return r._sum.costUsd ?? 0;
}

/** Lo que costó una corrida (un turno). */
export async function costoDeLaCorrida(agentRunId: string): Promise<{ usd: number; llamadas: number }> {
  const r = await prisma.llmCall.aggregate({ _sum: { costUsd: true }, _count: { _all: true }, where: { agentRunId } });
  return { usd: r._sum.costUsd ?? 0, llamadas: r._count._all };
}
