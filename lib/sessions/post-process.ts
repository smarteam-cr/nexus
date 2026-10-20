/**
 * lib/sessions/post-process.ts — la LECTURA DE SEGUIMIENTO de una reunión (memoria de la cuenta, etapa 2).
 *
 * La pasada única sobre cada reunión con un cliente o un prospecto: deja la minuta, los compromisos de los dos lados
 * (como propuestas de Tarea) y, en una reunión de un cliente con proyecto, los pedidos fuera de alcance. Después, en
 * segundo plano, lo que sigue: el avance del cronograma, la ficha, la fecha del diagnóstico, la etapa y la preventa.
 * Ver docs/DECISIONS.md «La lectura de cada reunión es durable…».
 *
 * Con `SEGUIMIENTO_HECHOS` prendida y su SQL (memoria de la cuenta, etapa 6), lo que sigue empieza por la lectura de
 * HECHOS (lib/seguimiento/hechos-server.ts), y el avance, la ficha y la etapa salen de ellos. Una reunión con SOLO notas
 * de Gemini no deja minuta, pero sí sus hechos. Apagada, todo sigue como antes (DECISIONS «Hechos, enrutador y novedades»).
 *
 * ── LO QUE CAMBIÓ CONTRA EL POST-PROCESO VIEJO (lib/sessions/post-process-viejo.ts) ─────────────────────────
 *  · Lo lee el job `seguimiento-reuniones` por la cola (lib/lecturas), con toma atómica, reintentos y presupuesto. El
 *    enriquecimiento de Meet solo encola: se acabó el «dispara y olvida».
 *  · El dueño sale de `resolvedClientId` (el manual, solo si no hay), sin volver a categorizar; sin dueño, no se lee.
 *  · La ruta la decide el tipo de empresa: de un cliente, todo; de un prospecto, la minuta y los compromisos; de un
 *    aliado o de Smarteam, nada. Una reunión de puertas adentro (solo estuvo el equipo) tampoco, aunque su dueño sea un
 *    cliente: lo dicho sin el cliente no se le atribuye (la lee Tareas).
 *  · Los títulos que ya son tareas («YA SON TAREAS») salen de la puerta de los agentes (lib/tareas/para-agentes.ts).
 *  · Se puede CORTAR (`signal`): el corte llega al clasificador y a cada llamada, y si llega antes de escribir, no se
 *    escribe nada (lib/lecturas/leer.ts pone el tope).
 *  · Con `force`, una minuta ya revisada o editada no se rehace: es memoria y se corrige, no se pisa.
 *  · La salida es una HERRAMIENTA (lib/sessions/lectura-salida.ts), no una regex. Si se corta, se reintenta una vez con
 *    más tope; si vuelve a cortarse, error.
 *  · Cada cita se verifica contra lo que se mandó: lo que no aparece tal cual, se descarta.
 *  · Los compromisos ya no son `ActionItem` (DEPRECATED): son propuestas de Tarea (lib/tareas/seguimiento.ts), por el
 *    único escritor de Tareas.
 *  · Toda llamada a la IA que dispara la lectura queda en `LlmCall` con `origen = "reunion:<sessionId> › <sitio>"`.
 *
 * El orden de las escrituras importa: las propuestas y los pedidos van ANTES que la minuta, que se escribe la última.
 * Así «ya tiene minuta» quiere decir que la lectura terminó entera, y un reintento después de un corte no pierde nada.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { conContextoDeIA, conLaReunion } from "@/lib/ai/contexto-de-corrida";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { classifySessionToProjects, getPrimaryProjectIdForSession } from "@/lib/sessions/classify-session-project";
import { titleMentionsKickoff } from "@/lib/sessions/session-type";
import { maybeReanchorToKickoff } from "@/lib/timeline/reanchor";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { fechaLocalDeLaReunion } from "@/lib/sessions/compromisos-y-alcance";
import { ADENDA_PRESENTACION_DEL_DIAGNOSTICO, leerPresentacionDetectada } from "@/lib/canvas/presentacion-del-diagnostico";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { MIN_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";
import { MIN_RECUERDO, leerMarcaAMano, recuerdoDeLaReunion } from "@/lib/sessions/reunion-a-mano";
import {
  TOPE_DE_LA_TRANSCRIPCION,
  adendaDeLaHerramienta,
  fuenteDeLasCitas,
  herramientaDeLaLectura,
  leerSalidaDeLaLectura,
  verificarCitas,
  HERRAMIENTA_DE_LA_LECTURA,
  type SalidaDeLaLectura,
} from "@/lib/sessions/lectura-salida";
import { TOPE_DE_TOKENS, rutaDeLaLectura, type RutaDeLaLectura } from "@/lib/lecturas/reglas";
import { MIN_NOTAS_PARA_LEER, hechosPrendidos } from "@/lib/seguimiento/hechos/reglas";
import { cseDeLaCuenta, cseDelProyecto, negocioDeLaCuenta, responsableDeLaPreventaViva } from "@/lib/lecturas/personas";
import { armarPropuestasDeSeguimiento, elegirLoEsencial } from "@/lib/tareas/seguimiento";
import { descartesDeLaCuenta, escribirSalidaDeSeguimiento } from "@/lib/tareas/lectura";
import { titulosParaLaLectura } from "@/lib/tareas/para-agentes";
import { miembrosActivos } from "@/lib/tareas/servidor";
import { esDePuertasAdentro } from "@/lib/sessions/reuniones-para-seguimiento";
import type Anthropic from "@anthropic-ai/sdk";
import { LECTURA_Y_HECHOS_COMPARTEN_PREFIJO } from "@/lib/ai/ahorro";
import { herramientaDeHechos, prefijoDeLaReunion } from "@/lib/seguimiento/hechos/pedido";
import { armarTextoDeLaReunion, textoParaElModelo } from "@/lib/seguimiento/hechos/texto";

const AGENT_ID_POST_SESSION = "agent-post-session";

export interface ResultadoDeLaLectura {
  /**
   * `omitida`: sin dueño, de un aliado o de Smarteam, o de puertas adentro. `sin_texto`: sin transcripción. `skipped`:
   * ya tenía minuta (o, con `force`, la minuta ya estaba revisada o editada).
   */
  status: "ok" | "skipped" | "omitida" | "sin_texto" | "error";
  reason?: string;
  sessionId: string;
  clientId?: string;
  ruta?: RutaDeLaLectura;
  minuteId?: string;
  /** Las propuestas de Tarea nuevas, con responsable y «Por asignar». */
  propuestas?: number;
  porAsignar?: number;
  pedidos?: number;
  descartadosPorCita?: { compromisos: number; pedidos: number };
  tokens?: { entrada: number; salida: number };
  /** Solo con `soloLeer`: lo que salió (ya con las citas verificadas), sin escribir nada. */
  salida?: SalidaDeLaLectura;
  /**
   * Lo que sigue (avance, ficha, fecha del diagnóstico, etapa, preventa). Quien llama lo corre DESPUÉS de marcar la
   * lectura, en segundo plano: el scheduler corre los jobs en serie y esto no lo puede trabar. Atribuido a la reunión.
   */
  despues?: () => Promise<void>;
}

