/**
 * lib/exploraciones/agente.ts — correr el agente de la exploración. SERVIDOR.
 *
 * Dos momentos: «preparar» (antes de la primera reunión) y «leer» (después de cada una). La
 * corrida queda en `AgentRun` (creada ANTES de llamar a nada: cualquier falla deja su causa) y corre
 * en segundo plano; la pantalla sigue su fase.
 *
 * ⛔ El agente NUNCA escribe lo confirmado: lo único que guarda es `propuesta` (lo propuesto, lo que
 * ya leyó y sus corridas) y la foto de lo leído en `test`. Lo guarda con la fila BLOQUEADA y
 * releída, como el vendedor: así una corrida que leyó antes de un «Descartar» no lo resucita, y la
 * lápida de lo descartado se respeta (fusionarPropuestas).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { leerLaRespuesta, pedidoDeLaExploracion, propuestasDelTest, type ContextoDelPedido } from "./agente-pedido";
import { fusionarPropuestas, propuestaVigente, type ItemPropuesto } from "./contenido";
import { leerFuentes, type LoQueSeLeyo } from "./fuentes";
import { bloquearFila, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";

export const AGENTE_DE_LA_EXPLORACION = "exploracion-de-venta";

export type ModoDelAgente = "preparar" | "leer";

const ETIQUETA: Record<ModoDelAgente, string> = {
  preparar: "Exploración de venta: preparar",
  leer: "Exploración de venta: leer la reunión",
};

/** Un fallo con un mensaje que ya está escrito para el vendedor (no hace falta traducirlo). */
class FalloDeLaExploracion extends Error {}

/** Una corrida RUNNING más vieja que esto se da por muerta (el proceso se reinició a mitad). */
const VIVA_POR_MINUTOS = 15;

export type ResultadoDeLanzar = { ok: true; runId: string; yaCorria: boolean } | { ok: false; status: number; error: string };

/** La última corrida de esta exploración (la pantalla la sigue). */
export async function ultimaCorrida(exploracionId: string, clientId: string) {
  return prisma.agentRun.findFirst({
    where: { clientId, agentSlug: AGENTE_DE_LA_EXPLORACION, filters: { path: ["exploracionId"], equals: exploracionId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, createdAt: true, output: true, stepLabel: true },
  });
}

/** ¿Hay una corrida viva de esta exploración? Una a la vez: dos corridas se pisarían lo leído. */
async function corridaViva(exploracionId: string, clientId: string) {
  const r = await ultimaCorrida(exploracionId, clientId);
  if (!r || r.status !== "RUNNING") return null;
  return Date.now() - r.createdAt.getTime() < VIVA_POR_MINUTOS * 60_000 ? r : null;
}

export async function lanzarCorrida(
  exploracionId: string,
  modo: ModoDelAgente,
  opts: { triggeredByEmail: string | null; sesionId?: string | null },
): Promise<ResultadoDeLanzar> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  const clientId = lectura.fila.clientId;
  const viva = await corridaViva(exploracionId, clientId);
  if (viva) return { ok: true, runId: viva.id, yaCorria: true };

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId,
      status: "RUNNING",
      stepLabel: ETIQUETA[modo],
      currentPhase: "Empezando…",
      triggeredByEmail: opts.triggeredByEmail,
      filters: { exploracionId, modo } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  // En segundo plano: la pantalla sigue la fase. Cualquier falla queda en la corrida.
  void correr(run.id, exploracionId, modo, opts).catch((e) => console.error("[exploraciones/agente] la corrida falló fuera de su try", e));
  return { ok: true, runId: run.id, yaCorria: false };
}

async function fase(runId: string, texto: string) {
  await prisma.agentRun.update({ where: { id: runId }, data: { currentPhase: texto } }).catch(() => {});
}

