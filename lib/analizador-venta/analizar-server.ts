/**
 * lib/analizador-venta/analizar-server.ts — analiza UNA reunión de venta (S3, 2026-10-25). SERVIDOR. El único escritor de
 * `AnalisisDeVenta`.
 *
 * ⛔ Un solo cliente por análisis (invariante 1): la reunión se trae por el chokepoint (`getClientSessions` con su id y
 * su dueña), la guía es la de la preventa de ESA empresa, y la reunión de referencia (de otra empresa) NO entra al
 * contexto: se muestra al lado en la pantalla, para que una persona compare. Lo que se le manda al modelo:
 *   · el criterio (lib/analizador-venta/criterio.ts) con el posicionamiento de Smarteam si existe (lib/smarteam);
 *   · la guía que se llevó y las dimensiones de la escala (guia-de-la-reunion-server.ts), si hay;
 *   · quién habló, calculado (quien-hablo.ts, con las frases de la API de Meet o la transcripción);
 *   · la conversación numerada por turnos.
 * La respuesta llega por la herramienta `registrar_analisis` y cada cita se verifica contra la transcripción
 * (analisis.ts). Queda como PROPUESTA (coaching), con su corrida en `AgentRun` y su costo en `LlmCall` (el medidor).
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import { empresaQueUsaNexus, perfilDe } from "@/lib/smarteam/contexto";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { comprimirConversacion, conversacionComoTexto } from "@/lib/sessions/conversacion";
import { diaEnCostaRica } from "@/lib/sessions/reunion-a-mano";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { duenoDeLaSesion, getClientSessions } from "@/lib/sessions/project-sources";
import { claseDeTexto } from "@/lib/sessions/tiene-texto";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";
import { HERRAMIENTA_DEL_ANALISIS, leerElAnalisis, type ResultadoDelAnalisis, type TurnoNumerado } from "./analisis";
import { VERSION_DEL_CRITERIO, criterioComoTexto } from "./criterio";
import { guiaDeLaReunion, type GuiaDeLaReunion } from "./guia-de-la-reunion-server";
import { AGENTE_DEL_ANALIZADOR, MODELO_DEL_ANALIZADOR, SLUG_DEL_ANALIZADOR } from "./prompt";
import { quienHablo, quienHabloEnPalabras, type QuienHablo } from "./quien-hablo";
import { TEXTO_DE_POR_QUE_NO, delEquipoEnLaReunion, porQueNoEsDeVenta, seAnalizaAMano, vendedoresDeLaReunion, type PorQueNoEsDeVenta } from "./reglas";

/** El tope de la conversación que se le manda al modelo (unas dos horas de reunión). */
const TOPE_DE_LA_CONVERSACION = 90_000;
const MAX_TOKENS = 8000;

export interface LaReunionDeVenta {
  sessionId: string;
  titulo: string;
  fecha: Date;
  dueno: { id: string; nombre: string; kind: string } | null;
  /** null = es de venta. */
  porQueNo: PorQueNoEsDeVenta | null;
  /** Tiene transcripción (las notas no dicen quién dijo qué). */
  conTranscripcion: boolean;
  delEquipo: string[];
  vendedores: string[];
}

/** De estas empresas, las que tienen una preventa de venta abierta (una exploración sin proyecto, sin archivar). */
export async function empresasConPreventaAbierta(clientIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(clientIds)];
  if (!ids.length) return new Set();
  const filas = await prisma.exploracionDeVenta.findMany({ where: { clientId: { in: ids }, archivadaEn: null, ...DE_LA_PREVENTA }, select: { clientId: true } });
  return new Set(filas.map((f) => f.clientId));
}

