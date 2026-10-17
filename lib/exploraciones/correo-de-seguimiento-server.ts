import "server-only";

/**
 * lib/exploraciones/correo-de-seguimiento-server.ts — arma el correo de seguimiento de UNA reunión de la
 * exploración (Elías, 2026-10-07) y lo guarda en `propuesta.correos`. SERVIDOR.
 *
 * Se arma a pedido, con el botón de la pestaña «Análisis» de la sesión: nunca solo, y nunca se manda.
 * La reunión sale por el chokepoint (`getClientSessions`): una que no es de la empresa no se lee. Lo que
 * va al agente de la exploración lo decide `insumosDelCorreo` (sin lo interno); la reunión entera va
 * porque de ahí salen la minuta y lo que entendimos.
 */
import { Prisma } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA, type ContextoDeCorrida } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { claveDeLaReunion, MAX_CORREOS, type CorreoDeSeguimiento } from "./contenido";
import { nombresDelEquipo } from "./agente";
import { avisoDeVoseo } from "./guia-pedido";
import { documentosParaLeer } from "./documentos";
import { hoyEnCostaRica } from "./fechas";
import { leerActividad, leerContactos } from "./hubspot";
import { leerLoLeido } from "./lo-leido";
import { leerPropuesta } from "./esquemas";
import { bloquearFila, estadoDesdeFila, leerExploracion } from "./servidor";
import { etiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { memoriaDeLaCuenta } from "@/lib/memoria";
import {
  componerElCorreo,
  compromisosDeLaLectura,
  insumosDelCorreo,
  minutaParaElCorreo,
  paraDeLaReunion,
  recortarLaReunion,
  voseoEnElCorreo,
  type CompromisoDelCorreo,
  type InsumosDelCorreo,
  type PartesDelCorreo,
} from "./correo-de-seguimiento";
import { leerElCorreo, NOMBRE_DE_LA_HERRAMIENTA_DEL_CORREO, pedidoDelCorreo, type ContextoDelCorreo } from "./correo-de-seguimiento-pedido";

/** Lo que se le dice a quien lo pidió cuando la reunión no tiene la conversación. */
export const SIN_CONVERSACION =
  "Esta reunión no tiene la conversación (solo la invitación): no hay de dónde sacar lo que entendimos ni lo que se acordó. Si tienes la grabación o una minuta, súmala con «sumar la minuta» en esta sesión, o en Fuentes manuales de Exploración, y vuelve a armarlo.";

/** El agente en el medidor de costos y en las corridas: aparte del de la exploración, que la pantalla sigue. */
export const AGENTE_DEL_CORREO = "exploracion-correo-de-seguimiento";

export type OrigenDeLaReunion = "meet" | "hubspot" | "documento";

export type ResultadoDelCorreo = { ok: true; correo: CorreoDeSeguimiento; clave: string } | { ok: false; status: number; error: string };

interface LaReunion {
  titulo: string;
  fecha: string | null;
  texto: string;
  participantes: string[];
  /** Solo estuvo gente de Smarteam: no hay correo que mandarle al cliente. */
  puertasAdentro?: boolean;
  /**
   * Lo que dejó la reunión (memoria de la cuenta, etapa 3): los acuerdos y las decisiones de su minuta y los compromisos
   * de su lectura de seguimiento, sin la cita. Solo de una reunión de Meet que fue CON EL CLIENTE.
   */
  deLaReunion?: { minuta: InsumosDelCorreo["minuta"]; compromisos: CompromisoDelCorreo[] };
}

/** El agente que deja la lectura de seguimiento de una reunión (lib/sessions/post-process.ts). */
const AGENTE_DE_LA_LECTURA = "agent-post-session";

/**
 * Lo que dejó una reunión de Meet: su minuta (acuerdos y decisiones) y los compromisos que guardó la última lectura de
 * seguimiento que terminó bien. ⛔ Nunca Tareas: las propuestas de Tarea que salieron de la lectura no se leen acá.
 */
export async function loQueDejoLaReunion(sessionId: string): Promise<NonNullable<LaReunion["deLaReunion"]>> {
  const [minuta, lectura] = await Promise.all([
    prisma.sessionMinute.findUnique({ where: { sessionId }, select: { agreements: true, decisions: true } }).catch(() => null),
    prisma.agentRun
      .findFirst({
        where: { agentId: AGENTE_DE_LA_LECTURA, status: "DONE", sourceSessionIds: { has: sessionId } },
        orderBy: { createdAt: "desc" },
        select: { output: true },
      })
      .catch(() => null),
  ]);
  return { minuta: minutaParaElCorreo(minuta), compromisos: compromisosDeLaLectura(lectura?.output ?? null) };
}

/** La reunión, de donde venga. null = no es de esta exploración (o no existe). */
async function leerLaReunion(
  fila: { id: string; clientId: string; projectId: string | null; client: { hubspotCompanyId: string | null } },
  reunion: { origen: OrigenDeLaReunion; id: string },
): Promise<LaReunion | null> {
  if (reunion.origen === "meet") {
    // El chokepoint: solo una reunión de la empresa, y que ya ocurrió.
    const [s] = await getClientSessions(fila.clientId, { ids: [reunion.id] });
    if (!s) return null;
    const [notas, fila2, categorias] = await Promise.all([
      fetchTranscriptContent(s.id, s.title, { maxChars: 14_000 }),
      prisma.firefliesSession.findUnique({ where: { id: s.id }, select: { transcript: true } }),
      prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }).catch(() => []),
    ]);
    const dominios = buildInternalDomainsSet(categorias);
    // La minuta y los compromisos, solo de una reunión CON EL CLIENTE (sin participantes no se sabe: no van).
    const conElCliente = etiquetaDeSala({ participants: s.participants }, dominios) === "CON EL CLIENTE";
    return {
      titulo: s.title,
      fecha: new Date(s.date).toISOString(),
      texto: recortarLaReunion(notas ?? "", fila2?.transcript ?? ""),
      participantes: s.participants,
      puertasAdentro: esReunionDePuertasAdentro({ participants: s.participants }, dominios),
      ...(conElCliente ? { deLaReunion: await loQueDejoLaReunion(s.id) } : {}),
    };
  }
  if (reunion.origen === "documento") {
    const [d] = await documentosParaLeer(fila.id, { soloEste: reunion.id, cuantos: 1 });
    if (!d) return null;
    return { titulo: d.titulo, fecha: d.fecha ?? d.createdAt.toISOString(), texto: recortarLaReunion("", d.texto), participantes: [] };
  }
  // HubSpot: solo la preventa (en un proyecto, la exploración no lee HubSpot).
  const companyId = fila.projectId ? null : fila.client.hubspotCompanyId;
  if (!companyId) return null;
  // Si HubSpot no contesta, se arma con lo que el agente ya leyó de ella (abajo).
  const actividad = await leerContactos(companyId)
    .then((contactos) => leerActividad(companyId, contactos, new Date(), { transcripciones: 15 }))
    .catch(() => null);
  const a = actividad?.material.find((x) => x.id === reunion.id && x.tipo === "MEETING");
  if (!a) return null;
  return { titulo: a.titulo || "Reunión", fecha: a.ts ? new Date(a.ts).toISOString() : null, texto: recortarLaReunion(a.texto, ""), participantes: [] };
}

