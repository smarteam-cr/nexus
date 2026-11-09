/**
 * lib/exploraciones/orden-de-los-casos.ts — ordenar la lista entera de casos de uso de la preventa. SERVIDOR.
 *
 * Décima vuelta (2026-11-08, lib/casos-de-uso/orden.ts): corre dentro de la vuelta de «Sugerir» o «Revisar» del agente
 * de casos (agente.ts › proponerCasos), con la misma corrida y el mismo medidor de gasto (`conContextoDeIA`). Si falla, la
 * vuelta se guarda igual con el orden de antes: la lista nunca se queda sin casos por esto.
 *
 * ⛔ Invariante 1: las minutas son las DE LA PREVENTA (`minutasRecientes`, que las toma del chokepoint de sesiones).
 */
import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import type { OrdenDeLosCasos } from "@/lib/casos-de-uso/orden";
import { candidatosAlOrden, casaConLoPendiente, exploracionParaLosCasos, loQueSeSabeParaElValor, negocioParaLosCasos } from "./casos-de-uso";
import { casaParaElAgente } from "@/lib/casos-de-uso/capas";
import type { EstadoDeExploracion, ItemPropuesto } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { minutasRecientes, type FilaParaLasReuniones } from "./minutas-de-la-preventa";
import { bloqueDeLaLectura } from "./notas-de-sesion";
import { objetivoDeSmarteam } from "./objetivo-y-hallazgos";
import { leerElOrden, pedidoDelOrden, type ContextoDelOrden } from "./orden-pedido";

/** El objetivo de la exploración como lo lee el agente: el de Smarteam y su ajuste para esta empresa. */
export function objetivoParaElOrden(estado: EstadoDeExploracion): string {
  const ajuste = estado.contenido.contexto?.objetivo?.trim();
  return [objetivoDeSmarteam("venta"), ajuste ? `Ajuste para esta empresa: ${ajuste}` : null].filter(Boolean).join("\n");
}

/** Lo que lee el agente que ordena (exportado para el simulacro de scripts/simular-casos-de-uso.ts). */
export async function contextoDelOrden(o: {
  fila: FilaParaLasReuniones & { client: { name: string } };
  estado: EstadoDeExploracion;
  escala: EscalaDelLienzo;
  pendientes: readonly ItemPropuesto[];
  nuevos: readonly ItemPropuesto[];
}): Promise<ContextoDelOrden> {
  return {
    empresa: o.fila.client.name,
    objetivo: objetivoParaElOrden(o.estado),
    exploracion: exploracionParaLosCasos(o.estado, o.escala, o.pendientes),
    interno: loQueSeSabeParaElValor(o.estado),
    reuniones: await minutasRecientes(o.fila, o.estado),
    instrucciones: bloqueDeLaLectura(o.estado.contenido.notas),
    candidatos: candidatosAlOrden(o.estado, o.escala, o.pendientes, o.nuevos),
    // 2026-11-09 (lib/casos-de-uso/capas.ts): la casa manda en el orden, y el título se arma con su negocio.
    casa: (() => {
      const { hubspot, casa } = casaConLoPendiente(o.estado, o.escala, o.pendientes);
      return casaParaElAgente(casa, hubspot, (l) => o.escala.niveles.find((n) => n.letra === l)?.nombre ?? l);
    })(),
    negocio: negocioParaLosCasos(o.estado),
  };
}

/** Ordena la lista. null si no hay nada que ordenar (menos de dos casos) o si el agente no ordenó ninguno. */
export async function ordenarLosCasos(o: {
  runId: string;
  fila: FilaParaLasReuniones & { client: { name: string } };
  estado: EstadoDeExploracion;
  escala: EscalaDelLienzo;
  pendientes: readonly ItemPropuesto[];
  nuevos: readonly ItemPropuesto[];
  email: string | null;
  /** El slug del agente de la exploración (lo pasa agente.ts: importarlo de ahí haría un ciclo). */
  agentSlug: string;
}): Promise<OrdenDeLosCasos | null> {
  const ctx = await contextoDelOrden(o);
  if (ctx.candidatos.length < 2) return null;
  const respuesta = await conContextoDeIA(
    { agentSlug: o.agentSlug, agentRunId: o.runId, clientId: o.fila.clientId, triggeredByEmail: o.email, origen: "exploraciones/agente:casos-orden" },
    () => getAnthropic().messages.create(pedidoDelOrden(ctx)),
  );
  // Cortada por el tope, la lista llega a medias: no reemplaza al orden de antes (revisión del 2026-11-08).
  if (respuesta.stop_reason === "max_tokens") {
    console.warn("[exploraciones/orden-de-los-casos] la respuesta salió cortada; queda el orden de antes");
    return null;
  }
  return leerElOrden(respuesta, ctx, o.runId);
}