/** Lo que hace falta saber de una reunión para decidir si se analiza. */
export async function laReunionDeVenta(sessionId: string): Promise<LaReunionDeVenta | null> {
  const s = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
  });
  if (!s) return null;
  const duenoId = duenoDeLaSesion(s);
  const [dueno, propios, ventas, texto, conPreventa] = await Promise.all([
    duenoId ? prisma.client.findUnique({ where: { id: duenoId }, select: { id: true, name: true, kind: true } }) : Promise.resolve(null),
    dominiosDeLaCasa(),
    salesPresenceEmails(),
    prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { transcript: true, summary: true } }),
    duenoId ? empresasConPreventaAbierta([duenoId]) : Promise.resolve(new Set<string>()),
  ]);
  const delEquipo = delEquipoEnLaReunion({ organizador: s.organizerEmail, participantes: s.participants }, propios);
  const puertasAdentro = esReunionDePuertasAdentro({ participants: s.participants, organizerEmail: s.organizerEmail }, propios);
  return {
    sessionId: s.id,
    titulo: s.title,
    fecha: s.date,
    dueno: dueno ? { id: dueno.id, nombre: dueno.name, kind: dueno.kind } : null,
    porQueNo: porQueNoEsDeVenta({ kind: dueno?.kind ?? null, puertasAdentro, conVentas: delEquipo.some((e) => ventas.has(e)), conPreventa: !!duenoId && conPreventa.has(duenoId) }),
    conTranscripcion: !!texto && claseDeTexto({ transcript: texto.transcript, summary: null }) === "transcripcion",
    delEquipo,
    vendedores: vendedoresDeLaReunion(delEquipo, ventas),
  };
}

/** Quién habló en una reunión (las frases de la API de Meet si hay; si no, la transcripción). */
export async function quienHabloEnLaReunion(sessionId: string, transcript?: string | null): Promise<QuienHablo> {
  const [frases, equipo, propios, texto] = await Promise.all([
    prisma.fraseDeReunion.findMany({ where: { sessionId }, orderBy: { orden: "asc" }, select: { hablante: true, correo: true, texto: true } }).catch(() => []),
    prisma.teamMember.findMany({ select: { email: true, name: true } }),
    dominiosDeLaCasa(),
    transcript === undefined ? prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { transcript: true } }).then((f) => f?.transcript ?? null) : Promise.resolve(transcript),
  ]);
  return quienHablo({ frases, transcripcion: texto, propios, equipo: equipo.map((m) => ({ email: m.email, nombre: m.name })) });
}

export type ResultadoDeAnalizar =
  | { ok: true; analisis: ResultadoDelAnalisis; descartados: number; runId: string }
  | { ok: false; status: number; error: string };

/** El material del análisis, como texto para el modelo. */
export function materialDelAnalisis(o: {
  empresa: string;
  titulo: string;
  fecha: Date;
  criterio: string;
  guia: GuiaDeLaReunion | null;
  quien: QuienHablo;
  turnos: readonly TurnoNumerado[];
  recortada: boolean;
}): string {
  const guia = o.guia?.preguntas.length
    ? `LA GUÍA DE LA PREVENTA QUE SE LLEVÓ${o.guia.objetivo ? ` (objetivo: ${o.guia.objetivo})` : ""}:\n${o.guia.preguntas.map((p) => `- ${p}`).join("\n")}`
    : "LA GUÍA DE LA PREVENTA: no había una guía armada antes de esta reunión (juzga guia = sin_guia).";
  const dimensiones = o.guia?.dimensiones.length
    ? `LAS DIMENSIONES DE LA ESCALA DEL ÁREA EN JUEGO:\n${o.guia.dimensiones.map((d) => `- ${d.nombre} (${d.area})${d.nivel ? `, nivel que se cree hoy: ${d.nivel}` : ""}`).join("\n")}`
    : "LAS DIMENSIONES DE LA ESCALA: no hay una preventa con escala para esta empresa (juzga escala = sin_escala y no hagas juicios de exploracion por dimensión).";
  const quien = `QUIÉN HABLÓ (calculado por Nexus, no lo recalcules): ${quienHabloEnPalabras(o.quien)}\n${o.quien.personas
    .slice(0, 12)
    .map((p) => `- ${p.nombre} (${p.lado === "smarteam" ? "Smarteam" : "cliente"}): ${p.porcentaje} %`)
    .join("\n")}`;
  // El mismo formato que cita el modelo en toda la app (lib/sessions/conversacion.ts): si cambia, cambia en los dos lados.
  const conversacion = conversacionComoTexto(o.turnos);
  return [
    `LA REUNIÓN: «${o.titulo}» con ${o.empresa}, el ${diaEnCostaRica(o.fecha)} (hora de Costa Rica).`,
    o.criterio,
    guia,
    dimensiones,
    quien,
    `LA CONVERSACIÓN${o.recortada ? " (larga: se cortaron los últimos turnos)" : ""}:\n${conversacion}`,
  ].join("\n\n");
}

