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
 *
 * UN SOLO CONTEXTO (25 nov): un cambio a la página de La escala es una vuelta más (`pedirALaEscala`, la pone el lugar). La
 * propuesta queda en la vuelta con su texto (`escala`, `textoDeLaEscala`) y lo que la persona hace con cada cambio, en sus
 * `estados` (`guardarLosEstadosDeLaEscala`). Proponer no escribe nada; aplicar va por la ruta de la página de siempre.
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
  esAlgoQueSeCuenta,
  leerElTurno,
  laDijoLaPersona,
  loQueContoEnPedazos,
  loQueQuedaEnLaNota,
  NO_SE_PUDO_LEER,
  pedidoDelTurno,
  porQueNoSigue,
  primerasSinPartir,
  puedePreguntar,
  NADA_QUE_GUARDAR,
  RESPUESTA_A_LA_CORTESIA,
  TOPES,
  UNA_PREGUNTA_NO_ES_UNA_NOTA,
  type ContextoParaNexus,
  type MensajeDeLaConversacion,
  type ResultadoDelTurno,
} from "./conversacion";
import { estadosValidos, leerLaSalida, reconstruirLaConversacion, type AnotacionesDeLaVuelta, type ConversacionGuardada, type SalidaDeLaVuelta } from "./guardada";
import { estadosParaGuardar, leerLaEscalaGuardada, textoDeLaEscala, type EscalaEnLaConversacion } from "./escala-en-la-conversacion";
import {
  estadosDeLasListas,
  leerListaGuardada,
  listaParaLaPantalla,
  listaPendiente,
  ventanaParaLaCuenta,
  type ListaEnLaConversacion,
  type ListaGuardada,
  type OperacionDeLaLista,
} from "./lista";
import { leerLaRespuesta, pedidoDeLaRespuesta, PREGUNTAS_POR_DIA, type FuenteDeLaCuenta, type LoQueQuedoAfuera, type RespuestaDeNexus } from "./respuesta";
import { tomarHilo } from "@/lib/nexus-chat/candado-server";
import { ETIQUETAS_DEL_CHAT } from "@/lib/agents/corridas-del-chat";
import { sinMarcadores } from "@/lib/nexus-chat/textos";

/**
 * Una vuelta que el modelo leyó como un cambio a La escala y frenó su tope (25 nov): queda medida pero no cuenta como vuelta
 * de la conversación ni vuelve al recargar.
 */
export const MODO_DE_LA_VUELTA_FRENADA = "chat-de-nexus-frenada";

/** El modo de la corrida de una vuelta: lo que cuentan los topes y lo que busca `ultimoTurnoListo`. */
export const MODO_DEL_CHAT = "chat-de-nexus";
/** El modo de la corrida que responde una pregunta sobre la cuenta. */
export const MODO_DE_LA_RESPUESTA = "chat-de-nexus-respuesta";
/** En `filters.boton` de una vuelta: de qué botón salió. */
export const BOTON_ERA_UNA_PREGUNTA = "era-una-pregunta";
export const BOTON_GUARDARLO_COMO_NOTA = "guardarlo-como-nota";
/** «Hazlo» (24 nov, una sola conversación): lo último era un pedido de la cuenta. */
export const BOTON_ERA_UN_PEDIDO = "era-un-pedido";

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

/** Lo que devuelve la mano de la cuenta: lo que contestó y su lista, con las operaciones ya acotadas a la cuenta. */
export interface ListaPreparada {
  texto: string;
  operaciones: OperacionDeLaLista[];
  /** Un renglón por operación. */
  lineas: string[];
  arrastradas?: number[];
  descartadas?: string[];
  /** Soltó lo pendiente sin proponer otra cosa. */
  cierre?: true;
}

