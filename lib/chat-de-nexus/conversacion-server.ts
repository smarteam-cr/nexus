/**
 * lib/chat-de-nexus/conversacion-server.ts — una vuelta de «Hablar con Nexus», con su tope y su medición. SERVIDOR.
 *
 * Una llamada a Claude por `lib/anthropic.ts` (ARCHITECTURE §6), medida en el gasto de IA (`conContextoDeIA`, origen
 * `chat:<superficie>`: al agente del lugar, al cliente y a quien conversa) y con su `AgentRun` (`modo: chat-de-nexus`,
 * la conversación en `filters.conversacion`). Si la persona PREGUNTA algo de la cuenta, una segunda llamada lo responde
 * leyendo todo lo de esa cuenta (./respuesta.ts; `modo: chat-de-nexus-respuesta`, con caché de prompt y su propio tope
 * por día, porque lee mucho texto). De las corridas salen los topes: vueltas por conversación, vueltas por persona en el
 * día y preguntas por persona en el día (en Costa Rica). Lo que respondió el modelo, ya leído, queda en `output`: al
 * guardar, los hechos salen de ahí y no de lo que mande el navegador (`ultimoTurnoListo`). El `output` lleva también los
 * mensajes de la vuelta y, después, lo que pasó en la pantalla: de ahí `conversacionGuardada` arma la conversación al
 * volver (./guardada.ts), sin tabla nueva y sin crear corridas.
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
import { avisoDelTope, mensajeDelTope } from "@/lib/ai/tope-de-nexus";
import { topeDeNexusHoy } from "@/lib/ai/tope-de-nexus-server";
import { prisma } from "@/lib/db/prisma";
import {
  comoSeLee,
  leerElTurno,
  loQueConto,
  NO_SE_PUDO_LEER,
  pedidoDelTurno,
  porQueNoSigue,
  puedePreguntar,
  RESPUESTA_A_LA_CORTESIA,
  TOPES,
  type ContextoParaNexus,
  type MensajeDeLaConversacion,
  type ResultadoDelTurno,
} from "./conversacion";
import { estadosValidos, leerLaSalida, reconstruirLaConversacion, type AnotacionesDeLaVuelta, type ConversacionGuardada, type SalidaDeLaVuelta } from "./guardada";
import { leerLaRespuesta, pedidoDeLaRespuesta, PREGUNTAS_POR_DIA, type FuenteDeLaCuenta, type LoQueQuedoAfuera, type RespuestaDeNexus } from "./respuesta";

/** El modo de la corrida de una vuelta: lo que cuentan los topes y lo que busca `ultimoTurnoListo`. */
export const MODO_DEL_CHAT = "chat-de-nexus";
/** El modo de la corrida que responde una pregunta sobre la cuenta. */
export const MODO_DE_LA_RESPUESTA = "chat-de-nexus-respuesta";
/** En `filters.boton` de una vuelta: de qué botón salió. */
export const BOTON_ERA_UNA_PREGUNTA = "era-una-pregunta";
export const BOTON_GUARDARLO_COMO_NOTA = "guardarlo-como-nota";

export interface DondeConversa {
  /** El agente al que se le carga el gasto (el del módulo del lugar). */
  agentSlug: string;
  /** «preventa»: el lugar, para el origen del gasto y los filtros. */
  superficie: string;
  clientId: string;
  projectId: string | null;
  email: string;
  /** Lo que identifica el lugar en `filters` (la exploración). */
  filtros: Record<string, string>;
}

/** `aviso`: desde el 80 % del tope del mes de Nexus conversando (lib/ai/tope-de-nexus.ts). */
export type VueltaDeNexus = { ok: true; turno: ResultadoDelTurno; quedan: number; aviso?: string } | { ok: false; status: number; error: string };

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
  noSePudo: true,
  afuera,
});

