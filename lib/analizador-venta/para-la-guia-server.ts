/**
 * lib/analizador-venta/para-la-guia-server.ts — lo que los análisis de la venta de una empresa le dejan a lo que viene
 * (2026-11-08). SERVIDOR. Solo lectura, sin IA.
 *
 *   · `insumosDelAnalisisParaLaGuia`: del análisis de la reunión MÁS NUEVA de la empresa que ya traiga estos campos, las
 *     preguntas de la tabla, los huecos de decisión abiertos y las preguntas para el demo, como líneas para la guía de la
 *     siguiente sesión (para-la-guia.ts). Un hueco que el resumen de la preventa ya responde HOY no viaja.
 *   · `loQueSeSupoEnSesionesAnteriores`: lo que los análisis de las reuniones ANTERIORES de la empresa ya sabían para
 *     decidir, para que el análisis de una sesión no lo marque como faltante.
 *
 * ⛔ Invariante 1: las reuniones salen del chokepoint (`getClientSessions`) con la empresa dueña, y el análisis tiene que
 * ser de esa misma empresa (`clientId` en la consulta). Lo cuida para-la-guia-server.test.ts. Si algo falla, lo que pide
 * esto sigue igual, sin estos datos.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { leerResultadoGuardado, type HuecoDeDecision } from "./analisis";
import { hayInsumos, insumosComoLineas, insumosParaLaGuia, yaSeSabeDeLasTarjetas, type InsumosParaLaGuia, type PreguntasDelDemo } from "./para-la-guia";

/** Cuántas reuniones recientes de la empresa se miran. */
const REUNIONES_A_MIRAR = 20;

/** Los análisis vigentes de estas reuniones, de esta empresa y de ninguna otra. */
async function analisisDe(clientId: string, ids: readonly string[]) {
  if (!ids.length) return new Map<string, unknown>();
  const filas = await prisma.analisisDeVenta.findMany({
    where: { sessionId: { in: [...ids] }, clientId, estado: "PROPUESTO" },
    select: { sessionId: true, resultado: true },
  });
  return new Map<string, unknown>(filas.map((f) => [f.sessionId, f.resultado]));
}

/**
 * Lo que dejó abierto el análisis más nuevo de la empresa que ya trae estos campos, y de qué reunión es. null si no hay
 * ninguno o no deja nada abierto. `casillas`: el resumen de la preventa de HOY (un hueco que el vendedor ya respondió
 * después del análisis no se vuelve a preguntar). Lanza si falla la base: lo atrapan los dos de abajo.
 */
async function loQueDejoAbiertoElUltimoAnalisis(
  clientId: string,
  casillas?: Readonly<Record<string, unknown>> | null,
): Promise<{ abiertos: InsumosParaLaGuia; deLaReunion: string } | null> {
  const reuniones = await getClientSessions(clientId, { take: REUNIONES_A_MIRAR });
  const porId = await analisisDe(
    clientId,
    reuniones.map((r) => r.id),
  );
  const sabido = yaSeSabeDeLasTarjetas(casillas);
  // `getClientSessions` las da de la más nueva a la más vieja.
  for (const r of reuniones) {
    if (!porId.has(r.id)) continue;
    const res = leerResultadoGuardado(porId.get(r.id));
    // Un análisis de antes del 8 nov no trae estos insumos: se salta. El más nuevo que sí los trae manda, aunque no deje nada abierto.
    if (!res?.decision) continue;
    const insumos = insumosParaLaGuia(res);
    const abiertos = { ...insumos, huecosDeDecision: insumos.huecosDeDecision.filter((h) => !sabido[h.hueco]) };
    if (!hayInsumos(abiertos)) return null;
    const dia = new Date(r.date).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");
    return { abiertos, deLaReunion: `la reunión «${r.title}» del ${dia}` };
  }
  return null;
}

/** Las líneas para la guía de la siguiente sesión (`loQueDejoAbiertoElUltimoAnalisis`). */
export async function insumosDelAnalisisParaLaGuia(clientId: string, casillas?: Readonly<Record<string, unknown>> | null): Promise<string[]> {
  try {
    const ultimo = await loQueDejoAbiertoElUltimoAnalisis(clientId, casillas);
    return ultimo ? insumosComoLineas(ultimo.abiertos, ultimo.deLaReunion) : [];
  } catch (e) {
    console.warn(`[analizador-venta] sin insumos para la guía de ${clientId}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Las preguntas para el demo del mismo análisis que alimenta la guía, para mostrarlas en la Preparación (sexta vuelta,
 * 2026-11-08: llegaban al pedido, «lo del demo NO se pregunta», pero la pantalla no las mostraba). Sin IA. null si no hay.
 */
export async function preguntasDelDemoParaLaPreparacion(clientId: string): Promise<PreguntasDelDemo | null> {
  try {
    const ultimo = await loQueDejoAbiertoElUltimoAnalisis(clientId);
    return ultimo?.abiertos.preguntasDelDemo.length ? { preguntas: ultimo.abiertos.preguntasDelDemo, deLaReunion: ultimo.deLaReunion } : null;
  } catch (e) {
    console.warn(`[analizador-venta] sin preguntas del demo para ${clientId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Lo que los análisis de las reuniones de la empresa ANTERIORES a esta ya sabían para decidir (gana lo más nuevo). */
export async function loQueSeSupoEnSesionesAnteriores(clientId: string, fecha: Date, sessionId: string): Promise<Partial<Record<HuecoDeDecision, string>>> {
  try {
    const antes = (await getClientSessions(clientId, { before: fecha, take: 30 })).filter((s) => s.id !== sessionId && s.date < fecha.getTime());
    const porId = await analisisDe(
      clientId,
      antes.map((s) => s.id),
    );
    const out: Partial<Record<HuecoDeDecision, string>> = {};
    // De la más nueva a la más vieja (como las da el chokepoint): lo último que se supo gana.
    for (const s of antes) {
      for (const d of leerResultadoGuardado(porId.get(s.id))?.decision ?? []) {
        if (d.seSabe && !out[d.hueco]) out[d.hueco] = d.texto;
      }
    }
    return out;
  } catch (e) {
    console.warn(`[analizador-venta] sin sesiones anteriores para ${sessionId}:`, e instanceof Error ? e.message : e);
    return {};
  }
}