/**
 * LA MANO DE LA CUENTA (24 nov, una sola conversación): lo que el lugar hace con un pedido de la cuenta (una tarea, el
 * siguiente paso, la guía, un documento). En la preventa corre el turno del chat de la cuenta (lib/nexus-chat ›
 * `pensarConLaCuenta`) con esta conversación como historia, con el permiso de quien pide. No escribe nada de la cuenta:
 * devuelve la lista. `ok: false`: no se pudo o no se puede (sin acceso a la cuenta, el tope del día); la vuelta no queda.
 */
export type PedirALaCuenta = (p: {
  pedido: string;
  /** Esta conversación hasta antes del pedido, como la ve el modelo (./lista.ts › `ventanaParaLaCuenta`). */
  ventana: Array<{ rol: "user" | "assistant"; texto: string }>;
  /** Lo propuesto en esta conversación que no se aplicó (se arrastra o se suelta). */
  pendientes: Array<OperacionDeLaLista & { linea: string }>;
  /** La vuelta: a ella se cargan las llamadas de la mano. */
  agentRunId: string;
}) => Promise<{ ok: true; lista: ListaPreparada } | { ok: false; status: number; error: string }>;

/**
 * LA MANO DE LA ESCALA (25 nov, un solo contexto): lo que el lugar hace con un cambio a la página de La escala. En la
 * preventa, el contrato de la página (lib/exploraciones/escala-con-nexus-server.ts › `proponerEnLaEscala`), con lo hablado
 * antes en esta conversación. No escribe nada: devuelve la propuesta. `ok: false`: no se pudo (el tope de pedidos del día,
 * la página que cambió); la vuelta no queda y lo escrito vuelve a la caja.
 */
export type PedirALaEscala = (p: {
  pedido: string;
  /** La conversación con el pedido al final. */
  mensajes: MensajeDeLaConversacion[];
}) => Promise<{ ok: true; escala: Omit<EscalaEnLaConversacion, "id" | "estados"> } | { ok: false; status: number; error: string }>;

/**
 * El candado de una conversación: lo toman el pedido y «Aplicar», el mismo de la ficha (lib/nexus-chat/candado-server.ts,
 * en memoria: una sola instancia). Un «Aplicar» mientras la mano de la cuenta piensa no deja que esa mano vuelva a
 * proponer lo que se acaba de aplicar.
 */
