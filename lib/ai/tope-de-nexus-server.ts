/**
 * lib/ai/tope-de-nexus-server.ts — cuánto lleva gastado Nexus conversando en el mes (./tope-de-nexus.ts). SERVIDOR.
 *
 * Suma `LlmCall.costUsd` del mes en Costa Rica con un origen de Nexus conversando. Con caché de un minuto: cambia de a
 * centavos y se pregunta en cada vuelta. Si la base no responde, el gasto es null y no frena (la misma regla que la
 * guardia del presupuesto de la IA: el instrumento no puede ser la causa del incidente que mide). NUNCA lanza.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { estadoDelTope, inicioDelMesCr, ORIGENES_DE_NEXUS, type EstadoDelTope } from "./tope-de-nexus";

const FRESCURA_MS = 60_000;
let cache: { mes: string; gastado: number; leidoEn: number } | null = null;

/** Solo para pruebas. */
export function _olvidarElGastoDeNexus(): void {
  cache = null;
}

export async function gastoDelMesDeNexus(ahora = new Date()): Promise<number | null> {
  const desde = inicioDelMesCr(ahora);
  const mes = desde.toISOString().slice(0, 7);
  if (cache && cache.mes === mes && ahora.getTime() - cache.leidoEn < FRESCURA_MS) return cache.gastado;
  try {
    const r = await prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { at: { gte: desde }, OR: ORIGENES_DE_NEXUS.map((o) => ({ origen: { startsWith: o } })) },
    });
    const gastado = Number(r._sum.costUsd ?? 0);
    cache = { mes, gastado, leidoEn: ahora.getTime() };
    return gastado;
  } catch (e) {
    console.error("[tope-de-nexus] no se pudo leer el gasto del mes", e instanceof Error ? e.message : e);
    return null;
  }
}

/** El estado del tope de este mes. */
export async function topeDeNexusHoy(ahora = new Date()): Promise<EstadoDelTope> {
  return estadoDelTope(await gastoDelMesDeNexus(ahora));
}
