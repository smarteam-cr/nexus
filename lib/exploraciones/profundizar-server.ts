/**
 * lib/exploraciones/profundizar-server.ts — «Para profundizar» a pedido, desde el servidor (2026-11-08). SERVER-ONLY.
 *
 * Pide las preguntas de los bloques que faltan de UNA guía guardada (la que el vendedor tiene enfrente, por su `en`), en una
 * llamada chica (profundizar-pedido.ts), y las guarda en esa guía con la fila bloqueada. No lee sesiones ni fuentes: el
 * bloque ya trae lo que se sabe del cliente, así que no cruza nada entre clientes.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { leerPropuesta } from "./esquemas";
import { marcoDe } from "./marco";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { bloquearFila, leerExploracion } from "./servidor";
import {
  avisoDeProfundizar,
  bloquesPorPedir,
  hayQueReintentar,
  laGuiaGuardada,
  propuestaConProfundizar,
  leerProfundizar,
  mejorDeLasDos,
  ORIGEN_DE_PROFUNDIZAR,
  pedidoDeProfundizar,
  type EntradaDeProfundizar,
} from "./profundizar-pedido";

export class ErrorDeProfundizar extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Pide y guarda las preguntas para profundizar de los bloques `indices` de la guía `en`. Devuelve las de cada bloque pedido
 * (vacío si el agente no dejó ninguna que cumpla: el bloque queda con `profundizar: []` y no se vuelve a pedir).
 */
export async function profundizarBloques(
  exploracionId: string,
  o: { sesionId: string | null; en: string; indices: readonly number[] },
  quienPide: string | null,
): Promise<Record<number, string[]>> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") throw new ErrorDeProfundizar(404, "Esa preventa no existe.");
  const fila = lectura.fila;
  if (fila.archivadaEn) throw new ErrorDeProfundizar(409, "La preventa está archivada: ya no se puede cambiar.");
  const guia = laGuiaGuardada(leerPropuesta(fila.propuesta), o.sesionId, o.en);
  if (!guia?.agenda) throw new ErrorDeProfundizar(409, "La guía cambió mientras tanto: recarga la página.");
  const agenda = guia.agenda;
  const indices = bloquesPorPedir(agenda, o.indices);
  if (!indices.length) return Object.fromEntries(o.indices.map((i) => [i, agenda.bloques[i]?.profundizar ?? []]));
  const entrada: EntradaDeProfundizar = {
    empresa: fila.client.name,
    industria: fila.client.industry ?? null,
    marco: marcoDe(fila.marco).clave,
    objetivo: guia.objetivoAceptado ?? guia.objetivo ?? null,
    claves: agenda.claves,
    bloques: indices.map((i) => ({ i, bloque: agenda.bloques[i] })),
  };
  const pedir = (aviso = "") =>
    conContextoDeIA(
      { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: null, clientId: fila.clientId, triggeredByEmail: quienPide, origen: ORIGEN_DE_PROFUNDIZAR },
      () => getAnthropic().messages.create(pedidoDeProfundizar(entrada, aviso), { timeout: 45_000, maxRetries: 1 }),
    );
  const primera = leerProfundizar(await pedir(), entrada);
  /* Una vez más si algo no cumplía (voseo, cerrada, doble) o si faltó un bloque del cuerpo (la apertura y el cierre pueden
     no traer ninguna). Se queda lo mejor de cada bloque; si el segundo intento falla, queda el primero. */
  const porBloque = hayQueReintentar(primera, entrada)
    ? await pedir(avisoDeProfundizar(primera.conProblema))
        .then((r) => mejorDeLasDos(primera, leerProfundizar(r, entrada)))
        .catch((e: unknown) => {
          console.error("[exploraciones/profundizar] el segundo intento falló; queda el primero", e);
          return primera.porBloque;
        })
    : primera.porBloque;
  const nuevas = Object.fromEntries(indices.map((i) => [i, porBloque[i] ?? []]));

  // Lo que quedó guardado: si otra pestaña pidió el mismo bloque a la vez, las suyas (las que se ven al recargar).
  const guardadas = await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const actual = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { propuesta: true } });
    if (!actual) return null;
    const nueva = propuestaConProfundizar(leerPropuesta(actual.propuesta), o.sesionId, o.en, nuevas);
    // Si la guía cambió en el medio (otra se armó), no se toca nada: las preguntas eran para la vieja.
    if (!nueva) return null;
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { propuesta: nueva as unknown as Prisma.InputJsonValue } });
    return laGuiaGuardada(nueva, o.sesionId, o.en)?.agenda ?? null;
  });
  if (!guardadas) throw new ErrorDeProfundizar(409, "La guía cambió mientras tanto: recarga la página.");
  return Object.fromEntries(o.indices.map((i) => [i, guardadas.bloques[i]?.profundizar ?? []]));
}
