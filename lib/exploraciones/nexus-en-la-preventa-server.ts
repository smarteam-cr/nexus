/**
 * lib/exploraciones/nexus-en-la-preventa-server.ts — «Hablar con Nexus» en la preventa (Elías, 21 nov). SERVIDOR.
 *
 * Las cuatro acciones del chat, para este lugar (las mismas que mañana usará un conector «afuera»):
 *   1. leer el contexto de la cuenta  — dos lecturas. Para conversar, `contextoParaNexus`: lo que el equipo ya contó,
 *      lo que aceptó el cliente, la página de La escala como la ve el cliente y lo que tiene hoy cada tarjeta, sin
 *      reuniones (es corto: va en cada vuelta). Para RESPONDER una pregunta, `fuentesDeLaCuenta`: lo mismo más las
 *      reuniones de la cuenta con su transcripción, por el chokepoint de sesiones (invariante 1:
 *      lib/exploraciones/fuentes.ts › `reunionesDeLaCuenta`, que usa `getClientSessions` de SU empresa).
 *   2. guardar lo que dijo una persona — la nota va a «Lo que sabes del cliente» por la operación `nota` de siempre (la
 *      guarda la pantalla, con quién y cuándo); `alGuardarLaNota` deja sus hechos (lib/seguimiento/hechos-server.ts).
 *   3. proponer un cambio a una tarjeta — `vueltaEnLaPreventa` (lib/chat-de-nexus/conversacion-server.ts); el valor se
 *      valida con el esquema de la tarjeta, y «Aplicar» es la operación `sumarACasilla` desde la pantalla.
 *   4. disparar el agente de impacto  — `alGuardarLaNota` corre `impactoDeLaNotaEnLaEscala` y devuelve el aviso con su
 *      cuenta regresiva. Nunca publica.
 * Solo la preventa: la exploración de un proyecto no tiene La escala de la empresa ni este panel todavía.
 *
 * UNA SOLA CONVERSACIÓN (Elías, 24 nov): lo que antes era otro chat (tareas, el siguiente paso, la guía de la próxima
 * sesión, generar un documento: el chat de la cuenta, lib/nexus-chat) es una mano más de ESTA conversación
 * (`manoDeLaCuenta`): un pedido de la cuenta corre el turno del chat de la cuenta con esta conversación como historia y sin
 * las notas de la cuenta (van a HubSpot; lo que se cuenta va a «Lo que sabes del cliente»). Pide lo mismo que pedía ese
 * chat: `asistente.read` y acceso a la empresa (lo decide la ruta: `QuienPideLaCuenta`). «Aplicar» es
 * `aplicarEnLaPreventa`: la lista se lee de la vuelta y se aplica por la capa de operaciones, con el permiso de cada una.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";
import {
  anotarLaVuelta,
  aplicarLaListaDeLaConversacion,
  cerrarLaConversacion,
  conversacionGuardada,
  correrUnaVuelta,
  guardarLosEstados,
  ultimoTurnoListo,
  type AplicadoEnLaConversacion,
  type PedirALaCuenta,
  type VueltaDeNexus,
} from "@/lib/chat-de-nexus/conversacion-server";
import { hablaDeLaGuia } from "@/lib/chat-de-nexus/lista";
import { aplicarCambiosALaCuenta, ErrorDelChat, type ResultadoDeAplicar } from "@/lib/nexus-chat/aplicar-server";
import { SLUG_DEL_CHAT_DE_NEXUS, TOPES_DEL_CHAT } from "@/lib/nexus-chat/constantes";
import { RESUMEN_DEL_CIERRE_DE_NEXUS } from "@/lib/nexus-chat/libro";
import { sinMarcadores } from "@/lib/nexus-chat/textos";
import { pensarConLaCuenta, type FocoDelChat } from "@/lib/nexus-chat/turno-server";
import { decidirElPedido } from "./nexus-en-la-preventa";
import { usoDeHoy } from "@/lib/nexus-chat/uso-server";
import { sinLasReuniones, type ConversacionGuardada } from "@/lib/chat-de-nexus/guardada";
import type { ContextoParaNexus, MensajeDeLaConversacion } from "@/lib/chat-de-nexus/conversacion";
import { armarLasFuentes, type FuenteDeLaCuenta, type LoQueQuedoAfuera } from "@/lib/chat-de-nexus/respuesta";
import { diaEnCostaRica } from "@/lib/impacto/respuesta-del-cliente";
import { bloqueDeLoAceptado } from "@/lib/impacto/respuesta-del-cliente";
import { escribirHechosDeUnaNota, retirarHechosDeNotasCambiadas, type ResultadoDeLosHechosDeLaNota } from "@/lib/seguimiento/hechos-server";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import type { EstadoDeExploracion } from "./contenido";
import { VALIDADOR_ESTRICTO } from "./esquemas";
import { estadoConElCliente } from "./hitos-de-la-escala-server";
import { impactoDeLaNotaEnLaEscala, laEscalaComoEntregable, type ImpactoEnLaEscala } from "./impacto-en-la-escala-server";
import { textoDeLasPiezas } from "./impacto-en-la-escala";
import { reunionesDeLaCuenta } from "./fuentes";
import { esClaveDeLoQueSabes, loQueSabeElEquipo } from "./lo-que-sabes";
import { destinosDeLaPreventa, esCasillaParaNexus } from "./nexus-en-la-preventa";
import { estadoDesdeFila, leerExploracion, type FilaDeExploracion } from "./servidor";

/** Cuántas notas del equipo y cuánto de cada una lee Nexus para conversar. */
const NOTAS_EN_EL_CONTEXTO = 8;
const LARGO_DE_CADA_NOTA = 400;
const LARGO_DE_LA_PAGINA = 2_000;