/** Lo que escribió el agente: las partes, el correo armado y lo que devolvió la herramienta (por si el pedido sumó algo). */
export type CorreoEscrito =
  | { partes: PartesDelCorreo; armado: { asunto: string; cuerpo: string }; entrada: Record<string, unknown> | null }
  | "sin-conversacion";

/** Lo que devolvió la herramienta del correo, tal cual (null si no la llamó). */
function entradaDeLaHerramienta(respuesta: Anthropic.Messages.Message): Record<string, unknown> | null {
  const b = respuesta.content.find((x) => x.type === "tool_use" && x.name === NOMBRE_DE_LA_HERRAMIENTA_DEL_CORREO);
  return b && b.type === "tool_use" && b.input && typeof b.input === "object" && !Array.isArray(b.input) ? (b.input as Record<string, unknown>) : null;
}

/**
 * Le pide el correo al agente y lo arma con `componerElCorreo`. El correo lo lee el cliente: tiene que estar en tuteo, y
 * si salió en voseo (las fuentes lo están) se pide una vez más avisándolo, como la guía. Lanza si el agente no lo
 * devolvió completo. Lo usan la exploración (`armarCorreoDeSeguimiento`) y la página de una reunión (ficha G,
 * lib/seguimiento/reunion/correo-server.ts): un solo lugar decide cómo se escribe el correo.
 */