const topeDePreguntas = () => `Hoy ya le hiciste ${PREGUNTAS_POR_DIA} preguntas a Nexus, el tope del día: cada una lee todo lo de la cuenta. Mañana sigues.`;

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
  /** «Guardarlo como nota» debajo de una respuesta: lo último se cuenta aunque tenga forma de pregunta. */
  contar?: boolean;
  /** «Era una pregunta» debajo de lo que iba a guardarse: lo último se responde. */
  preguntar?: boolean;
}): Promise<VueltaDeNexus> {
  const { contexto, mensajes, conversacion, donde } = o;
  // Lo seguro lo decide el código (`comoSeLee`); lo dudoso, el modelo con la conversación a la vista.
  const lectura = comoSeLee(mensajes, { contar: o.contar, preguntar: o.preguntar });
  const loUltimo = mensajes[mensajes.length - 1]?.texto.trim().slice(0, TOPES.largoDelMensaje) ?? "";
  const vueltas = await vueltasHastaAhora(donde.email, conversacion);
  // Un «gracias» o un «ok» solos: Nexus contesta corto, sin la IA, sin corrida y sin proponer guardar nada (22 nov).
  if (lectura === "cortesia") return { ok: true, turno: { tipo: "cortesia", texto: RESPUESTA_A_LA_CORTESIA }, quedan: Math.max(0, TOPES.turnosPorConversacion - vueltas.deLaConversacion) };
  const tope = porQueNoSigue(vueltas.deLaConversacion, vueltas.deHoy);
  if (tope) return { ok: false, status: 429, error: tope };
  // Una pregunta segura con el tope del día ya cumplido no deja corrida: si la dejara, al volver la conversación la
  // mostraría como pregunta sin responder y lo que iba a guardarse no volvería («¿Era una pregunta?»).
  if (lectura === "pregunta" && vueltas.preguntasDeHoy >= PREGUNTAS_POR_DIA) return { ok: false, status: 429, error: topeDePreguntas() };
  // El tope del mes de Nexus conversando (US$ 100, 22 nov): al llegar, no llama a la IA; desde el 80 %, avisa.
  const mes = await topeDeNexusHoy();
  if (mes.estado === "agotado") return { ok: false, status: 429, error: mensajeDelTope(mes) };
  const aviso = avisoDelTope(mes);
  const conAviso = aviso ? { aviso } : {};
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
      // `boton`: la vuelta salió de «¿Era una pregunta?» o de «Guardarlo como nota» (el conteo de «Uso de Nexus», 22 nov).
      filters: { modo: MODO_DEL_CHAT, superficie: donde.superficie, conversacion, ...donde.filtros, ...(o.preguntar ? { boton: BOTON_ERA_UNA_PREGUNTA } : o.contar ? { boton: BOTON_GUARDARLO_COMO_NOTA } : {}) } as Prisma.InputJsonValue,
      // Los mensajes de esta vuelta: de acá se reconstruye la conversación al volver (./guardada.ts).
      output: JSON.stringify({ mensajes }),
    },
    select: { id: true },
  });
  const ia = { agentSlug: donde.agentSlug, agentRunId: run.id, clientId: donde.clientId, projectId: donde.projectId, triggeredByEmail: donde.email, origen: `chat:${donde.superficie}` };
  let turno: ResultadoDelTurno;
  try {
    if (lectura === "pregunta") {
      // Una pregunta segura no pasa por el modelo que clasifica: se responde con las palabras de la persona.
      turno = { tipo: "consulta", pregunta: loUltimo };
    } else {
      const respuesta = await conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDelTurno(contexto, mensajes, lectura)));
      turno = leerElTurno(respuesta, {
        destinos: new Set(contexto.destinos.map((d) => d.clave)),
        valorValido: o.valorValido,
        loQueDijo: loQueConto(mensajes),
        puedePreguntar: puedePreguntar(mensajes),
        laPregunta: lectura === "duda" ? loUltimo : null,
      });
    }
    // `contado`: la persona eligió «Guardarlo como nota»; al volver, «¿Era una pregunta?» no reaparece.
    const salida: SalidaDeLaVuelta = { ...turno, mensajes, ...(o.contar && turno.tipo === "listo" ? { contado: true as const } : {}) };
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify(salida) } });
  } catch (e) {
    console.error("[chat-de-nexus] la IA no respondió", e);
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: e instanceof Error ? e.message : String(e), mensajes }) } })
      .catch(() => {});
    return { ok: true, turno: NO_SE_PUDO_LEER, quedan, ...conAviso };
  }

  if (turno.tipo === "consulta") {
    if (vueltas.preguntasDeHoy >= PREGUNTAS_POR_DIA) return { ok: false, status: 429, error: topeDePreguntas() };
    let respuesta: RespuestaDeNexus;
    try {
      respuesta = await responder({ pregunta: turno.pregunta, mensajes, conversacion, contexto, donde, leerLaCuenta: o.leerLaCuenta });
    } catch (e) {
      // Leer la cuenta falló (la base, el chokepoint): como si la IA no hubiera respondido.
      console.error("[chat-de-nexus] no se pudo leer la cuenta", e);
      respuesta = NO_SE_PUDO_RESPONDER({ reuniones: 0, ejemplos: [] });
    }
    if (respuesta.noSePudo && o.preguntar) {
      // «¿Era una pregunta?» sin respuesta: la vuelta no queda (ERROR), así lo que iba a guardarse vuelve igual, en la
      // pantalla y al recargar.
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR" } }).catch(() => {});
      return { ok: false, status: 502, error: "Nexus no pudo responder ahora. Lo que ibas a guardar sigue acá: vuelve a intentarlo en un rato." };
    }
    // La respuesta con sus citas queda en la vuelta: al volver, la conversación la muestra igual.
    await anotarLaVuelta(run.id, { respuesta });
    return { ok: true, turno: { tipo: "respuesta", respuesta }, quedan, ...conAviso };
  }
  return { ok: true, turno, quedan, ...conAviso };
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