/** La acción 1: lo que Nexus lee para conversar en esta preventa. */
export async function contextoParaNexus(fila: FilaDeExploracion, estado: EstadoDeExploracion): Promise<ContextoParaNexus> {
  const [cliente, escala] = await Promise.all([estadoConElCliente(fila.id), laEscalaComoEntregable(fila.id)]);
  const notas = loQueSabeElEquipo(estado.contenido.notas)
    .slice(-NOTAS_EN_EL_CONTEXTO)
    .map((n) => `- ${n.texto.replace(/\s+/g, " ").slice(0, LARGO_DE_CADA_NOTA)}`);
  const aceptado = bloqueDeLoAceptado(cliente, "su escala");
  const pagina = escala.armado ? textoDeLasPiezas(escala.piezas).slice(0, LARGO_DE_LA_PAGINA) : "";
  const contexto = [
    notas.length ? `Lo que el equipo ya contó del cliente («Lo que sabes del cliente»):\n${notas.join("\n")}` : "",
    aceptado,
    pagina ? `La página de La escala, como la ve el cliente${escala.publicado ? " (publicada)" : " (sin publicar)"}:\n${pagina}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { donde: "la preventa", empresa: fila.client.name, contexto, destinos: destinosDeLaPreventa(estado.contenido) };
}

/**
 * Lo que lee Nexus para RESPONDER una pregunta sobre la cuenta: las notas del equipo (con quién las escribió), las
 * tarjetas, lo que aceptó el cliente y las reuniones de la cuenta con su transcripción, la más nueva primero, hasta el
 * tope (lo que no cabe queda afuera, avisado). Solo de esta empresa, y las reuniones solo si quien pregunta tiene acceso
 * a la cuenta (`conReuniones`): una preventa puede ser de una empresa que ya es cliente (una venta cruzada), y el permiso
 * de preventa no da acceso a sus reuniones (ARCHITECTURE §4.4). Sin acceso, responde con lo de la preventa y lo dice.
 */
export async function fuentesDeLaCuenta(fila: FilaDeExploracion, estado: EstadoDeExploracion, conReuniones: boolean): Promise<{ fuentes: FuenteDeLaCuenta[]; afuera: LoQueQuedoAfuera }> {
  const c = estado.contenido;
  const notas = loQueSabeElEquipo(c.notas);
  const correos = [...new Set(notas.map((n) => c.autoresDeLasNotas?.[n.clave]?.por).filter((x): x is string => !!x))];
  const [miembros, cliente, reuniones] = await Promise.all([
    correos.length ? prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } }) : Promise.resolve([]),
    estadoConElCliente(fila.id),
    conReuniones ? reunionesDeLaCuenta(fila.clientId, { fuera: c.fuera }) : Promise.resolve({ reuniones: [], yMas: false }),
  ]);
  const nombre = new Map(miembros.map((m) => [m.email.toLowerCase(), m.name?.trim() || m.email.split("@")[0]]));
  const delEquipo: FuenteDeLaCuenta[] = notas.map((n, i) => {
    const autor = c.autoresDeLasNotas?.[n.clave];
    return {
      clave: `N${i + 1}`,
      tipo: "nota",
      titulo: "Lo que sabe el equipo",
      fecha: autor?.en ? diaEnCostaRica(autor.en) : null,
      porQuien: autor?.por ? (nombre.get(autor.por.toLowerCase()) ?? autor.por.split("@")[0]) : "alguien",
      texto: n.texto,
    };
  });
  const tarjetas = destinosDeLaPreventa(c)
    .filter((d) => d.hoy.length)
    .map((d) => `${d.rotulo}:\n${d.hoy.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");
  if (tarjetas) delEquipo.push({ clave: "T", tipo: "tarjetas", titulo: "Las tarjetas de la arquitectura de la venta (lo confirmado en la preventa)", fecha: null, texto: tarjetas });
  const aceptado = bloqueDeLoAceptado(cliente, "su escala");
  if (aceptado) delEquipo.push({ clave: "A", tipo: "aceptado", titulo: "Lo que aceptó el cliente", fecha: null, texto: aceptado });
  const armadas = armarLasFuentes(delEquipo, reuniones.reuniones);
  return { fuentes: armadas.fuentes, afuera: { ...armadas.afuera, ...(reuniones.yMas ? { yMas: true as const } : {}), ...(conReuniones ? {} : { sinAcceso: true as const }) } };
}

/** El valor que propone el modelo, validado con el esquema de la tarjeta (el mismo del «Usar»). */
function valorValido(destino: string, valor: unknown): unknown {
  if (!esCasillaParaNexus(destino)) return null;
  return VALIDADOR_ESTRICTO.valorDelDestino({ tipo: "casilla", clave: destino }, valor);
}

type LaPreventa = { ok: true; fila: FilaDeExploracion; estado: EstadoDeExploracion } | { ok: false; status: number; error: string };

async function laPreventa(exploracionId: string): Promise<LaPreventa> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado === "sin-tablas") return { ok: false, status: 503, error: "Falta aplicar el SQL de las exploraciones." };
  if (lectura.estado !== "ok") return { ok: false, status: 404, error: "Esa preventa no existe." };
  const fila = lectura.fila;
  if (fila.projectId) return { ok: false, status: 400, error: "Por ahora Nexus conversa en la preventa, no en la exploración de un proyecto." };
  if (fila.archivadaEn) return { ok: false, status: 400, error: "La preventa está archivada: ya no se puede cambiar." };
  return { ok: true, fila, estado: estadoDesdeFila(fila) };
}

