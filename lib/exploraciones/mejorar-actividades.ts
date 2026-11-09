/**
 * lib/exploraciones/mejorar-actividades.ts — «Mejorar con IA» de las actividades de un caso elegido. SERVIDOR.
 *
 * Décima vuelta (2026-11-08, lib/casos-de-uso/mejorar.ts): una llamada al agente con la instrucción del CSE, que la
 * pantalla espera. Devuelve la PROPUESTA y no guarda nada en la preventa: el CSE la revisa en `<AgentProposal>` y, si la
 * aplica, la pantalla la escribe como cualquier cambio del caso (con «Deshacer»). La corrida queda en `AgentRun` y el
 * gasto en el medidor (`conContextoDeIA`), como la personalización.
 *
 * ⛔ Invariante 1: las reuniones son las DE LA PREVENTA (`contextoDePersonalizar` → `minutasRecientes`, del chokepoint).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { actividadesDelElegido } from "@/lib/casos-de-uso/armado";
import type { PropuestaDeMejora } from "@/lib/casos-de-uso/mejorar";
import { AGENTE_DE_LA_EXPLORACION, pendientesVigentes } from "./agente";
import { exploracionParaLosCasos } from "./casos-de-uso";
import { leerLaMejora, pedidoDeMejorar } from "./mejorar-pedido";
import { contextoDePersonalizar } from "./personalizar-caso";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";

export type ResultadoDeMejorar = { ok: true; propuesta: PropuestaDeMejora; segundos: number } | { ok: false; status: number; error: string };

export async function mejorarActividades(o: { exploracionId: string; useCaseId: string; instruccion: string; email: string | null }): Promise<ResultadoDeMejorar> {
  const t0 = Date.now();
  const lectura = await leerExploracion(o.exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa preventa no existe." };
  const fila = lectura.fila;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La preventa está archivada: el agente ya no trabaja en ella." };
  if (fila.projectId) return { ok: false, status: 409, error: "La exploración de un proyecto no arma casos de uso." };
  const estado = estadoDesdeFila(fila);
  // Con hasOwn: un id como «constructor» no es un caso (sin esto, daba un 500 en vez de un 409).
  const caso = Object.hasOwn(estado.contenido.casosDeUso, o.useCaseId) ? estado.contenido.casosDeUso[o.useCaseId] : undefined;
  if (!caso) return { ok: false, status: 409, error: "Ese caso ya no está elegido." };
  const vig = await escalaParaExplorar();
  if (vig.estado !== "ok") return { ok: false, status: 503, error: "La escala no está publicada en Nexus." };
  const escala = escalaDeLaExploracion(vig.general, estado);
  const base = await contextoDePersonalizar({
    fila,
    empresa: fila.client.name,
    estado,
    exploracion: exploracionParaLosCasos(estado, escala, pendientesVigentes(estado, vig.general, escala)),
    useCaseId: o.useCaseId,
    caso,
    nombreDelArea: escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? null,
  });
  // Lo que tiene HOY, como lo ve la pantalla: las suyas o, si no tiene, las de su ficha.
  const ctx = { ...base, actuales: actividadesDelElegido(caso, base.ficha?.actividades), instruccion: o.instruccion };

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId: fila.clientId,
      status: "RUNNING",
      stepLabel: "Preventa: mejorar con IA las actividades de un caso",
      currentPhase: "Revisando las actividades con tu instrucción…",
      triggeredByEmail: o.email,
      filters: { preventa: o.exploracionId, modo: "mejorar-actividades", useCaseId: o.useCaseId } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  try {
    const respuesta = await conContextoDeIA(
      { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, triggeredByEmail: o.email, origen: "exploraciones/agente:mejorar-actividades" },
      () => getAnthropic().messages.create(pedidoDeMejorar(ctx)),
    );
    if (respuesta.stop_reason === "max_tokens") throw new Error("La respuesta del agente salió cortada. No se cambió nada: vuelve a intentarlo.");
    const propuesta = leerLaMejora(respuesta, ctx);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        currentPhase: null,
        output: JSON.stringify({ useCaseId: o.useCaseId, instruccion: o.instruccion, actividades: propuesta.actividades.length, cambios: propuesta.cambios, sugeridas: propuesta.sugeridas }),
      },
    });
    return { ok: true, propuesta, segundos: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    const mensaje = e instanceof Error && e.message.startsWith("La respuesta") ? e.message : humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/mejorar-actividades] falló", e);
    return { ok: false, status: 502, error: mensaje };
  }
}
