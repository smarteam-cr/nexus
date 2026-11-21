/**
 * lib/chat-de-nexus/conversacion-server.ts — una vuelta de «Hablar con Nexus», con su tope y su medición. SERVIDOR.
 *
 * Una llamada a Claude por `lib/anthropic.ts` (ARCHITECTURE §6), medida en el gasto de IA (`conContextoDeIA`, origen
 * `chat:<superficie>`: al agente del lugar, al cliente y a quien conversa) y con su `AgentRun` (`modo: chat-de-nexus`,
 * la conversación en `filters.conversacion`). Si la persona PREGUNTA algo de la cuenta, una segunda llamada lo responde
 * leyendo todo lo de esa cuenta (./respuesta.ts; `modo: chat-de-nexus-respuesta`, con caché de prompt y su propio tope
 * por día, porque lee mucho texto). De las corridas salen los topes: vueltas por conversación, vueltas por persona en el
 * día y preguntas por persona en el día (en Costa Rica). Lo que respondió el modelo, ya leído, queda en `output`: al
 * guardar, los hechos salen de ahí y no de lo que mande el navegador (`ultimoTurnoListo`).
 *
 * ⚠ Los topes se cuentan y después se crea la corrida, sin bloqueo: dos pedidos juntos pueden pasarse por uno. El panel no
 * deja mandar otro mientras espera; lo que queda expuesto es el gasto, y lo acota el tope del día.
 *
 * No escribe nada del lugar: ni la nota ni las tarjetas. Eso lo hace la pantalla por su camino de siempre, y los hechos
 * los escribe su único escritor (lib/seguimiento/hechos-server.ts).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { inicioDelDiaCr } from "@/lib/ai/presupuesto";
import { prisma } from "@/lib/db/prisma";
import {
  leerElTurno,
  loQueConto,
  NO_SE_PUDO_LEER,
  pedidoDelTurno,
  porQueNoSigue,
  puedePreguntar,
  TOPES,
  type ContextoParaNexus,
  type MensajeDeLaConversacion,
  type ResultadoDelTurno,
} from "./conversacion";
import { leerLaRespuesta, pedidoDeLaRespuesta, PREGUNTAS_POR_DIA, type FuenteDeLaCuenta, type LoQueQuedoAfuera, type RespuestaDeNexus } from "./respuesta";

/** El modo de la corrida de una vuelta: lo que cuentan los topes y lo que busca `ultimoTurnoListo`. */
export const MODO_DEL_CHAT = "chat-de-nexus";
/** El modo de la corrida que responde una pregunta sobre la cuenta. */
export const MODO_DE_LA_RESPUESTA = "chat-de-nexus-respuesta";

export interface DondeConversa {
  /** El agente al que se le carga el gasto (el del módulo del lugar). */
  agentSlug: string;
  /** «preventa»: el lugar, para el origen del gasto y los filtros. */
  superficie: string;
  clientId: string;
  projectId: string | null;
  email: string;
  /** Cómo se llama quien conversa (para el pedido). */
  nombre: string;
  /** Lo que identifica el lugar en `filters` (la exploración). */
  filtros: Record<string, string>;
}

export type VueltaDeNexus = { ok: true; turno: ResultadoDelTurno; quedan: number } | { ok: false; status: number; error: string };

const conModo = (modo: string) => ({ filters: { path: ["modo"], equals: modo } }) satisfies Prisma.AgentRunWhereInput;
const conversacionEn = (conversacion: string) => ({ filters: { path: ["conversacion"], equals: conversacion } }) satisfies Prisma.AgentRunWhereInput;

/** Cuántas vueltas lleva la conversación, cuántas la persona hoy y cuántas preguntas respondió hoy. */
export async function vueltasHastaAhora(email: string, conversacion: string, ahora = new Date()): Promise<{ deLaConversacion: number; deHoy: number; preguntasDeHoy: number }> {
  const hoy = { triggeredByEmail: email, createdAt: { gte: inicioDelDiaCr(ahora) } } satisfies Prisma.AgentRunWhereInput;
  const [deLaConversacion, deHoy, preguntasDeHoy] = await Promise.all([
    prisma.agentRun.count({ where: { triggeredByEmail: email, AND: [conModo(MODO_DEL_CHAT), conversacionEn(conversacion)] } }),
    prisma.agentRun.count({ where: { ...hoy, ...conModo(MODO_DEL_CHAT) } }),
    prisma.agentRun.count({ where: { ...hoy, ...conModo(MODO_DE_LA_RESPUESTA) } }),
  ]);
  return { deLaConversacion, deHoy, preguntasDeHoy };
}

/** Lo que el lugar lee para responder una pregunta: sus fuentes y lo que quedó afuera (./respuesta.ts › `armarLasFuentes`). */
export type LeerLaCuenta = () => Promise<{ fuentes: FuenteDeLaCuenta[]; afuera: LoQueQuedoAfuera }>;

const NO_SE_PUDO_RESPONDER = (afuera: LoQueQuedoAfuera): RespuestaDeNexus => ({
  sabe: false,
  texto: "No pude leer la cuenta ahora. Vuelve a preguntarme en un rato.",
  citas: [],
  sinRespaldo: false,
  afuera,
});