async function correr(runId: string, exploracionId: string, modo: ModoDelAgente, opts: { triggeredByEmail: string | null; sesionId?: string | null }) {
  try {
    const escalaVig = await escalaParaExplorar();
    if (escalaVig.estado !== "ok") throw new FalloDeLaExploracion("La escala no está publicada en Nexus: sin ella el agente no puede proponer niveles.");
    const lectura = await leerExploracion(exploracionId);
    if (lectura.estado !== "ok") throw new FalloDeLaExploracion("La exploración ya no existe.");
    const fila = lectura.fila;
    const estado = estadoDesdeFila(fila);
    const escala = escalaDeLaExploracion(escalaVig.general, estado);

    await fase(runId, "Leyendo HubSpot y las reuniones…");
    const leido = await leerFuentes({
      clientId: fila.clientId,
      companyId: fila.client.hubspotCompanyId,
      escala,
      propuesta: estado.propuesta,
      notas: estado.contenido.notas,
      modo,
      sesionId: opts.sesionId,
    });

    const ctx: ContextoDelPedido = {
      modo,
      empresa: fila.client.name,
      industria: fila.client.industry,
      escala,
      areas: estado.areas,
      perfil: estado.perfilCierre && estado.perfilDespues ? `venta ${estado.perfilCierre} · relación ${estado.perfilDespues}` : null,
      contenido: estado.contenido,
      fuentes: leido.fuentes,
    };

    const delTest = propuestasDelTest(leido.tests, ctx, runId);
    let deLaIA: ItemPropuesto[] = [];
    let descartadas = 0;
    const hayQueLeer = modo === "preparar" ? leido.fuentes.length > 0 : leido.fuentes.some((f) => /^[SH]\d/.test(f.id));
    if (hayQueLeer) {
      await fase(runId, "Pensando qué proponer…");
      const respuesta = await conContextoDeIA(
        {
          agentSlug: AGENTE_DE_LA_EXPLORACION,
          agentRunId: runId,
          clientId: fila.clientId,
          triggeredByEmail: opts.triggeredByEmail,
          origen: `exploraciones/agente:${modo}`,
        },
        () => getAnthropic().messages.create(pedidoDeLaExploracion(ctx)),
      );
      const r = leerLaRespuesta(respuesta, ctx, runId);
      deLaIA = r.items;
      descartadas = r.descartadas;
    }

    await fase(runId, "Guardando lo propuesto…");
    const propuestos = await guardar(exploracionId, [...delTest, ...deLaIA], leido, { runId, modo });
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "DONE",
        currentPhase: null,
        sourceSessionIds: leido.sesionesUsadas,
        output: JSON.stringify({
          propuestos,
          descartadas,
          fuentes: leido.fuentes.length,
          correosSinPermiso: leido.correosSinPermiso,
          nadaNuevo: modo === "leer" && !hayQueLeer,
        }),
      },
    });
  } catch (e) {
    console.error(`[exploraciones/agente] ${modo} ${exploracionId}`, e);
    await prisma.agentRun
      .update({
        where: { id: runId },
        data: {
          status: "ERROR",
          currentPhase: null,
          output: JSON.stringify({
            error: e instanceof FalloDeLaExploracion ? e.message : humanizeAgentError(e),
            raw: e instanceof Error ? e.message : String(e),
          }),
        },
      })
      .catch(() => {});
  }
}

/** Suma lo propuesto con la fila bloqueada y releída. Devuelve cuántas propuestas nuevas quedaron. */
async function guardar(
  exploracionId: string,
  items: ItemPropuesto[],
  leido: LoQueSeLeyo,
  corrida: { runId: string; modo: ModoDelAgente },
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({
      where: { id: exploracionId },
      select: {
        contenido: true,
        propuesta: true,
        areas: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        responsableEmail: true,
        archivadaEn: true,
      },
    });
    if (!fila) return 0;
    const estado = estadoDesdeFila(fila);
    const antes = propuestaVigente(estado).length;
    const fusion = fusionarPropuestas(estado, items);
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(-500);
    const propuesta = {
      ...fusion,
      leidas: {
        sesiones: union(fusion.leidas.sesiones, leido.leidas.sesiones),
        hubspot: union(fusion.leidas.hubspot, leido.leidas.hubspot),
      },
      corridas: [...fusion.corridas, { id: corrida.runId, modo: corrida.modo, en: new Date().toISOString(), propuestos: 0 }].slice(-50),
    };
    const despues = propuestaVigente({ ...estado, propuesta }).length;
    const nuevas = Math.max(0, despues - antes);
    propuesta.corridas[propuesta.corridas.length - 1].propuestos = nuevas;
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: {
        propuesta: propuesta as unknown as Prisma.InputJsonValue,
        test: {
          tests: leido.tests,
          agenda: leido.agenda,
          correosSinPermiso: leido.correosSinPermiso,
          leidoEn: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return nuevas;
  });
}