/** Compatibilidad: el nombre de siempre del resultado. */
export type PostProcessResult = ResultadoDeLaLectura;

export interface OpcionesDeLaLectura {
  /** Rehace la minuta aunque ya exista (el botón «Generar minuta» de nuevo). */
  force?: boolean;
  /** Quién la pidió: cobra contra el presupuesto humano. null = la cola (presupuesto automático). */
  pedidaPorEmail?: string | null;
  /** La fila de la cola (`LecturaDeReunion`): hace falta para escribir las propuestas de Tarea. */
  lecturaId?: string | null;
  /** Lee y devuelve la salida SIN escribir nada (ni la corrida, ni la minuta, ni los vínculos). El script de comparación. */
  soloLeer?: boolean;
  /**
   * El corte del tope (lib/lecturas/leer.ts): llega al clasificador y a cada llamada a Claude, y si llegó antes de la
   * primera escritura de la salida, la lectura termina en error sin escribir nada.
   */
  signal?: AbortSignal;
  /**
   * La forma del pedido (lib/ai/ahorro.ts, `LECTURA_Y_HECHOS_COMPARTEN_PREFIJO`): «compartida» = la reunión en el
   * `system` cacheado, la misma que leen los hechos; «propia» = la de siempre. Sin decir, compartida solo si la palanca
   * está prendida y los hechos están activos. La fuerza el script de comparación.
   */
  formaDelPedido?: "compartida" | "propia";
}

/** El prefijo que la lectura dejó en la caché, para que los hechos lo lean (lib/seguimiento/hechos-server.ts). */
export interface PrefijoDeLaLectura {
  herramienta: Anthropic.Messages.Tool;
  /** El bloque de la reunión tal cual se mandó: los hechos lo comparan con el suyo antes de usarlo. */
  bloque: string;
}

/**
 * Lee una reunión. No toca la cola: la toma y el resultado los maneja lib/lecturas (`procesarLectura`, `leerAhora`).
 * Lanza solo ante un error de la base; un error del modelo vuelve como `status: "error"`.
 */
export async function leerReunionDeSeguimiento(sessionId: string, opts: OpcionesDeLaLectura = {}): Promise<ResultadoDeLaLectura> {
  return conLaReunion(sessionId, () => leer(sessionId, opts));
}

/**
 * El nombre de siempre. La lectura de verdad pasa por la cola (la toma, el resultado y lo que sigue): esto la pide YA,
 * como el botón «Generar minuta». Con la bandera apagada o sin el SQL, el post-proceso viejo.
 */
export async function postProcessSession(sessionId: string, opts: { force?: boolean } = {}): Promise<ResultadoDeLaLectura | { status: "ocupada"; sessionId: string; reason: string }> {
  const { leerAhora } = await import("@/lib/lecturas/leer");
  return leerAhora(sessionId, { force: opts.force, pedidaPorEmail: null });
}

