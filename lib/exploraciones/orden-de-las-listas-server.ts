/**
 * lib/exploraciones/orden-de-las-listas-server.ts — el agente que sugiere qué juntar y qué subir en la lista de una casilla
 * del Resumen (22 nov, noche: «la IA propone, tú ordenas»). SERVIDOR. Las reglas y la comprobación viven en
 * ./orden-de-las-listas.ts.
 *
 * - Corre SOLO a pedido («Pedirle a Nexus que ordene», en la casilla). Nunca al abrir la página ni al guardar.
 * - Lee lo GUARDADO de esa casilla de esa exploración y el nombre de su empresa: ni reuniones ni nada de otra cuenta
 *   (invariante 1). No guarda nada: devuelve las sugerencias y la persona las usa o las descarta en la lista.
 * - Haiku, medido (`conContextoDeIA`, agentSlug de la exploración y su `origen`), con su `AgentRun`. El tope del mes lo
 *   aplica `lib/anthropic.ts`.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { parseObject } from "@/lib/ai/section-schema";
import { prisma } from "@/lib/db/prisma";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { leerContenido } from "./esquemas";
import {
  leerSugerenciasDeOrden,
  mensajeParaOrdenar,
  MINIMO_PARA_SUGERIR,
  puntosParaOrdenar,
  REGLAS_DEL_ORDEN,
  type ClaveConOrden,
  type SugerenciaDeOrden,
} from "./orden-de-las-listas";

export const MODELO_DEL_ORDEN = "claude-haiku-4-5-20251001";
export const ORIGEN_DEL_ORDEN = "exploraciones/agente:orden-de-la-lista";

export type ResultadoDelOrden = { ok: true; sugerencias: SugerenciaDeOrden[] } | { ok: false; status: number; error: string };

export async function sugerirOrdenDeLaLista(o: { exploracionId: string; clave: ClaveConOrden; email: string | null }): Promise<ResultadoDelOrden> {
  const fila = await prisma.exploracionDeVenta.findUnique({
    where: { id: o.exploracionId },
    select: { clientId: true, projectId: true, contenido: true, archivadaEn: true, client: { select: { name: true } } },
  });
  if (!fila) return { ok: false, status: 404, error: "Esa exploración no existe." };
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada." };
  const puntos = puntosParaOrdenar(o.clave, leerContenido(fila.contenido).casillas[o.clave]);
  if (puntos.length < MINIMO_PARA_SUGERIR) return { ok: true, sugerencias: [] };

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId: fila.clientId,
      projectId: fila.projectId,
      status: "RUNNING",
      stepLabel: "Resumen: qué juntar y qué subir",
      currentPhase: "Leyendo la lista…",
      triggeredByEmail: o.email,
      filters: { exploracion: o.exploracionId, modo: "orden-de-la-lista", casilla: o.clave } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, projectId: fila.projectId, triggeredByEmail: o.email, origen: ORIGEN_DEL_ORDEN };
  try {
    const r = await conContextoDeIA(ia, () =>
      getAnthropic().messages.create({
        model: MODELO_DEL_ORDEN,
        max_tokens: 1500,
        system: REGLAS_DEL_ORDEN,
        messages: [{ role: "user", content: mensajeParaOrdenar(fila.client.name, o.clave, puntos) }],
      }),
    );
    const textoDeLaRespuesta = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const sugerencias = leerSugerenciasDeOrden(o.clave, parseObject(textoDeLaRespuesta), puntos);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", currentPhase: null, output: JSON.stringify({ sugerencias }) } });
    return { ok: true, sugerencias };
  } catch (e) {
    const mensaje = humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/orden-de-la-lista] falló", e);
    return { ok: false, status: 502, error: mensaje };
  }
}