export async function escribirElCorreoDeSeguimiento(ctx: ContextoDelCorreo, firma: string | null, ia: ContextoDeCorrida): Promise<CorreoEscrito> {
  const pedir = (aviso = "") => conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDelCorreo(ctx, aviso)));
  let respuesta = await pedir();
  let partes = leerElCorreo(respuesta, ctx);
  if (!partes) throw new Error("El agente no devolvió el correo completo. Vuelve a intentarlo.");
  // Sin la conversación (la reunión solo trae la invitación) no hay correo: uno armado con nada no se manda.
  if (partes === "sin-conversacion") return partes;
  let armado = componerElCorreo(partes, firma);
  const voseo = voseoEnElCorreo(`${armado.asunto}\n${armado.cuerpo}`);
  if (voseo.length) {
    const otraRespuesta = await pedir(avisoDeVoseo(voseo));
    const otra = leerElCorreo(otraRespuesta, ctx);
    const otroArmado = otra && otra !== "sin-conversacion" ? componerElCorreo(otra, firma) : null;
    if (otra && otra !== "sin-conversacion" && otroArmado && voseoEnElCorreo(`${otroArmado.asunto}\n${otroArmado.cuerpo}`).length < voseo.length) {
      partes = otra;
      armado = otroArmado;
      respuesta = otraRespuesta;
    }
  }
  return { partes, armado, entrada: entradaDeLaHerramienta(respuesta) };
}

export async function nombreDe(email: string | null): Promise<string | null> {
  if (!email) return null;
  const m = await prisma.teamMember.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { name: true } }).catch(() => null);
  return m?.name?.trim() || null;
}