const candadoDe = (email: string, conversacion: string) => `chat-de-nexus:${email.toLowerCase()}:${conversacion}`;
const OCUPADA = "Nexus está terminando algo en esta conversación: espera un momento y vuelve a intentarlo.";

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
      // El rótulo dice que es del chat: el feed de corridas no avisa de ella (lib/agents/corridas-del-chat.ts).
      stepLabel: ETIQUETAS_DEL_CHAT.respuesta,
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
  /** Lo último es un pedido de la cuenta: lo prepara la mano de la cuenta sin la llamada que clasifica. */
  pedir?: boolean;
  /** La mano de la cuenta del lugar (en la preventa, el chat de la cuenta). Sin ella, un pedido se responde como pregunta. */
  pedirALaCuenta?: PedirALaCuenta;
  /**
   * La mano de La escala del lugar (25 nov). Sin ella no hay cambios a la página: lo que lo parece se lee como antes. `escala`:
   * «chip», el chat se abrió desde «✨ Mejorar con IA» de La escala; «pagina», sin chip pero con la página para cambiar.
   */
  pedirALaEscala?: PedirALaEscala;
  escala?: "chip" | "pagina" | null;
  /**
   * Antes de gastar la vuelta en un cambio a La escala: el tope de pedidos del día y el largo (como `antesDePedir`). Si lo
   * decidió el modelo, la vuelta ya se creó: frenada, deja de contar como vuelta (su gasto queda medido).
   */
  antesDeCambiar?: (pedido: string) => Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  /**
   * «Guardarlo como nota» debajo de una lista de la cuenta (con `contar`): esa lista (su vuelta) ya no va. Queda «soltada»
   * antes de contar, así no se arrastra al pedido siguiente.
   */
  soltar?: string;
  /**
   * Antes de gastar la vuelta en un pedido seguro: lo que el lugar sabe sin la IA (el tope de dólares del día). Si no se
   * puede, responde sin crear corrida: un pedido frenado no se come una de las vueltas de la conversación ni del día.
   */
  antesDePedir?: () => Promise<{ ok: true } | { ok: false; status: number; error: string }>;
}): Promise<VueltaDeNexus> {
  const { contexto, mensajes, conversacion, donde } = o;
  // Lo seguro lo decide el código (`comoSeLee`); lo dudoso, el modelo con la conversación a la vista. Un lugar sin la mano
  // de la cuenta no tiene pedidos: lo que el código ve como pedido lo decide el modelo (contar o preguntar).
  // «Guardarlo como nota» con una pregunta, un pedido o un «gracias» (25 nov, TEC · AE): no se cuenta, ni se gasta una vuelta.
  if (o.contar && !esAlgoQueSeCuenta(mensajes[mensajes.length - 1]?.texto ?? "")) return { ok: false, status: 400, error: UNA_PREGUNTA_NO_ES_UNA_NOTA };
  const leida = comoSeLee(mensajes, { contar: o.contar, preguntar: o.preguntar, pedir: o.pedir, escala: o.pedirALaEscala ? o.escala : null });
  const lectura = leida === "pedido" && !o.pedirALaCuenta ? "duda" : leida;
  const loUltimo = primerasSinPartir(mensajes[mensajes.length - 1]?.texto.trim() ?? "", TOPES.largoDelMensaje);
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
  if (lectura === "pedido" && o.antesDePedir) {
    const r = await o.antesDePedir();
    if (!r.ok) return r;
  }
  // Un cambio seguro a La escala frenado por su tope del día no se come una vuelta (revisión del 25 nov).
  if (lectura === "cambio" && o.antesDeCambiar) {
    const r = await o.antesDeCambiar(loUltimo);
    if (!r.ok) return r;
  }

  const filtrosDeLaVuelta = { modo: MODO_DEL_CHAT, superficie: donde.superficie, conversacion, ...donde.filtros, ...(o.preguntar ? { boton: BOTON_ERA_UNA_PREGUNTA } : o.contar ? { boton: BOTON_GUARDARLO_COMO_NOTA } : o.pedir ? { boton: BOTON_ERA_UN_PEDIDO } : {}) };
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: donde.agentSlug,
      clientId: donde.clientId,
      projectId: donde.projectId,
      status: "RUNNING",
      stepLabel: ETIQUETAS_DEL_CHAT.vuelta,
      triggeredByEmail: donde.email,
      // `boton`: la vuelta salió de «¿Era una pregunta?» o de «Guardarlo como nota» (el conteo de «Uso de Nexus», 22 nov).
      filters: filtrosDeLaVuelta as Prisma.InputJsonValue,
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
    } else if (lectura === "pedido") {
      // Un pedido seguro de la cuenta tampoco: lo prepara la mano de la cuenta con las palabras de la persona.
      turno = { tipo: "pedido", pedido: loUltimo };
    } else if (lectura === "cambio") {
      // Un cambio a La escala tampoco (25 nov): lo propone la mano de La escala con las palabras de la persona.
      turno = { tipo: "cambio", pedido: loUltimo };
    } else {
      const respuesta = await conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDelTurno(contexto, mensajes, lectura, { desdeElBoton: !!o.contar })));
      turno = leerElTurno(respuesta, {
        destinos: new Set(contexto.destinos.map((d) => d.clave)),
        valorValido: o.valorValido,
        // Lo que queda en la nota que se guarda (25 nov: un mensaje va hasta 15.000 y la nota hasta 4.000).
        loQueDijo: loQueQuedaEnLaNota(mensajes),
        // Desde «Guardarlo como nota» no pregunta: ./conversacion.ts › pedidoDelTurno.
        puedePreguntar: !o.contar && puedePreguntar(mensajes),
        laPregunta: lectura === "duda" ? loUltimo : null,
      });
      // Un lugar sin la mano de la cuenta: lo que el modelo leyó como pedido se responde como pregunta.
      if (turno.tipo === "pedido" && !o.pedirALaCuenta) turno = { tipo: "consulta", pregunta: turno.pedido };
      // Lo mismo con un cambio a La escala sin su mano (o sin página que cambiar).
      if (turno.tipo === "cambio" && (!o.pedirALaEscala || !o.escala)) turno = { tipo: "consulta", pregunta: turno.pedido };
    }
    // «Guardarlo como nota» y Nexus no encontró nada del cliente en las palabras de la persona (ni un hecho cuya cita dijo
    // ella ni un cambio: los cambios ya salen con la cita revisada): era una pregunta o un pedido, y no hay nada que guardar
    // (25 nov, TEC · AE). Un hecho con una cita que la persona no escribió, o un cambio descartado por la cita, no cuenta
    // (tercera revisión: así volvía a quedar la pregunta como nota, sin hechos). La cita se busca también en pedazos de lo
    // que escribió («¿Unos 40?» → «Unos 40», «Usan SAP, ¿lo anoto?» → «Usan SAP»: cuarta revisión). La vuelta no queda:
    // al volver, no aparece un «Guardar» de una pregunta.
    const dijo = loQueContoEnPedazos(mensajes);
    if (o.contar && turno.tipo === "listo" && !turno.sinLeer && !turno.cambios.length && !turno.hechos.some((h) => laDijoLaPersona(h.cita, dijo))) {
      await prisma.agentRun
        .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ nadaQueGuardar: true, mensajes }) } })
        .catch(() => {});
      return { ok: false, status: 422, error: NADA_QUE_GUARDAR };
    }
    // El pedido (o el cambio) queda en la vuelta recién con su lista (o su propuesta, abajo): si la mano no puede, la vuelta
    // no queda.
    if (turno.tipo !== "pedido" && turno.tipo !== "cambio") {
      // `contado`: la persona eligió «Guardarlo como nota»; al volver, «¿Era una pregunta?» no reaparece.
      const salida: SalidaDeLaVuelta = { ...turno, mensajes, ...(o.contar && turno.tipo === "listo" ? { contado: true as const } : {}) };
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify(salida) } });
    }
  } catch (e) {
    console.error("[chat-de-nexus] la IA no respondió", e);
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: e instanceof Error ? e.message : String(e), mensajes }) } })
      .catch(() => {});
    return { ok: true, turno: NO_SE_PUDO_LEER, quedan, ...conAviso };
  }

  if (turno.tipo === "pedido" && o.pedirALaCuenta) {
    const r = await pedirEnLaVuelta({ runId: run.id, pedido: turno.pedido, mensajes, conversacion, donde, pedirALaCuenta: o.pedirALaCuenta });
    return r.ok ? { ok: true, turno: { tipo: "lista", lista: r.lista }, quedan, ...conAviso } : r;
  }
  if (turno.tipo === "cambio" && o.pedirALaEscala) {
    // Lo decidió el modelo (lo seguro ya se miró arriba): si el tope o el largo lo frenan, la vuelta deja de contar como
    // vuelta de la conversación (segunda revisión del 25 nov); su llamada queda medida igual.
    if (lectura !== "cambio" && o.antesDeCambiar) {
      const antes = await o.antesDeCambiar(turno.pedido);
      if (!antes.ok) {
        await prisma.agentRun
          .update({ where: { id: run.id }, data: { status: "ERROR", filters: { ...filtrosDeLaVuelta, modo: MODO_DE_LA_VUELTA_FRENADA } as Prisma.InputJsonValue, output: JSON.stringify({ error: antes.error, mensajes }) } })
          .catch(() => {});
        return antes;
      }
    }
    const r = await cambiarEnLaVuelta({ runId: run.id, pedido: turno.pedido, mensajes, pedirALaEscala: o.pedirALaEscala });
    return r.ok ? { ok: true, turno: { tipo: "escala", escala: r.escala }, quedan, ...conAviso } : r;
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
  // «Guardarlo como nota» debajo de una lista: recién con lo contado ya leído, esa lista deja de ir (si la IA falla, la
  // lista vuelve a la pantalla con su «Aplicar» y sigue viva en el servidor).
  if (turno.tipo === "listo" && !turno.sinLeer && o.contar && o.soltar) {
    const r = await soltarLaLista({ email: donde.email, clientId: donde.clientId, conversacion, filtros: donde.filtros, vuelta: o.soltar }).catch(() => null);
    if (!r?.ok) console.warn("[chat-de-nexus] no se pudo soltar la lista", o.soltar, r && !r.ok ? r.error : "");
  }
  return { ok: true, turno, quedan, ...conAviso };
}