/**
 * Analiza la reunión y guarda el análisis. `pedidoPor`: quién apretó «Analizar» (null = el job). Nunca analiza una
 * reunión que no es de venta o no tiene transcripción; la expansión de un cliente sin preventa, solo a mano.
 */
export async function analizarReunionDeVenta(sessionId: string, o: { pedidoPor: string | null }): Promise<ResultadoDeAnalizar> {
  const r = await laReunionDeVenta(sessionId);
  if (!r) return { ok: false, status: 404, error: "Esa reunión no existe." };
  if (!r.dueno) return { ok: false, status: 409, error: "Primero elige de qué empresa es la reunión." };
  if (r.porQueNo && !(o.pedidoPor && seAnalizaAMano(r.porQueNo))) return { ok: false, status: 409, error: `No es una reunión de venta. ${TEXTO_DE_POR_QUE_NO[r.porQueNo]}` };
  if (!r.conTranscripcion) return { ok: false, status: 409, error: "No tiene transcripción: sin ella no se sabe quién dijo qué." };

  // Por el chokepoint: la reunión es de esta empresa y ya ocurrió.
  const [deLaEmpresa] = await getClientSessions(r.dueno.id, { ids: [sessionId] });
  if (!deLaEmpresa) return { ok: false, status: 404, error: "Esa reunión no es de esta empresa o todavía no ocurrió." };

  const agente = await prisma.agent.findUnique({ where: { id: AGENTE_DEL_ANALIZADOR }, select: { systemPrompt: true, status: true } });
  if (!agente || agente.status !== "ACTIVE") return { ok: false, status: 503, error: "El agente del analizador no está sembrado (scripts/crear-agente-analizador-venta.ts)." };

  const fila = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { transcript: true } });
  const transcript = fila?.transcript ?? "";
  const { turnos, recortada } = comprimirConversacion(transcript, TOPE_DE_LA_CONVERSACION);
  if (!turnos.length) return { ok: false, status: 409, error: "La transcripción no trae turnos «Nombre: …» que leer." };

  const [quien, guia, empresaNuestra] = await Promise.all([
    quienHabloEnLaReunion(sessionId, transcript),
    guiaDeLaReunion({ clientId: r.dueno.id, sessionId, titulo: r.titulo, fecha: r.fecha }),
    empresaQueUsaNexus(),
  ]);
  const perfil = empresaNuestra ? await perfilDe(empresaNuestra.id) : null;
  const material = materialDelAnalisis({
    empresa: r.dueno.nombre,
    titulo: r.titulo,
    fecha: r.fecha,
    criterio: criterioComoTexto({ positionStatement: perfil?.positionStatement ?? null, propuestaDeValor: perfil?.propuestaDeValor ?? null }),
    guia,
    quien,
    turnos,
    recortada,
  });

  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENTE_DEL_ANALIZADOR,
      agentSlug: SLUG_DEL_ANALIZADOR,
      clientId: r.dueno.id,
      status: "RUNNING",
      stepLabel: "Análisis de la reunión de venta",
      triggeredByEmail: o.pedidoPor,
      sourceSessionIds: [sessionId],
    },
    select: { id: true },
  });

  try {
    const crudo = await conContextoDeIA(
      { agentSlug: SLUG_DEL_ANALIZADOR, agentRunId: run.id, clientId: r.dueno.id, triggeredByEmail: o.pedidoPor, origen: "analizador-venta", reunionId: sessionId },
      () => pedirElAnalisis(agente.systemPrompt, material),
    );
    const { resultado, descartados } = leerElAnalisis(crudo, turnos, {
      guia: !!guia?.preguntas.length,
      escala: !!guia?.dimensiones.length,
      posicionamiento: !!perfil?.positionStatement?.trim(),
    });
    const datos = {
      clientId: r.dueno.id,
      estado: "PROPUESTO" as const,
      resultado: resultado as unknown as Prisma.InputJsonValue,
      quienHablo: quien as unknown as Prisma.InputJsonValue,
      criterio: VERSION_DEL_CRITERIO,
      descartados,
      error: null,
      agentRunId: run.id,
      pedidoPor: o.pedidoPor,
      analizadoAt: new Date(),
    };
    await prisma.analisisDeVenta.upsert({ where: { sessionId }, create: { sessionId, ...datos }, update: datos });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify({ juicios: resultado.juicios.length, recomendaciones: resultado.recomendaciones.length, descartados }) },
    });
    return { ok: true, analisis: resultado, descartados, runId: run.id };
  } catch (e) {
    const error = humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error, raw: e instanceof Error ? e.message : String(e) }) } }).catch(() => {});
    await anotarElError(sessionId, r.dueno.id, error, { agentRunId: run.id, pedidoPor: o.pedidoPor });
    return { ok: false, status: 502, error };
  }
}