/**
 * Quién le pide a Nexus algo de la cuenta: la persona del equipo y si ve los montos de los negocios. Lo decide la ruta con
 * la regla del chat de la cuenta (lib/nexus-chat/http-server.ts › `quienPide`: `asistente.read` y acceso a la empresa);
 * null si no puede.
 */
export type QuienPideLaCuenta = (clientId: string) => Promise<{ persona: TeamMember; veMontos: boolean } | null>;

/** El origen del gasto de un pedido de la cuenta: empieza por «chat:», así entra al tope de US$ 100 de Nexus conversando. */
export const ORIGEN_DEL_PEDIDO = "chat:preventa:cuenta";
const SIN_LA_CUENTA =
  "Para pedirle a Nexus tareas, el siguiente paso o cambios a la guía necesitas acceso a esta cuenta. Lo que cuentas o preguntas de la preventa sigue igual.";

/**
 * La mano de la cuenta en la preventa: el turno del chat de la cuenta (`pensarConLaCuenta`) con esta conversación como
 * historia, sin las notas de la cuenta, con la guía a la vista si el pedido habla de ella (o se abrió desde la guía). Pide
 * el permiso del chat de la cuenta y respeta su tope de dólares por persona y día (el gasto va a su agente, «nexus-chat»,
 * y entra al tope del mes por su origen). No escribe nada.
 */