/**
 * Un pedido de la cuenta en la vuelta `runId`: con el candado de la conversación, lee de la BASE las listas que dejó esta
 * conversación (lo pendiente y lo que se propuso, nunca lo que mande el navegador), le pasa la historia a la mano de la
 * cuenta y guarda lo que devolvió en la vuelta. Si la mano no puede o falla, la vuelta queda en ERROR (cuenta en el tope,
 * no vuelve al recargar) y lo escrito vuelve a la caja.
 */
async function pedirEnLaVuelta(o: {
  runId: string;
  pedido: string;
  mensajes: MensajeDeLaConversacion[];
  conversacion: string;
  donde: DondeConversa;
  pedirALaCuenta: PedirALaCuenta;
}): Promise<{ ok: true; lista: ListaEnLaConversacion } | { ok: false; status: number; error: string }> {
  const { donde, runId } = o;
  const fallar = async (status: number, error: string, detalle?: string) => {
    await prisma.agentRun
      .update({ where: { id: runId }, data: { status: "ERROR", output: JSON.stringify({ error: detalle ?? error, mensajes: o.mensajes }) } })
      .catch(() => {});
    return { ok: false as const, status, error };
  };
  const soltar = tomarHilo(candadoDe(donde.email, o.conversacion));
  if (!soltar) return fallar(409, OCUPADA);
  try {
    const previas = await listasDeLaConversacion(donde.email, donde.clientId, o.conversacion, donde.filtros);
    const r = await o.pedirALaCuenta({
      pedido: o.pedido,
      // Con el pedido, que va entero, dentro del tope de lo que viaja de la conversación (25 nov).
      ventana: ventanaParaLaCuenta(o.mensajes.slice(0, -1), previas, sinMarcadores, undefined, Math.max(0, TOPES.largoDeLaConversacion - o.pedido.length)),
      pendientes: listaPendiente(previas),
      agentRunId: runId,
    });
    if (!r.ok) return fallar(r.status, r.error);
    const p = r.lista;
    const conLineas = p.lineas.length === p.operaciones.length;
    const guardada: ListaGuardada = {
      lista: {
        id: runId,
        // Con el largo de un mensaje: vuelve del navegador como mensaje y se reconoce por su texto (./lista.ts).
        texto: (sinMarcadores(p.texto).trim() || "(Nexus no devolvió texto)").slice(0, TOPES.largoDelMensaje).trim(),
        lineas: conLineas ? p.lineas : [],
        ...(conLineas && p.arrastradas?.length ? { arrastradas: p.arrastradas } : {}),
        ...(p.descartadas?.length ? { descartadas: p.descartadas } : {}),
        ...(p.cierre ? { cierre: true as const } : {}),
      },
      operaciones: conLineas ? p.operaciones : [],
    };
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "DONE", output: JSON.stringify({ tipo: "lista", ...guardada, mensajes: o.mensajes }) } });
    return { ok: true, lista: listaParaLaPantalla(guardada, guardada.lista.lineas.length ? "viva" : "sin-cambios") };
  } catch (e) {
    console.error("[chat-de-nexus] la mano de la cuenta no respondió", e);
    return fallar(502, "Nexus no pudo preparar lo que pediste. Vuelve a intentarlo: no se cambió nada.", e instanceof Error ? e.message : String(e));
  } finally {
    soltar();
  }
}