/**
 * Anota que la reunión no se pudo analizar, para que el job no la vuelva a tomar en cada vuelta. Un análisis anterior
 * BUENO de la misma empresa no se pisa; uno de otra empresa (la reunión cambió de dueña) sí: ya no vale.
 */
export async function anotarElError(sessionId: string, clientId: string, error: string, o: { agentRunId?: string | null; pedidoPor?: string | null } = {}): Promise<void> {
  const datos = { clientId, estado: "ERROR" as const, criterio: VERSION_DEL_CRITERIO, error: error.slice(0, 500), agentRunId: o.agentRunId ?? null, pedidoPor: o.pedidoPor ?? null, resultado: Prisma.DbNull, quienHablo: Prisma.DbNull, descartados: 0, analizadoAt: new Date() };
  const previo = await prisma.analisisDeVenta.findUnique({ where: { sessionId }, select: { clientId: true, estado: true } }).catch(() => null);
  if (previo && previo.clientId === clientId && previo.estado === "PROPUESTO") return;
  await prisma.analisisDeVenta.upsert({ where: { sessionId }, create: { sessionId, ...datos }, update: datos }).catch(() => {});
}

/** La llamada al modelo, con la herramienta forzada. Un corte por `max_tokens` se reintenta una vez pidiendo brevedad. */
async function pedirElAnalisis(systemPrompt: string, material: string): Promise<unknown> {
  const herramienta = HERRAMIENTA_DEL_ANALISIS as unknown as Anthropic.Tool;
  const pedir = (extra: string) =>
    anthropic.messages.create({
      model: MODELO_DEL_ANALIZADOR,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: [herramienta],
      tool_choice: { type: "tool", name: herramienta.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: material, cache_control: { type: "ephemeral" } },
            { type: "text", text: `\n\nAnaliza esta reunión según tus instrucciones y entrégalo con la herramienta ${herramienta.name}.${extra}` },
          ],
        },
      ],
    });
  let msg = await pedir("");
  if (msg.stop_reason === "max_tokens") {
    msg = await pedir("\n\nIMPORTANTE: sé conciso — lecturas de una frase y una cita por juicio.");
    if (msg.stop_reason === "max_tokens") throw new Error("output del agente truncado (max_tokens)");
  }
  const uso = msg.content.find((b) => b.type === "tool_use");
  if (!uso || uso.type !== "tool_use") throw new Error("El agente no devolvió el análisis con la herramienta.");
  return uso.input;
}