/** El tope de dólares del día de quien pide, leído de la base (lo que no se puede leer, no se gasta). */
async function topeDeHoy(email: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return decidirElPedido(await usoDeHoy(email.toLowerCase()).catch(() => null), TOPES_DEL_CHAT.usdPorDia);
}

function manoDeLaCuenta(fila: FilaDeExploracion, email: string, quien: { persona: TeamMember; veMontos: boolean }, lugar?: "guia"): PedirALaCuenta {
  return async ({ pedido, ventana, pendientes, agentRunId }) => {
    const correo = email.toLowerCase();
    // El tope del día, otra vez: un pedido que decidió el modelo no pasó por `antesDePedir`.
    const tope = await topeDeHoy(correo);
    if (!tope.ok) return tope;
    const foco: FocoDelChat = { tipo: lugar === "guia" || hablaDeLaGuia(pedido) ? "guia" : "preventa", exploracionId: fila.id, sinNotasDeLaCuenta: true };
    try {
      const t = await pensarConLaCuenta({
        ventana,
        pendientes,
        mensaje: sinMarcadores(pedido).trim(),
        quien: { persona: quien.persona, clientId: fila.clientId, veMontos: quien.veMontos },
        ahora: new Date(),
        foco,
        agentRunId,
        medidor: { agentSlug: SLUG_DEL_CHAT_DE_NEXUS, origen: ORIGEN_DEL_PEDIDO, triggeredByEmail: correo },
      });
      const a = t.acuerdo;
      const operaciones = (a?.operaciones ?? []) as Array<{ nombre: string; entrada: unknown }>;
      return {
        ok: true,
        lista: {
          texto: t.respuesta,
          operaciones,
          lineas: a?.lineas ?? [],
          ...(a?.arrastradas?.length ? { arrastradas: a.arrastradas } : {}),
          ...(a?.descartadas?.length ? { descartadas: a.descartadas } : {}),
          ...(a && !operaciones.length && a.resumen === RESUMEN_DEL_CIERRE_DE_NEXUS ? { cierre: true as const } : {}),
        },
      };
    } catch (e) {
      if (e instanceof ErrorDelChat) return { ok: false, status: e.status, error: e.message };
      if (e instanceof PresupuestoDeIaAgotado) return { ok: false, status: 429, error: "Nexus ya usó el presupuesto de IA de hoy. Mañana sigues." };
      throw e;
    }
  };
}

/**
 * La acción 3: una vuelta de la conversación (preguntar, responder, decir adónde va cada cosa o, desde el 24 nov, preparar
 * un pedido de la cuenta). `puedeVerLaCuenta`: si quien conversa tiene acceso a la empresa (la ruta lo pregunta con
 * `guardAccessToClient`); sin él, una pregunta se responde sin leer sus reuniones. `quienPideLaCuenta`: quién puede pedir
 * algo de la cuenta (sin él, no hay pedidos: lo decide el modelo entre contar y preguntar). `pedir`: lo último es un
 * pedido de la cuenta. `lugar`: «guia» si el cajón se abrió desde la guía. `soltar` (con `contar`): la lista que la persona
 * eligió guardar como nota ya no va.
 */
