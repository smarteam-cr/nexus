import "server-only";

/**
 * lib/handoff/proponer-resultados.ts — la lista de RESULTADOS del cliente cuando el handoff no la
 * escribió (2026-10-02). La lista es UNA (`Project.handoffResultados`, lib/handoff/resultados-medibles.ts)
 * y la confirma el CSE del proyecto.
 *
 * `leerOProponerResultados` es la única puerta que usan el handoff (analyze/route.ts), el botón
 * «Leer / proponer» de la lista, el diagnóstico y el relleno hacia atrás (scripts/proponer-resultados.ts):
 *   1. Si el handoff tiene escrita la sección de resultados, la LEE (lib/handoff/resultados.ts).
 *   2. Si no la tiene, la IA la PROPONE desde el handoff, la ficha del cliente, la encuesta y las
 *      reuniones del proyecto (con su piso de fecha), y queda «sin confirmar».
 * En los dos casos se une con lo guardado: lo editado o confirmado por una persona no se pisa.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { leerFicha, valorVigente } from "@/lib/clients/ficha";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { isRecurrente } from "@/lib/tags/catalog";
import { estructurarResultadosDelHandoff, resultadosDelProyecto } from "./resultados";
import { fusionarResultados, type ResultadoMedible, type ResultadosDelHandoff } from "./resultados-medibles";
import { leerPropuestaDeResultados, pedidoDeResultados, type FuenteDeResultados } from "./propuesta-de-resultados";

/**
 * Lo del handoff que habla del para qué — SOLO lo apto para el cliente: la lista alimenta los
 * objetivos del diagnóstico, que se le presenta al cliente (misma allowlist que el diagnóstico).
 */
const HANDOFF_KEYS = ["dolor_principal", "expectativas", "stakeholders_handoff", "alcance_contratado", "desarrollo"] as const;
const SESIONES = 8;
const POR_SESION = 4_000;

export type ResultadoDeLeerOProponer =
  | { status: "leidos"; resultados: ResultadoMedible[] }
  | { status: "propuestos"; resultados: ResultadoMedible[] }
  | { status: "sin_fuentes" }
  | { status: "error"; error: string };

function fechaCorta(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
}

/** Las fuentes: handoff, ficha del cliente, encuesta y las últimas reuniones DEL PROYECTO (con su piso). */
async function fuentesDelProyecto(projectId: string, clientId: string): Promise<FuenteDeResultados[]> {
  const [handoff, encuesta, cliente, { sessions }, categorias] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: HANDOFF_KEYS }).catch(() => ""),
    loadCuestionarioContext(projectId).catch(() => ""),
    prisma.client.findUnique({ where: { id: clientId }, select: { ficha: true } }),
    getProjectMemberSessions(projectId),
    getSessionCategories(),
  ]);
  const fuentes: FuenteDeResultados[] = [];
  if (handoff.trim()) fuentes.push({ id: "H1", etiqueta: "Handoff del proyecto", texto: handoff });
  const resultadosDeLaFicha = valorVigente(leerFicha(cliente?.ficha), "resultadosQuePersigue");
  if (resultadosDeLaFicha.trim()) {
    fuentes.push({ id: "F1", etiqueta: "Ficha del cliente — resultados que persigue", texto: resultadosDeLaFicha });
  }
  if (encuesta.trim()) fuentes.push({ id: "E1", etiqueta: "Respuestas a la encuesta previa", texto: encuesta.slice(0, 12_000) });

  const dominiosPropios = buildInternalDomainsSet(categorias);
  const recientes = [...soloOcurridas(sessions)].sort((a, b) => b.date - a.date).slice(0, SESIONES);
  let n = 0;
  for (const s of recientes) {
    const t = await fetchTranscriptContent(s.id, s.title, { maxChars: POR_SESION }).catch(() => null);
    if (!t?.trim()) continue;
    const sala = prefijoDeSala(etiquetaDeSala({ participants: s.participants }, dominiosPropios));
    fuentes.push({ id: `S${++n}`, etiqueta: `${sala}Sesión «${s.title}» del ${fechaCorta(s.date)}`, texto: t });
  }
  return fuentes;
}

/** La IA propone desde las fuentes y se une con lo guardado. Nunca lanza. */
async function proponerDesdeLasFuentes(
  projectId: string,
  triggeredByEmail: string | null,
): Promise<ResultadoDeLeerOProponer> {
  try {
    const proyecto = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, clientId: true, tags: true, client: { select: { name: true } } },
    });
    if (!proyecto) return { status: "error", error: "Proyecto no encontrado" };

    const fuentes = await fuentesDelProyecto(projectId, proyecto.clientId);
    if (fuentes.length === 0) return { status: "sin_fuentes" };

    // Todo el equipo, también los dados de baja: nunca son «quien necesita el resultado».
    const equipo = (await prisma.teamMember.findMany({ select: { name: true } })).map((t) => t.name);
    const pedido = pedidoDeResultados({
      cliente: proyecto.client.name,
      proyecto: proyecto.name,
      recurrente: isRecurrente(proyecto.tags),
      fuentes,
      equipoSmarteam: equipo,
    });

    let respuesta: Anthropic.Messages.Message;
    try {
      respuesta = await conContextoDeIA(
        { agentSlug: "resultados-del-cliente", clientId: proyecto.clientId, projectId, triggeredByEmail, origen: "handoff/resultados:propuesta" },
        () => getAnthropic().messages.create(pedido),
      );
    } catch (e) {
      return { status: "error", error: e instanceof Error ? e.message : String(e) };
    }

    const propuestos = leerPropuestaDeResultados(respuesta, fuentes, equipo);
    const previos = (await resultadosDelProyecto(projectId))?.resultados ?? [];
    const resultados = fusionarResultados(previos, propuestos);
    const guardar: ResultadosDelHandoff = { version: 1, resultados, at: new Date().toISOString(), origen: "propuesta" };
    await prisma.project.update({ where: { id: projectId }, data: { handoffResultados: guardar as object } });
    return { status: "propuestos", resultados };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/** La puerta única: lee la sección del handoff; si no está escrita, la propone desde las fuentes. */
export async function leerOProponerResultados(
  projectId: string,
  opts: { origen: ResultadosDelHandoff["origen"]; triggeredByEmail?: string | null },
): Promise<ResultadoDeLeerOProponer> {
  const leida = await estructurarResultadosDelHandoff(projectId, opts.origen);
  if (leida.status === "ok") return { status: "leidos", resultados: leida.resultados };
  if (leida.status === "error") return leida;
  return proponerDesdeLasFuentes(projectId, opts.triggeredByEmail ?? null);
}