/** La acción «leer el contexto de la cuenta» cuando responde: una llamada, medida, con su corrida y su tope. */
async function responder(o: { pregunta: string; mensajes: MensajeDeLaConversacion[]; conversacion: string; contexto: ContextoParaNexus; donde: DondeConversa; leerLaCuenta: LeerLaCuenta }): Promise<RespuestaDeNexus> {
  const { donde } = o;
  const { fuentes, afuera } = await o.leerLaCuenta();
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: donde.agentSlug,
      clientId: donde.clientId,
      projectId: donde.projectId,
      status: "RUNNING",
      stepLabel: "Nexus responde sobre la cuenta",
      triggeredByEmail: donde.email,
      filters: { modo: MODO_DE_LA_RESPUESTA, superficie: donde.superficie, conversacion: o.conversacion, ...donde.filtros } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: donde.agentSlug, agentRunId: run.id, clientId: donde.clientId, projectId: donde.projectId, triggeredByEmail: donde.email, origen: `chat:${donde.superficie}:respuesta` };
  try {
    const r = await conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDeLaRespuesta({ empresa: o.contexto.empresa, fuentes, afuera, conversacion: o.mensajes, pregunta: o.pregunta })));
    const respuesta = leerLaRespuesta(r, fuentes, afuera);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify({ pregunta: o.pregunta, ...respuesta, fuentes: fuentes.map((f) => f.clave) }) } });
    return respuesta;
  } catch (e) {
    console.error("[chat-de-nexus] la IA no respondió la pregunta", e);
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) } })
      .catch(() => {});
    return NO_SE_PUDO_RESPONDER(afuera);
  }
}

/**
 * Corre una vuelta. `valorValido`: la regla del lugar para cada destino (el esquema de la tarjeta, en la preventa).
 * `leerLaCuenta`: lo que lee para responder una pregunta. Si la IA falla, responde «no se pudo leer»: la nota se guarda
 * igual y la persona no pierde lo que escribió.
 */
export async function correrUnaVuelta(o: {
  contexto: ContextoParaNexus;
  mensajes: MensajeDeLaConversacion[];
  conversacion: string;
  donde: DondeConversa;
  valorValido: (destino: string, valor: unknown) => unknown;
  leerLaCuenta: LeerLaCuenta;
}): Promise<VueltaDeNexus> {
  const { contexto, mensajes, conversacion, donde } = o;
  const vueltas = await vueltasHastaAhora(donde.email, conversacion);
  const tope = porQueNoSigue(vueltas.deLaConversacion, vueltas.deHoy);
  if (tope) return { ok: false, status: 429, error: tope };
  /** Las vueltas que le quedan a la conversación después de esta. */
  const quedan = Math.max(0, TOPES.turnosPorConversacion - vueltas.deLaConversacion - 1);

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: donde.agentSlug,
      clientId: donde.clientId,
      projectId: donde.projectId,
      status: "RUNNING",
      stepLabel: "Hablar con Nexus",
      triggeredByEmail: donde.email,
      filters: { modo: MODO_DEL_CHAT, superficie: donde.superficie, conversacion, ...donde.filtros } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: donde.agentSlug, agentRunId: run.id, clientId: donde.clientId, projectId: donde.projectId, triggeredByEmail: donde.email, origen: `chat:${donde.superficie}` };
  let turno: ResultadoDelTurno;
  try {
    const respuesta = await conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDelTurno(contexto, mensajes, donde.nombre)));
    turno = leerElTurno(respuesta, {
      destinos: new Set(contexto.destinos.map((d) => d.clave)),
      valorValido: o.valorValido,
      loQueDijo: loQueConto(mensajes),
      puedePreguntar: puedePreguntar(mensajes),
    });
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify(turno) } });
  } catch (e) {
    console.error("[chat-de-nexus] la IA no respondió", e);
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) } })
      .catch(() => {});
    return { ok: true, turno: NO_SE_PUDO_LEER, quedan };
  }

  if (turno.tipo === "consulta") {
    if (vueltas.preguntasDeHoy >= PREGUNTAS_POR_DIA) {
      return { ok: false, status: 429, error: `Hoy ya le hiciste ${PREGUNTAS_POR_DIA} preguntas a Nexus, el tope del día: cada una lee todo lo de la cuenta. Mañana sigues.` };
    }
    const respuesta = await responder({ pregunta: turno.pregunta, mensajes, conversacion, contexto, donde, leerLaCuenta: o.leerLaCuenta });
    return { ok: true, turno: { tipo: "respuesta", respuesta }, quedan };
  }
  return { ok: true, turno, quedan };
}

/**
 * El último «listo» de la conversación de esta persona en este lugar, como lo leyó el servidor, con su corrida. De acá
 * salen los hechos al guardar: lo que mande el navegador no cuenta. null si no hay.
 */
export async function ultimoTurnoListo(
  email: string,
  conversacion: string,
  filtros: Record<string, string>,
): Promise<{ turno: Extract<ResultadoDelTurno, { tipo: "listo" }>; agentRunId: string } | null> {
  const runs = await prisma.agentRun.findMany({
    where: {
      triggeredByEmail: email,
      status: "DONE",
      AND: [conModo(MODO_DEL_CHAT), conversacionEn(conversacion), ...Object.entries(filtros).map(([k, v]) => ({ filters: { path: [k], equals: v } }))],
    },
    orderBy: { createdAt: "desc" },
    take: TOPES.turnosPorConversacion,
    select: { id: true, output: true },
  });
  for (const run of runs) {
    try {
      const t = JSON.parse(run.output ?? "null") as ResultadoDelTurno | null;
      if (t && t.tipo === "listo") return { turno: t, agentRunId: run.id };
    } catch {
      // Una corrida que no se lee no cuenta.
    }
  }
  return null;
}