export async function vueltaEnLaPreventa(
  exploracionId: string,
  conversacion: string,
  mensajes: MensajeDeLaConversacion[],
  email: string,
  puedeVerLaCuenta: (clientId: string) => Promise<boolean>,
  o: { contar?: boolean; preguntar?: boolean; pedir?: boolean; lugar?: "guia"; soltar?: string; quienPideLaCuenta?: QuienPideLaCuenta } = {},
): Promise<VueltaDeNexus> {
  const p = await laPreventa(exploracionId);
  if (!p.ok) return p;
  // Quién puede pedir lo de la cuenta, una vez por vuelta. Sin ese permiso no hay mano de la cuenta: lo que parece un
  // pedido se lee como antes (contar o preguntar), y no choca siempre con «sin acceso» (revisión del 24 nov).
  const quien = o.quienPideLaCuenta ? await o.quienPideLaCuenta(p.fila.clientId).catch(() => null) : null;
  const contexto = await contextoParaNexus(p.fila, p.estado);
  return correrUnaVuelta({
    contexto,
    mensajes,
    conversacion,
    contar: o.contar,
    preguntar: o.preguntar,
    pedir: o.pedir,
    soltar: o.soltar,
    valorValido,
    leerLaCuenta: async () => fuentesDeLaCuenta(p.fila, p.estado, await puedeVerLaCuenta(p.fila.clientId).catch(() => false)),
    ...(quien ? { pedirALaCuenta: manoDeLaCuenta(p.fila, email, quien, o.lugar), antesDePedir: () => topeDeHoy(email) } : {}),
    donde: { agentSlug: AGENTE_DE_LA_EXPLORACION, superficie: "preventa", clientId: p.fila.clientId, projectId: null, email, filtros: filtrosDe(exploracionId) },
  });
}

/**
 * «Aplicar» la lista `vuelta` de una conversación en esta preventa (24 nov). La lista sale de la vuelta de esta persona en
 * esta preventa (nunca del navegador); cada cambio se vuelve a preparar contra hoy, acotado a la cuenta y con el permiso
 * de quien aplica, y se aplica por el escritor de su módulo (lib/nexus-chat/aplicar-server.ts › `aplicarCambiosALaCuenta`).
 * Una tarea lleva la clave de la vuelta y su lugar: aplicar dos veces no la duplica.
 */
export async function aplicarEnLaPreventa(
  exploracionId: string,
  conversacion: string,
  vuelta: string,
  desmarcadas: readonly number[],
  email: string,
  quienPide: QuienPideLaCuenta,
): Promise<AplicadoEnLaConversacion<ResultadoDeAplicar>> {
  const p = await laPreventa(exploracionId);
  if (!p.ok) return p;
  const quien = await quienPide(p.fila.clientId).catch(() => null);
  if (!quien) return { ok: false, status: 403, error: SIN_LA_CUENTA };
  try {
    return await aplicarLaListaDeLaConversacion({
      email,
      clientId: p.fila.clientId,
      conversacion,
      filtros: filtrosDe(exploracionId),
      vuelta,
      aplicar: (cambios) =>
        aplicarCambiosALaCuenta({
          persona: quien.persona,
          veMontos: quien.veMontos,
          clientId: p.fila.clientId,
          cambios,
          desmarcadas,
          claveDeLaTarea: (k) => `p:${vuelta}:${k}`,
          sinNotasDeLaCuenta: true,
        }),
    });
  } catch (e) {
    if (e instanceof ErrorDelChat) return { ok: false, status: e.status, error: e.message };
    throw e;
  }
}

export type GuardadoEnLaPreventa =
  /** «la-nota-cambio»: la editaron o la quitaron mientras se revisaba; sus hechos no se escriben. */
  | { ok: true; hechos: ResultadoDeLosHechosDeLaNota | { estado: "sin-conversacion" | "la-nota-cambio" }; impacto: ImpactoEnLaEscala }
  | { ok: false; status: number; error: string };

/**
 * Las acciones 2 (los hechos de la nota) y 4 (el agente de impacto), después de que la pantalla guardó la nota `clave`.
 * La nota se lee de la fila (lo guardado, no lo que mande el navegador) y los hechos salen del último «listo» de esta
 * conversación que dejó el servidor. Una nota que no escribió quien llama no deja hechos a su nombre.
 */