// ── La conversación guardada (./guardada.ts) ────────────────────────────────────

/** Las vueltas de esta persona en este lugar: quién conversó, de qué cliente y los filtros del lugar (la exploración). */
function deLaPersonaEn(email: string, clientId: string, filtros: Record<string, string>, conversacion?: string): Prisma.AgentRunWhereInput {
  return {
    triggeredByEmail: email,
    clientId,
    AND: [conModo(MODO_DEL_CHAT), ...Object.entries(filtros).map(([k, v]) => ({ filters: { path: [k], equals: v } })), ...(conversacion ? [conversacionEn(conversacion)] : [])],
  };
}

/**
 * Suma anotaciones al `output` de una vuelta en UNA sentencia, sin leerlo antes: la revisión de la nota y un «Aplicar»
 * pueden llegar a la vez y ninguno pisa al otro. Los `estados` se mezclan con los que ya había. No lanza.
 */
export async function anotarLaVuelta(runId: string, a: AnotacionesDeLaVuelta): Promise<void> {
  const { estados, ...resto } = a;
  try {
    await prisma.$executeRaw`
      UPDATE "AgentRun"
      SET output = (
            COALESCE(output::jsonb, '{}'::jsonb) || ${JSON.stringify(resto)}::jsonb
            || jsonb_build_object('estados', COALESCE(output::jsonb -> 'estados', '{}'::jsonb) || ${JSON.stringify(estados ?? {})}::jsonb)
          )::text,
          "updatedAt" = now()
      WHERE id = ${runId}`;
  } catch (e) {
    console.error("[chat-de-nexus] no se pudo anotar la vuelta", runId, e instanceof Error ? e.message : e);
  }
}

/**
 * La última conversación de ESTA persona en ESTE lugar, reconstruida (./guardada.ts), o null: nunca habló, la cerró con
 * «Nueva conversación», o es de antes de que las vueltas guardaran sus mensajes. Filtra por quien conversó, por el
 * cliente y por el lugar: la de otra persona o la de otra preventa nunca vuelve. No crea corridas: no gasta los topes.
 */
export async function conversacionGuardada(email: string, clientId: string, filtros: Record<string, string>): Promise<ConversacionGuardada | null> {
  const ultima = await prisma.agentRun.findFirst({ where: { ...deLaPersonaEn(email, clientId, filtros), status: "DONE" }, orderBy: { createdAt: "desc" }, select: { filters: true } });
  const id = (ultima?.filters as { conversacion?: unknown } | null)?.conversacion;
  if (typeof id !== "string" || !id) return null;
  const deLaConversacion = deLaPersonaEn(email, clientId, filtros, id);
  const [vueltas, corridas] = await Promise.all([
    prisma.agentRun.findMany({ where: { ...deLaConversacion, status: "DONE" }, orderBy: { createdAt: "asc" }, take: TOPES.turnosPorConversacion * 2, select: { output: true } }),
    prisma.agentRun.count({ where: deLaConversacion }),
  ]);
  const salidas = vueltas.map((v) => leerLaSalida(v.output)).filter((s): s is SalidaDeLaVuelta => !!s);
  return reconstruirLaConversacion(id, salidas, corridas);
}

/** La última vuelta TERMINADA de esa conversación, de esta persona en este lugar. */
function ultimaVuelta(email: string, clientId: string, conversacion: string, filtros: Record<string, string>) {
  return prisma.agentRun.findFirst({
    where: { ...deLaPersonaEn(email, clientId, filtros, conversacion), status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, output: true },
  });
}

/**
 * Lo que la persona hizo con los cambios del «listo» («Aplicar», «No», «Aplicar todo») queda en esa vuelta. Solo ids de
 * cambios de esa vuelta. false si la conversación no terminó en un «listo» de esta persona en este lugar.
 */
export async function guardarLosEstados(email: string, clientId: string, conversacion: string, filtros: Record<string, string>, pedidos: Record<string, unknown>): Promise<boolean> {
  const v = await ultimaVuelta(email, clientId, conversacion, filtros);
  const s = leerLaSalida(v?.output);
  if (!v || !s || s.tipo !== "listo") return false;
  const estados = estadosValidos(s.cambios ?? [], pedidos);
  if (Object.keys(estados).length) await anotarLaVuelta(v.id, { estados });
  return true;
}

/** «Nueva conversación»: la última vuelta queda cerrada y, al volver, el cajón arranca vacío. Sin vueltas no hace nada. */
export async function cerrarLaConversacion(email: string, clientId: string, conversacion: string, filtros: Record<string, string>): Promise<void> {
  const v = await ultimaVuelta(email, clientId, conversacion, filtros);
  if (v) await anotarLaVuelta(v.id, { cerrada: true });
}