/**
 * Un cambio a La escala en la vuelta `runId` (25 nov): la mano de La escala propone y la propuesta queda en la vuelta, con
 * el texto que la nombra en la conversación. Si la mano no puede o falla, la vuelta queda en ERROR (cuenta en el tope, no
 * vuelve al recargar) y lo escrito vuelve a la caja.
 */
async function cambiarEnLaVuelta(o: {
  runId: string;
  pedido: string;
  mensajes: MensajeDeLaConversacion[];
  pedirALaEscala: PedirALaEscala;
}): Promise<{ ok: true; escala: EscalaEnLaConversacion } | { ok: false; status: number; error: string }> {
  const fallar = async (status: number, error: string, detalle?: string) => {
    await prisma.agentRun
      .update({ where: { id: o.runId }, data: { status: "ERROR", output: JSON.stringify({ error: detalle ?? error, mensajes: o.mensajes }) } })
      .catch(() => {});
    return { ok: false as const, status, error };
  };
  try {
    const r = await o.pedirALaEscala({ pedido: o.pedido, mensajes: o.mensajes });
    if (!r.ok) return fallar(r.status, r.error);
    const escala: EscalaEnLaConversacion = { id: o.runId, ...r.escala, estados: {} };
    // Lo que queda en la vuelta: la propuesta (sin estados: se anotan aparte) y el texto que la nombra en la conversación.
    const guardada = { id: escala.id, lugar: escala.lugar, nombre: escala.nombre, foco: escala.foco, propuesta: escala.propuesta };
    await prisma.agentRun.update({
      where: { id: o.runId },
      data: { status: "DONE", output: JSON.stringify({ tipo: "escala", escala: guardada, textoDeLaEscala: textoDeLaEscala(escala), mensajes: o.mensajes }) },
    });
    return { ok: true, escala };
  } catch (e) {
    console.error("[chat-de-nexus] la mano de La escala no respondió", e);
    return fallar(502, "Nexus no pudo proponer el cambio. Vuelve a intentarlo: no se cambió nada.", e instanceof Error ? e.message : String(e));
  }
}

