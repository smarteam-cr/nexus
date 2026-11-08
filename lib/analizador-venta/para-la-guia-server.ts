/**
 * lib/analizador-venta/para-la-guia-server.ts — los insumos del análisis de la venta para la guía de la siguiente sesión
 * (2026-11-08). SERVIDOR. Solo lectura, sin IA.
 *
 * Toma el análisis de la reunión de venta MÁS NUEVA de la empresa que ya lo tenga (el que mejor sabe qué sigue abierto:
 * los huecos de decisión ya miran las sesiones anteriores) y lo pasa a líneas con `insumosComoLineas` (para-la-guia.ts).
 * ⛔ Invariante 1: las reuniones salen del chokepoint con la empresa de la preventa, y el análisis tiene que ser de esa
 * misma empresa. Si algo falla, la guía se arma igual, sin esto.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { leerResultadoGuardado } from "./analisis";
import { hayInsumos, insumosComoLineas, insumosParaLaGuia } from "./para-la-guia";

/** Cuántas reuniones recientes de la empresa se miran para encontrar el último análisis. */
const REUNIONES_A_MIRAR = 20;

export async function insumosDelAnalisisParaLaGuia(clientId: string): Promise<string[]> {
  try {
    const reuniones = await getClientSessions(clientId, { take: REUNIONES_A_MIRAR });
    if (!reuniones.length) return [];
    const filas = await prisma.analisisDeVenta.findMany({
      where: { sessionId: { in: reuniones.map((r) => r.id) }, clientId, estado: "PROPUESTO" },
      select: { sessionId: true, resultado: true },
    });
    const porId = new Map(filas.map((f) => [f.sessionId, f.resultado]));
    // `getClientSessions` las da de la más nueva a la más vieja.
    for (const r of reuniones) {
      if (!porId.has(r.id)) continue;
      const res = leerResultadoGuardado(porId.get(r.id));
      // Un análisis de antes del 8 nov no trae estos insumos: se salta. El más nuevo que sí los trae manda, aunque no deje nada abierto.
      if (!res?.decision) continue;
      const insumos = insumosParaLaGuia(res);
      if (!hayInsumos(insumos)) return [];
      const dia = new Date(r.date).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");
      return insumosComoLineas(insumos, `la reunión «${r.title}» del ${dia}`);
    }
    return [];
  } catch (e) {
    console.warn(`[analizador-venta] sin insumos para la guía de ${clientId}:`, e instanceof Error ? e.message : e);
    return [];
  }
}