export async function alGuardarLaNota(exploracionId: string, conversacion: string, clave: string, email: string): Promise<GuardadoEnLaPreventa> {
  if (!esClaveDeLoQueSabes(clave)) return { ok: false, status: 400, error: "Esa nota no es de «Lo que sabes del cliente»." };
  const p = await laPreventa(exploracionId);
  if (!p.ok) return p;
  const texto = (p.estado.contenido.notas[clave] ?? "").trim();
  const autor = p.estado.contenido.autoresDeLasNotas?.[clave];
  if (!texto || !autor?.por) return { ok: false, status: 409, error: "La nota todavía no está guardada." };

  const [listo, impacto] = await Promise.all([
    ultimoTurnoListo(email, conversacion, { exploracion: exploracionId }),
    impactoDeLaNotaEnLaEscala(exploracionId, clave, email),
  ]);
  const suya = autor.por.toLowerCase() === email.toLowerCase();
  // Mientras corría el impacto, la nota se pudo editar o quitar en «Lo que sabes del cliente» (22 nov): sus hechos
  // saldrían del texto viejo. Se relee antes de escribir y otra vez después (por si cambió en el medio): lo que la nota
  // ya no dice se retira como al editarla.
  const textoDeAhora = async () => {
    const a = await laPreventa(exploracionId);
    return a.ok ? (a.estado.contenido.notas[clave] ?? "").trim() : "";
  };
  let hechos: Extract<GuardadoEnLaPreventa, { ok: true }>["hechos"];
  if (!listo || !suya) hechos = { estado: "sin-conversacion" };
  else if ((await textoDeAhora()) !== texto) hechos = { estado: "la-nota-cambio" };
  else {
    hechos = await escribirHechosDeUnaNota({ exploracionId, clientId: p.fila.clientId, notaClave: clave, texto, dichoPorEmail: autor.por, crudos: listo.turno.hechos, agentRunId: listo.agentRunId });
    const despues = await textoDeAhora();
    if (despues !== texto) await retirarHechosDeNotasCambiadas({ exploracionId, clientId: p.fila.clientId, antes: { [clave]: texto }, despues: despues ? { [clave]: despues } : {} });
  }
  // La vuelta que dejó el «listo» recuerda su nota y lo que dijo la revisión: al volver, el cajón lo muestra igual.
  if (listo && suya) await anotarLaVuelta(listo.agentRunId, { notaClave: clave, guardado: { hechos, impacto } });
  return { ok: true, hechos, impacto };
}

/** Los filtros de una conversación en esta preventa: con ellos, una conversación nunca cruza de preventa. */
const filtrosDe = (exploracionId: string) => ({ exploracion: exploracionId });

type Hecho = { ok: true } | { ok: false; status: number; error: string };

/**
 * La última conversación de quien mira en ESTA preventa (lib/chat-de-nexus/guardada.ts), para que el cajón la muestre al
 * volver. Solo la suya y solo de esta preventa: el cliente sale de la fila, no del navegador. null si no hay.
 * `puedeVerLaCuenta`: como al preguntar (`vueltaEnLaPreventa`), las respuestas que leyeron las reuniones de la cuenta
 * vuelven solo si quien mira HOY tiene acceso a la empresa; si no, en su lugar va un aviso (`sinLasReuniones`).
 */
export async function conversacionEnLaPreventa(exploracionId: string, email: string, puedeVerLaCuenta: (clientId: string) => Promise<boolean>): Promise<ConversacionGuardada | null> {
  const p = await laPreventa(exploracionId);
  if (!p.ok) return null;
  const c = await conversacionGuardada(email, p.fila.clientId, filtrosDe(exploracionId));
  if (!c) return null;
  return (await puedeVerLaCuenta(p.fila.clientId).catch(() => false)) ? c : sinLasReuniones(c);
}

/** Lo que la persona hizo con los cambios de su conversación («Aplicar», «No», «Aplicar todo»). */
export async function estadosEnLaPreventa(exploracionId: string, conversacion: string, email: string, estados: Record<string, unknown>): Promise<Hecho> {
  const p = await laPreventa(exploracionId);
  if (!p.ok) return p;
  const ok = await guardarLosEstados(email, p.fila.clientId, conversacion, filtrosDe(exploracionId), estados);
  return ok ? { ok: true } : { ok: false, status: 404, error: "Esa conversación no terminó en cambios tuyos en esta preventa." };
}

/** «Nueva conversación»: la de ahora queda cerrada para quien la tuvo, y al volver el cajón arranca vacío. */
export async function cerrarEnLaPreventa(exploracionId: string, conversacion: string, email: string): Promise<Hecho> {
  const p = await laPreventa(exploracionId);
  if (!p.ok) return p;
  await cerrarLaConversacion(email, p.fila.clientId, conversacion, filtrosDe(exploracionId));
  return { ok: true };
}