/** Las listas que dejó esta conversación de esta persona en este lugar, de la más vieja a la más nueva. */
async function listasDeLaConversacion(email: string, clientId: string, conversacion: string, filtros: Record<string, string>): Promise<ListaGuardada[]> {
  const vueltas = await prisma.agentRun.findMany({
    where: { ...deLaPersonaEn(email, clientId, filtros, conversacion), status: "DONE" },
    orderBy: { createdAt: "asc" },
    take: TOPES.turnosPorConversacion * 2,
    select: { output: true },
  });
  return vueltas.map((v) => leerListaGuardada(leerLaSalida(v.output))).filter((g): g is ListaGuardada => !!g);
}

export type AplicadoEnLaConversacion<R> = { ok: true; yaEstaba: boolean; resultado: R | null; lista: ListaEnLaConversacion } | { ok: false; status: number; error: string };

/**
 * La persona eligió «Guardarlo como nota» debajo de una lista viva: esa lista queda «soltada» (`soltada: true` en su
 * vuelta) y no se arrastra. Con el candado de la conversación; solo una lista de esta persona, este lugar y esta
 * conversación. Una aplicada no se suelta (409).
 */
async function soltarLaLista(o: { email: string; clientId: string; conversacion: string; filtros: Record<string, string>; vuelta: string }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const soltar = tomarHilo(candadoDe(o.email, o.conversacion));
  if (!soltar) return { ok: false, status: 409, error: OCUPADA };
  try {
    const listas = await listasDeLaConversacion(o.email, o.clientId, o.conversacion, o.filtros);
    const g = listas.find((x) => x.lista.id === o.vuelta);
    if (!g) return { ok: false, status: 404, error: "Esa lista no es de tu conversación en esta preventa." };
    const estado = estadosDeLasListas(listas).get(g.lista.id);
    if (estado === "aplicada") return { ok: false, status: 409, error: "Esa lista ya se aplicó: no se puede guardar como nota." };
    if (estado === "viva") await anotarLaVuelta(o.vuelta, { soltada: true });
    return { ok: true };
  } finally {
    soltar();
  }
}