async function leer(sessionId: string, opts: OpcionesDeLaLectura): Promise<ResultadoDeLaLectura> {
  // 1. La reunión.
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true, transcript: true, summary: true },
  });
  if (!session) return { status: "error", sessionId, reason: "La reunión no existe." };

  // 2. El dueño. NO se vuelve a categorizar: la fuente ÚNICA de "de quién es la sesión" es `resolvedClientId`, que
  //    meet-sync materializó con la cascada completa (invariantes 1 y 2 de CLAUDE.md). Sin dueño, no se lee.
  const duenoId = duenoDeLaSesion(session);
  if (!duenoId) return { status: "omitida", sessionId, reason: "Sin dueño: la reunión no está atribuida a ningún cliente" };
  const client = await prisma.client.findUnique({ where: { id: duenoId }, select: { id: true, name: true, company: true, industry: true, kind: true } });
  if (!client) return { status: "omitida", sessionId, reason: "El dueño de la reunión ya no existe" };

  // 3. La ruta según la empresa: de un aliado o de Smarteam, nada.
  const ruta = rutaDeLaLectura(client.kind);
  if (!ruta) {
    return { status: "omitida", sessionId, clientId: client.id, reason: `La reunión es de ${client.kind === "ALIADO" ? "un aliado" : "Smarteam"}: el seguimiento no la lee` };
  }
  // Una reunión de puertas adentro (todos los que estuvieron son de la casa) no se lee aunque la cascada le haya puesto
  // un cliente por el título: lo que se dijo ahí no lo dijo el cliente (la misma regla que la tarjeta y «Para ti»).
  if (await esDePuertasAdentro({ participants: session.participants, organizerEmail: session.organizerEmail })) {
    return { status: "omitida", sessionId, clientId: client.id, reason: "Es una reunión de puertas adentro (solo estuvo el equipo): la lee Tareas, no el seguimiento" };
  }
  const transcript = session.transcript ?? "";
  // Lo que alguien recuerda de una reunión agregada a mano (lib/sessions/reunion-a-mano.ts) se lee entero, como una
  // transcripción: deja minuta, tareas y pedidos. Pero no son palabras de nadie, y el mensaje lo dice.
  const marcaAMano = leerMarcaAMano(session.summary);
  const recuerdo = transcript.trim().length < MIN_TRANSCRIPT_CHARS ? recuerdoDeLaReunion(session.summary) : null;
  const leeElRecuerdo = !!recuerdo && recuerdo.length >= MIN_RECUERDO;
  if (transcript.trim().length < MIN_TRANSCRIPT_CHARS && !leeElRecuerdo) {
    const sinTexto: ResultadoDeLaLectura = { status: "sin_texto", sessionId, clientId: client.id, ruta, reason: "Sin transcripción (o muy corta)" };
    // Memoria de la cuenta, etapa 6 (solo con SEGUIMIENTO_HECHOS prendida y el SQL): una reunión con SOLO notas de
    // Gemini no deja minuta, pero sí sus hechos (fuente «notas»). Antes, el clasificador la vincula a su proyecto (solo
    // el clasificador, nunca el override), para que cada hecho sepa de qué proyecto es.
    if (opts.soloLeer || !hechosPrendidos(process.env)) return sinTexto;
    const { hechosActivos } = await import("@/lib/seguimiento/hechos-server");
    if (!(await hechosActivos()) || !tieneNotasParaLeer(session.summary)) return sinTexto;
    if (ruta === "completa") await classifySessionToProjects(sessionId, client.id, { signal: opts.signal }).catch(() => null);
    return {
      ...sinTexto,
      reason: "Sin transcripción: se leen solo sus hechos, de las notas de Gemini",
      despues: () => conLaReunion(sessionId, () => soloLosHechos(sessionId, { lecturaId: opts.lecturaId ?? null, quien: opts.pedidaPorEmail ?? null })),
    };
  }

  // 4. Ya leída: «tiene minuta» = la lectura terminó entera (la minuta se escribe la última). Con `force` se rehace,
  //    salvo que una persona ya la haya revisado o editado: la minuta es memoria y se corrige, no se pisa.
  if (!opts.soloLeer) {
    const existente = await prisma.sessionMinute.findUnique({ where: { sessionId }, select: { id: true, status: true } });
    if (existente && !opts.force) return { status: "skipped", sessionId, clientId: client.id, ruta, minuteId: existente.id, reason: `Ya tenía minuta (${existente.status})` };
    if (existente && (existente.status === "REVIEWED" || existente.status === "EDITED")) {
      return { status: "skipped", sessionId, clientId: client.id, ruta, minuteId: existente.id, reason: "La minuta ya se revisó: no se rehace (se corrige en la reunión)" };
    }
  }
  if (!opts.soloLeer && !opts.lecturaId) return { status: "error", sessionId, clientId: client.id, ruta, reason: "Falta la fila de la cola: la lectura se pide por lib/lecturas." };

  // 5. El proyecto (solo en un cliente). El clasificador persiste SessionProject y devuelve el primario; con un solo
  //    proyecto es un atajo sin IA. Al solo leer, el primario que ya hay (sin escribir y sin otra llamada).
  let primaryProjectId: string | null = null;
  if (ruta === "completa") {
    primaryProjectId = opts.soloLeer
      ? await getPrimaryProjectIdForSession(sessionId)
      : ((await classifySessionToProjects(sessionId, client.id, { signal: opts.signal })).primaryProjectId ?? null);
    // Ciclo de vida: si ESTA reunión es el kickoff, re-anclar el cronograma al kickoff real (best-effort; las guardas
    // viven en maybeReanchorToKickoff). El pre-filtro por título es amplio a propósito.
    if (!opts.soloLeer && primaryProjectId && titleMentionsKickoff(session.title ?? "")) {
      try {
        await maybeReanchorToKickoff(primaryProjectId);
      } catch (e) {
        console.error("[lectura] re-anclaje best-effort falló:", e);
      }
    }
  }
  const project = primaryProjectId ? await prisma.project.findUnique({ where: { id: primaryProjectId }, select: { id: true, name: true, serviceType: true } }) : null;

  /* La fecha de presentación del diagnóstico: solo si el proyecto tiene un diagnóstico generado que todavía no se
     presentó. Los pedidos fuera de alcance: solo en un cliente con proyecto (hay algo vendido contra qué comparar). */
  const pidePresentacion = project
    ? await import("@/lib/canvas/presentacion-del-diagnostico-server").then((m) => m.diagnosticoSinPresentar(project.id)).catch(() => false)
    : false;
  const pideFueraDeAlcance = ruta === "completa" && !!project;
  const alcanceVendido = pideFueraDeAlcance
    ? (await loadHandoffContext(project!.id, { onlyConfirmed: false, includeKeys: ["alcance_contratado", "fuera_de_alcance"] }).catch(() => "")).slice(0, 4000)
    : "";

  // 6. El mensaje. Lo que ya es una tarea no se vuelve a proponer: los títulos, por la puerta de los agentes (sin lo
  //    privado, lo de un espacio de «solo miembros» ni el borrador de un plan).
  const miembros = await miembrosActivos();
  const yaSonTareas = (await titulosParaLaLectura({ clientId: client.id, sessionId }).catch(() => [] as string[])).slice(0, 30);
  const overview =
    session.summary && typeof session.summary === "object" && "overview" in (session.summary as object) ? String((session.summary as { overview?: unknown }).overview ?? "") : "";
  const userMessage = [
    `=== CLIENTE ===`,
    `Nombre: ${client.name}`,
    client.company ? `Empresa: ${client.company}` : null,
    client.industry ? `Industria: ${client.industry}` : null,
    ruta === "prospecto" ? `(Es un PROSPECTO: todavía no compró.)` : null,
    project ? `\nProyecto activo: ${project.name}` : "",
    "",
    `=== EQUIPO INTERNO (correos válidos para ownerEmail) ===`,
    miembros.map((m) => `- ${m.nombre} <${m.email}>${m.area ? ` [${m.area}]` : ""}`).join("\n"),
    "",
    `=== REUNIÓN ===`,
    `Título: ${session.title}`,
    // En hora de Costa Rica: en UTC, una reunión de las 18:00 caía al día siguiente y toda fecha calculada desde ahí también.
    `Fecha: ${fechaLocalDeLaReunion(session.date)}`,
    `Participantes: ${session.participants.join(", ")}`,
    overview && !leeElRecuerdo ? `\n\n=== RESUMEN GENERADO POR GEMINI NOTES ===\n${overview}` : "",
    alcanceVendido.trim() ? `\n\n=== LO QUE SE VENDIÓ (para reconocer lo que está fuera de alcance) ===\n${alcanceVendido}` : "",
    yaSonTareas.length ? `\n\n=== YA SON TAREAS (no las repitas como compromiso) ===\n${yaSonTareas.map((t) => `- ${t}`).join("\n")}` : "",
    "",
    ...(leeElRecuerdo && marcaAMano
      ? [
          `=== LO QUE RECUERDA ${(marcaAMano.nombre ?? marcaAMano.por).toUpperCase()} DE LA REUNIÓN ===`,
          `(Lo escribió a mano después de la reunión. No es una transcripción: no son palabras textuales de nadie, así que nada de esto es una cita del cliente.)`,
          (recuerdo ?? "").slice(0, TOPE_DE_LA_TRANSCRIPCION),
        ]
      : [
          marcaAMano?.tipo === "transcripcion" ? `=== TRANSCRIPT (agregado a mano por ${marcaAMano.nombre ?? marcaAMano.por}) ===` : `=== TRANSCRIPT ===`,
          transcript.slice(0, TOPE_DE_LA_TRANSCRIPCION),
        ]),
  ]
    .filter((x) => x !== null)
    .join("\n");

  const system =
    ((await prisma.agent.findUnique({ where: { id: AGENT_ID_POST_SESSION }, select: { systemPrompt: true } }))?.systemPrompt ?? "") +
    adendaDeLaHerramienta({ pideFueraDeAlcance }) +
    (pidePresentacion ? ADENDA_PRESENTACION_DEL_DIAGNOSTICO : "");
  const herramienta = herramientaDeLaLectura({ pideFueraDeAlcance, pidePresentacion, emailsDelEquipo: miembros.map((m) => m.email) });

  /* El prefijo compartido con los hechos (lib/ai/ahorro.ts): la reunión va en el `system` con `cache_control`, con las
     dos herramientas en `tools`, y lo que pide la lectura (su prompt y su contexto) va en el mensaje. Así los hechos,
     que corren enseguida, leen la reunión a 0,1. Solo con los hechos activos: si no, la caché la paga la lectura y no la
     lee nadie. Un recuerdo escrito a mano va siempre por el pedido propio. */
  const quiereCompartir =
    opts.formaDelPedido === "compartida" ||
    (opts.formaDelPedido !== "propia" && LECTURA_Y_HECHOS_COMPARTEN_PREFIJO && !opts.soloLeer && hechosPrendidos(process.env) &&
      (await import("@/lib/seguimiento/hechos-server").then((m) => m.hechosActivos()).catch(() => false)));
  const textoCompartido = quiereCompartir && !leeElRecuerdo ? armarTextoDeLaReunion({ transcript: session.transcript, summary: session.summary }) : null;
  const prefijoCompartido = textoCompartido
    ? prefijoDeLaReunion({
        reunion: { titulo: session.title ?? "", fecha: fechaLocalDeLaReunion(session.date), texto: textoCompartido },
        herramientas: [herramienta, herramientaDeHechos()],
        conCache: true,
      })
    : null;
  const mensajeCompartido = prefijoCompartido
    ? [
        system,
        "",
        userMessage.slice(0, userMessage.indexOf(`=== TRANSCRIPT`) >= 0 ? userMessage.indexOf(`=== TRANSCRIPT`) : userMessage.length).trimEnd(),
        "",
        `(La reunión —su transcripción, numerada por turno— está arriba, en el sistema. Llama a la herramienta ${HERRAMIENTA_DE_LA_LECTURA}.)`,
      ].join("\n")
    : null;

  // 7. La llamada. Sin una persona detrás, cobra contra el presupuesto automático (C-01).
  const run = opts.soloLeer
    ? null
    : await prisma.agentRun.create({
        data: {
          agentId: AGENT_ID_POST_SESSION,
          clientId: client.id,
          projectId: project?.id ?? null,
          status: "RUNNING",
          triggeredByEmail: opts.pedidaPorEmail ?? null,
          sourceSessionIds: [sessionId],
          stepLabel: "Análisis post-sesión",
          currentPhase: "Leyendo la reunión",
        },
        select: { id: true },
      });
  const marcarError = async (reason: string): Promise<ResultadoDeLaLectura> => {
    if (run) await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: reason.slice(0, 2_000), currentPhase: null } }).catch(() => undefined);
    return { status: "error", sessionId, clientId: client.id, ruta, reason };
  };

  const tokens = { entrada: 0, salida: 0 };
  const llamar = (maxTokens: number) =>
    conContextoDeIA(
      { agentSlug: AGENT_ID_POST_SESSION, agentRunId: run?.id ?? null, clientId: client.id, projectId: project?.id ?? null, triggeredByEmail: opts.pedidaPorEmail ?? null, origen: "sessions/post-process" },
      () =>
        anthropic.messages.create(
          prefijoCompartido && mensajeCompartido
            ? {
                model: "claude-sonnet-4-6",
                max_tokens: maxTokens,
                ...prefijoCompartido,
                tool_choice: { type: "tool", name: HERRAMIENTA_DE_LA_LECTURA },
                messages: [{ role: "user", content: mensajeCompartido }],
              }
            : {
                model: "claude-sonnet-4-6",
                max_tokens: maxTokens,
                system,
                tools: [herramienta],
                tool_choice: { type: "tool", name: HERRAMIENTA_DE_LA_LECTURA },
                messages: [{ role: "user", content: userMessage }],
              },
          opts.signal ? { signal: opts.signal } : undefined,
        ),
    );
  const cortada = () => `La lectura tardó más del tope y se cortó antes de escribir.`;
  let salidaCruda: SalidaDeLaLectura | null = null;
  try {
    for (const tope of TOPE_DE_TOKENS) {
      const msg = await llamar(tope);
      tokens.entrada += msg.usage?.input_tokens ?? 0;
      tokens.salida += msg.usage?.output_tokens ?? 0;
      if (msg.stop_reason === "max_tokens") continue;
      salidaCruda = leerSalidaDeLaLectura(msg);
      if (!salidaCruda) return await marcarError("El modelo no llamó a la herramienta de la lectura.");
      break;
    }
  } catch (e) {
    return await marcarError(opts.signal?.aborted ? cortada() : `Claude: ${(e as Error).message}`);
  }
  if (!salidaCruda) return await marcarError(`La respuesta se cortó (tope de ${TOPE_DE_TOKENS[TOPE_DE_TOKENS.length - 1]} tokens).`);
  // El corte llegó mientras respondía el modelo (o justo después): no se empieza a escribir. Una vez que se empieza,
  // se termina (son escrituras cortas), así nunca queda una lectura a medias.
  if (opts.signal?.aborted) return await marcarError(cortada());

  // 8. Las citas: lo que no aparece TAL CUAL en lo que se mandó, se descarta.
  if (!pideFueraDeAlcance) salidaCruda = { ...salidaCruda, fueraDeAlcance: [] };
  // Con el prefijo compartido, el modelo copió las citas de la conversación comprimida: también valen las de ahí.
  const { validos: salida, descartadosPorCita } = verificarCitas(
    salidaCruda,
    textoCompartido ? `${fuenteDeLasCitas(transcript, overview)}\n${textoParaElModelo(textoCompartido)}` : fuenteDeLasCitas(transcript, overview),
  );

  if (opts.soloLeer) return { status: "ok", sessionId, clientId: client.id, ruta, salida, descartadosPorCita, tokens, pedidos: salida.fueraDeAlcance.length };

  await prisma.agentRun.update({
    where: { id: run!.id },
    data: { status: "DONE", output: JSON.stringify({ salida, descartadosPorCita, ruta, tokens }), currentPhase: null },
  });

  // 9. Los compromisos → propuestas de Tarea, por el único escritor de Tareas.
  const lectura = await prisma.lecturaDeReunion.findUnique({ where: { id: opts.lecturaId! }, select: { id: true, equipo: true } });
  if (!lectura) return { status: "error", sessionId, clientId: client.id, ruta, reason: "La fila de la cola ya no existe." };
  const [cseProyecto, cseCuenta, preventa, descartes, negocio] = await Promise.all([
    ruta === "completa" ? cseDelProyecto(project?.id ?? null) : Promise.resolve(null),
    ruta === "completa" && !project ? cseDeLaCuenta(client.id) : Promise.resolve(null),
    ruta === "prospecto" ? responsableDeLaPreventaViva(client.id) : Promise.resolve(undefined),
    descartesDeLaCuenta(client.id),
    ruta === "completa" ? negocioDeLaCuenta(client.id) : Promise.resolve(undefined),
  ]);
  // Pocos y esenciales (2026-10-19): lo menor no se propone, lo que el cliente espera de Smarteam es de Smarteam, y lo
  // que alguien ya descartó en la cuenta no vuelve.
  const esencial = elegirLoEsencial(salida.compromisos);
  const armado = armarPropuestasDeSeguimiento({
    compromisos: esencial.quedan,
    descartados: descartes.temas,
    lectura,
    reunion: { id: sessionId, inicio: session.date, participantes: session.participants.map((p) => p.toLowerCase()), transcripcion: transcript },
    miembros,
    cseDelProyecto: cseProyecto,
    cseDeLaCuenta: cseCuenta,
    ...(ruta === "prospecto" ? { responsableDeLaPreventa: preventa } : {}),
    ...(negocio ? { negocio } : {}),
    clientId: client.id,
    empresa: client.name,
    projectId: project?.id ?? null,
    ruta,
  });
  const escrita = await escribirSalidaDeSeguimiento(lectura.id, sessionId, armado.propuestas, new Date(), { lineas: salida.compromisos.length, costo: tokens });

  // 10. Los pedidos fuera de alcance → PedidoFueraDeAlcance, solo en un cliente con proyecto y con la cita verificada.
  //     La IA los PROPONE: entran «por revisar» y el CSE los confirma o los descarta (lib/sessions/solicitudes-fuera-de-alcance.ts).
  //     El mismo pedido en otra reunión (misma huella) actualiza la fila, pero NUNCA pisa una decisión del CSE.
  if (pideFueraDeAlcance && project) {
    for (const pf of salida.fueraDeAlcance) {
      const previo = await prisma.pedidoFueraDeAlcance.findUnique({ where: { clientId_huella: { clientId: client.id, huella: pf.huella } }, select: { id: true, decididoAt: true } });
      if (!previo) {
        await prisma.pedidoFueraDeAlcance.create({
          data: { clientId: client.id, projectId: project.id, sessionId, huella: pf.huella, pedido: pf.pedido, quienLoPidio: pf.quienLoPidio || null, estado: "PEDIDO", monto: pf.monto, cita: pf.cita || null },
        });
      } else if (!previo.decididoAt) {
        await prisma.pedidoFueraDeAlcance.update({ where: { id: previo.id }, data: { ...(pf.monto ? { monto: pf.monto } : {}), ...(pf.cita ? { cita: pf.cita } : {}), sessionId } });
      }
    }
  }

  // 11. Los temas de la reunión (F5-A).
  if (salida.detectedTopics.length) {
    await prisma.firefliesSession.update({ where: { id: sessionId }, data: { detectedTopics: [...new Set(salida.detectedTopics)] }, select: { id: true } });
  }

  // 12. La minuta, la última: «tiene minuta» = la lectura terminó entera.
  const minuteData = {
    summary: salida.minuta.summary,
    agreements: salida.minuta.agreements as unknown as object,
    decisions: salida.minuta.decisions as unknown as object,
    risks: salida.minuta.risks as unknown as object,
    topics: salida.minuta.topics as unknown as object,
    status: "DRAFT" as const,
    generatedByAgentRunId: run!.id,
  };
  const minute = await prisma.sessionMinute.upsert({
    where: { sessionId },
    create: { sessionId, ...minuteData },
    update: opts.force ? { ...minuteData, reviewedAt: null, reviewedByEmail: null } : minuteData,
    select: { id: true },
  });

  console.log(
    `[lectura] ✓ "${session.title}" (${client.name}, ${ruta}) — minuta + ${escrita.propuestas} propuesta(s), ${escrita.porAsignar} por asignar, ${salida.fueraDeAlcance.length} pedido(s)` +
      (descartadosPorCita.compromisos + descartadosPorCita.pedidos ? ` · ${descartadosPorCita.compromisos + descartadosPorCita.pedidos} descartado(s) por la cita` : ""),
  );

  const despues = () =>
    conLaReunion(sessionId, () =>
      loQueSigue({
        sessionId,
        titulo: session.title ?? null,
        fecha: session.date,
        transcript,
        overview,
        clientId: client.id,
        projectId: project?.id ?? null,
        ruta,
        pidePresentacion,
        presentacion: salida.presentacionDiagnostico,
        lecturaId: opts.lecturaId ?? null,
        quien: opts.pedidaPorEmail ?? null,
        prefijo: prefijoCompartido ? { herramienta, bloque: prefijoCompartido.system[1].text } : null,
      }),
    );

  return {
    status: "ok",
    sessionId,
    clientId: client.id,
    ruta,
    minuteId: minute.id,
    propuestas: escrita.propuestas,
    porAsignar: escrita.porAsignar,
    pedidos: pideFueraDeAlcance ? salida.fueraDeAlcance.length : 0,
    descartadosPorCita,
    tokens,
    despues,
  };
}