export async function armarCorreoDeSeguimiento(o: {
  exploracionId: string;
  reunion: { origen: OrigenDeLaReunion; id: string };
  /** La sesión de la reunión (sus respuestas anotadas y lo que se llevó a la próxima). */
  sesionId: string | null;
  email: string | null;
}): Promise<ResultadoDelCorreo> {
  const lectura = await leerExploracion(o.exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  const fila = lectura.fila;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada." };
  const estado = estadoDesdeFila(fila);
  const sesionId = o.sesionId && estado.contenido.sesiones.some((s) => s.id === o.sesionId) ? o.sesionId : null;
  const clave = claveDeLaReunion(o.reunion);
  const leida = estado.propuesta.lecturas[clave] ?? null;

  /* Una reunión de HubSpot que el agente ya leyó es de esta exploración aunque HubSpot ya no la devuelva
     (la actividad trae las últimas): se arma con lo que se leyó de ella. */
  const reunion =
    (await leerLaReunion(fila, o.reunion)) ??
    (o.reunion.origen === "hubspot" && leida ? { titulo: leida.titulo ?? "Reunión", fecha: leida.fecha ?? null, texto: "", participantes: [] } : null);
  if (!reunion) return { ok: false, status: 404, error: "Esa reunión no es de esta exploración." };
  // Lo dicho entre el equipo no se le escribe al cliente (invariante de la frontera: nada de puertas adentro).
  if (reunion.puertasAdentro) return { ok: false, status: 409, error: "Esta reunión fue solo con gente de Smarteam: no hay un correo que mandarle al cliente." };
  if (!reunion.texto.trim() && !leida) return { ok: false, status: 409, error: "Esta reunión no tiene qué leer: no hay de dónde armar el correo." };

  const hoy = hoyEnCostaRica();
  /* Lo que Nexus ya sabe de la cuenta (lib/memoria, etapa 3), con el alcance del CLIENTE: el correo lo lee el cliente.
     Para no repreguntar; el pedido lo rotula «no lo cites como algo acordado en esta reunión». */
  const cuenta = (await memoriaDeLaCuenta(fila.clientId, { lector: "correo", projectId: fila.projectId }).catch(() => null))?.texto ?? "";
  const insumos = insumosDelCorreo(estado, {
    lectura: leida,
    sesionId,
    hoy,
    agenda: leerLoLeido(fila.test).agenda,
    deLaReunion: reunion.deLaReunion,
    cuenta,
  });
  const para = paraDeLaReunion(reunion.participantes);
  const [firma, equipo] = await Promise.all([nombreDe(o.email), nombresDelEquipo()]);
  const ctx: ContextoDelCorreo = {
    marco: fila.projectId ? "cs" : "venta",
    empresa: fila.client.name,
    reunion: { titulo: reunion.titulo, fecha: reunion.fecha },
    firma,
    equipo,
    para,
    hoy,
    insumos,
    reunionTexto: reunion.texto,
  };

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DEL_CORREO,
      clientId: fila.clientId,
      projectId: fila.projectId,
      status: "RUNNING",
      stepLabel: "Exploración: correo de seguimiento",
      currentPhase: "Escribiendo el correo…",
      triggeredByEmail: o.email,
      sourceSessionIds: o.reunion.origen === "meet" ? [o.reunion.id] : [],
      filters: { exploracionId: fila.id, reunion: clave } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  try {
    const escrito = await escribirElCorreoDeSeguimiento(ctx, firma, {
      agentSlug: AGENTE_DEL_CORREO,
      agentRunId: run.id,
      clientId: fila.clientId,
      projectId: fila.projectId,
      triggeredByEmail: o.email,
      origen: "exploraciones/correo",
    });
    /* Sin la conversación (la reunión solo trae la invitación) no hay correo: uno armado con nada
       terminaba diciéndole al cliente que no teníamos notas de la reunión. El que hubiera se borra. */
    if (escrito === "sin-conversacion") {
      await guardarCorreo(fila.id, clave, null);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", currentPhase: null, output: JSON.stringify({ sinConversacion: true }) } });
      return { ok: false, status: 409, error: SIN_CONVERSACION };
    }
    const { partes, armado } = escrito;

    const correo: CorreoDeSeguimiento = { asunto: armado.asunto, cuerpo: armado.cuerpo, para, en: new Date().toISOString(), corridaId: run.id };
    await guardarCorreo(fila.id, clave, correo);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        currentPhase: null,
        output: JSON.stringify({ asunto: correo.asunto, preguntas: partes.preguntas.length, proximosPasos: partes.proximosPasos.length, para: para.length }),
      },
    });
    return { ok: true, correo, clave };
  } catch (e) {
    const error = e instanceof Error ? e.message : "No se pudo armar el correo.";
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error }) } })
      .catch(() => {});
    console.error("[exploraciones/correo] no se pudo armar", e);
    return { ok: false, status: 502, error: "No se pudo armar el correo. Vuelve a intentarlo." };
  }
}

/**
 * Lo guarda con la fila bloqueada (el agente de la exploración escribe la misma columna). El nuevo va
 * último: los viejos salen primero. null = lo borra (la reunión no tiene la conversación).
 */
async function guardarCorreo(exploracionId: string, clave: string, correo: CorreoDeSeguimiento | null) {
  await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { propuesta: true } });
    if (!fila) return;
    const actual = leerPropuesta(fila.propuesta);
    const resto = Object.entries(actual.correos).filter(([k]) => k !== clave);
    const correos = Object.fromEntries((correo ? [...resto, [clave, correo]] : resto).slice(-MAX_CORREOS));
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { propuesta: { ...actual, correos } as unknown as Prisma.InputJsonValue },
    });
  });
}