/**
 * «Aplicar» una lista de la conversación (24 nov). `vuelta`: la que la dejó (la que la pantalla muestra). Con el candado de
 * la conversación, la lista se lee de la BASE (de esta persona, este lugar y esta conversación); tiene que ser la viva:
 * una que otra lista reemplazó no se aplica (409; la nueva ya la lleva), y una aplicada responde «ya estaba».
 * `aplicar` es del lugar (en la preventa, la capa de operaciones con el permiso de quien aplica: lib/nexus-chat ›
 * `aplicarCambiosALaCuenta`) y puede lanzar (con su estado). Lo que dejó queda en la vuelta (`desenlace`): con algo
 * aplicado, la lista se cierra.
 */
export async function aplicarLaListaDeLaConversacion<R extends { aplicadas: number; desenlace: string; renglones?: number[] }>(o: {
  email: string;
  clientId: string;
  conversacion: string;
  filtros: Record<string, string>;
  vuelta: string;
  aplicar: (operaciones: OperacionDeLaLista[]) => Promise<R>;
}): Promise<AplicadoEnLaConversacion<R>> {
  const soltar = tomarHilo(candadoDe(o.email, o.conversacion));
  if (!soltar) return { ok: false, status: 409, error: OCUPADA };
  try {
    const listas = await listasDeLaConversacion(o.email, o.clientId, o.conversacion, o.filtros);
    const g = listas.find((x) => x.lista.id === o.vuelta);
    if (!g) return { ok: false, status: 404, error: "Esa lista no es de tu conversación en esta preventa." };
    const estado = estadosDeLasListas(listas).get(g.lista.id);
    if (estado === "aplicada") return { ok: true, yaEstaba: true, resultado: null, lista: listaParaLaPantalla(g, "aplicada") };
    if (estado !== "viva") return { ok: false, status: 409, error: "Esa lista ya no está vigente: mira la más reciente." };
    const r = await o.aplicar(g.operaciones);
    const desenlace = { ok: r.aplicadas > 0, texto: r.desenlace, aplicadas: r.aplicadas, ...(r.renglones ? { renglones: r.renglones } : {}) };
    await anotarLaVuelta(o.vuelta, { desenlace });
    return { ok: true, yaEstaba: false, resultado: r, lista: listaParaLaPantalla({ ...g, desenlace }, desenlace.ok ? "aplicada" : "viva") };
  } finally {
    soltar();
  }
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

/**
 * Lo que la persona hizo con los cambios de una propuesta a La escala («Aplicar», «Descartar», «Deshacer») queda en su
 * vuelta `vuelta` (25 nov). Solo claves de esa propuesta; solo una vuelta de esta persona, en este lugar y en esta
 * conversación. false si no es una.
 */
export async function guardarLosEstadosDeLaEscala(
  email: string,
  clientId: string,
  conversacion: string,
  filtros: Record<string, string>,
  vuelta: string,
  pedidos: Record<string, unknown>,
): Promise<boolean> {
  const v = await prisma.agentRun.findFirst({ where: { id: vuelta, ...deLaPersonaEn(email, clientId, filtros, conversacion), status: "DONE" }, select: { id: true, output: true } });
  const e = leerLaEscalaGuardada(leerLaSalida(v?.output));
  if (!v || !e) return false;
  const estados = estadosParaGuardar(e.propuesta, pedidos);
  if (Object.keys(estados).length) await anotarLaVuelta(v.id, { estados });
  return true;
}

/** «Nueva conversación»: la última vuelta queda cerrada y, al volver, el cajón arranca vacío. Sin vueltas no hace nada. */
export async function cerrarLaConversacion(email: string, clientId: string, conversacion: string, filtros: Record<string, string>): Promise<void> {
  const v = await ultimaVuelta(email, clientId, conversacion, filtros);
  if (v) await anotarLaVuelta(v.id, { cerrada: true });
}