/** ¿Las notas de Gemini alcanzan para leer sus hechos? (memoria de la cuenta, etapa 6: la cobertura de las de solo notas). */
function tieneNotasParaLeer(summary: unknown): boolean {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;
  const o = (summary as { overview?: unknown }).overview;
  const texto = Array.isArray(o) ? o.filter((x) => typeof x === "string").join("\n") : typeof o === "string" ? o : "";
  return texto.trim().length >= MIN_NOTAS_PARA_LEER;
}

/** Una reunión con solo notas: solo sus hechos (no hay minuta que escribir). Nunca lanza. */
async function soloLosHechos(sessionId: string, o: { lecturaId: string | null; quien: string | null }): Promise<void> {
  try {
    const { leerHechosDeLaReunion } = await import("@/lib/seguimiento/hechos-server");
    const r = await leerHechosDeLaReunion(sessionId, o);
    if (r.estado === "error") console.error(`[lectura] los hechos de la reunión (solo notas) fallaron (no bloqueante; se reintentan): ${r.error}`);
  } catch (e) {
    console.error(`[lectura] los hechos de la reunión (solo notas) fallaron (no bloqueante):`, e instanceof Error ? e.message : e);
  }
}

/**
 * Lo que sigue a la lectura, en segundo plano y best-effort: nada de esto tumba la lectura ni se espera para marcarla.
 * El avance, la fecha del diagnóstico y la etapa, solo en un cliente con proyecto; la ficha, solo en un cliente; la
 * preventa decide sola si le toca (lib/exploraciones/agente.ts).
 *
 * Con la lectura de hechos prendida (`SEGUIMIENTO_HECHOS` y el SQL, memoria de la cuenta, etapa 6), el avance, la ficha y
 * la etapa salen de los HECHOS de la reunión (lib/seguimiento/hechos-server.ts): la ficha deja de releer la reunión, y
 * el avance y la etapa corren solo con una señal (el avance, para cada proyecto que cumple `linkFeedsAvance`, no solo
 * el principal). Si la lectura de hechos no quedó lista (falló, se omitió), esos tres corren por el camino de siempre.
 */
async function loQueSigue(c: {
  sessionId: string;
  titulo: string | null;
  fecha: Date;
  transcript: string;
  overview: string;
  clientId: string;
  projectId: string | null;
  ruta: RutaDeLaLectura;
  pidePresentacion: boolean;
  presentacion: unknown;
  lecturaId: string | null;
  quien: string | null;
  /** El prefijo que la lectura dejó en la caché, si lo compartió: los hechos lo leen de ahí. */
  prefijo?: PrefijoDeLaLectura | null;
}): Promise<void> {
  // Memoria de la cuenta, etapa 6: con los hechos prendidos, el avance, la ficha y la etapa salen de ellos, PERO solo si
  // la lectura de hechos los aplicó (quedó lista en esta pasada), ya los había aplicado con la transcripción (`ya_leida`),
  // o los está aplicando otra corrida (`ocupada`). En cualquier otro caso (falló, se omitió, sin texto) corre el camino de
  // siempre: si no, una minuta rehecha o una reunión cuyos hechos fallaron se quedaban sin avance, ficha ni etapa.
  // La bandera se mira primero (pura): apagada, el módulo de los hechos ni se carga.
  let conHechos = false;
  if (hechosPrendidos(process.env)) {
    try {
      const { hechosActivos, leerHechosDeLaReunion } = await import("@/lib/seguimiento/hechos-server");
      if (await hechosActivos()) {
        const r = await leerHechosDeLaReunion(c.sessionId, { lecturaId: c.lecturaId, quien: c.quien, prefijoDeLaLectura: c.prefijo ?? null });
        conHechos = r.estado === "lista" || r.estado === "ya_leida" || r.estado === "ocupada";
        if (r.estado === "error") console.error(`[lectura] los hechos de la reunión fallaron (no bloqueante; corre el camino de siempre): ${r.error}`);
      }
    } catch (e) {
      console.error(`[lectura] los hechos de la reunión fallaron (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  if (c.projectId) {
    try {
      const { invalidateProjectHeat } = await import("@/lib/projects/heat");
      invalidateProjectHeat(c.projectId);
    } catch {
      /* fuera de Next (un script) no hay caché que invalidar */
    }
  }
  // D.2 — Cronograma vivo: tras la reunión, el BORRADOR de avance del cronograma (no toca status; el CSE confirma).
  // Con los hechos, corre desde ellos (solo con una señal de cronograma).
  if (c.projectId && !conHechos) {
    try {
      const { regenerateTimelineProgress } = await import("@/lib/timeline/regenerate-progress");
      const r = await regenerateTimelineProgress(c.projectId, { asOfSessionId: c.sessionId, disparadoPorSistema: true });
      if (r.status === "ok") console.log(`[lectura] ✓ avance de cronograma propuesto (${r.phasesDone} fases, ${r.tasksDone} tareas)`);
    } catch (e) {
      console.error(`[lectura] avance de cronograma falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // La ficha del cliente: cada reunión puede sumarle algo; queda como PROPUESTA que el CSE confirma. Un prospecto no:
  // su ficha la lleva la preventa. Con los hechos, se propone desde ellos (`proponerFichaDesdeHechos`): no relee la reunión.
  if (c.ruta === "completa" && !conHechos) {
    try {
      const { proponerFichaDesdeSesion } = await import("@/lib/clients/ficha-propuesta");
      const r = await proponerFichaDesdeSesion(c.sessionId, c.clientId, c.projectId);
      if (r.status === "ok" && r.cambiados) console.log(`[lectura] ✓ ficha del cliente: ${r.cambiados} campos propuestos`);
      if (r.status === "error") console.error(`[lectura] ficha del cliente falló (no bloqueante): ${r.error}`);
    } catch (e) {
      console.error(`[lectura] ficha del cliente falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // La fecha de presentación del diagnóstico: queda PROPUESTA con su frase, que tiene que aparecer tal cual.
  if (c.projectId && c.pidePresentacion) {
    try {
      const fechaDeLaReunion = fechaLocalDeLaReunion(c.fecha);
      const detectada = leerPresentacionDetectada(c.presentacion, fechaDeLaReunion);
      if (detectada && citaEstaEnLasFuentes(detectada.cita, normalizarParaCita(fuenteDeLasCitas(c.transcript, c.overview)))) {
        const { proponerFechaDesdeReunion } = await import("@/lib/canvas/presentacion-del-diagnostico-server");
        if (await proponerFechaDesdeReunion(c.projectId, { ...detectada, reunion: { id: c.sessionId, titulo: c.titulo, fecha: fechaDeLaReunion } })) {
          console.log(`[lectura] ✓ fecha de presentación del diagnóstico propuesta: ${detectada.fecha}`);
        }
      }
    } catch (e) {
      console.error(`[lectura] fecha del diagnóstico falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // La etapa en HubSpot: si la reunión muestra que el proyecto ya pasó a otra, queda como SUGERENCIA (nada se escribe allá).
  // Con los hechos, corre desde ellos (solo con una señal de etapa, para cada proyecto vinculado).
  if (c.projectId && !conHechos) {
    try {
      const { proponerEtapaDesdeSesion } = await import("@/lib/projects/etapa-desde-reunion-server");
      const r = await proponerEtapaDesdeSesion(c.sessionId, c.projectId);
      if (r.status === "sugerida") console.log(`[lectura] ✓ etapa sugerida para HubSpot: ${r.stageId}`);
      if (r.status === "error") console.error(`[lectura] etapa sugerida falló (no bloqueante): ${r.error}`);
    } catch (e) {
      console.error(`[lectura] etapa sugerida falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // Exploración de venta: si la empresa tiene una viva, el agente lee esta reunión (decide él si corresponde).
  try {
    const { leerReunionNueva } = await import("@/lib/exploraciones/agente");
    const r = await leerReunionNueva({ sesionId: c.sessionId, fecha: c.fecha, clientId: c.clientId });
    if (r === "lanzada") console.log(`[lectura] ✓ exploración de venta: el agente está leyendo la reunión`);
  } catch (e) {
    console.error(`[lectura] exploración de venta falló (no bloqueante):`, e instanceof Error ? e.message : e);
  }
}
