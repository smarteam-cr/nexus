/**
 * lib/nexus-chat/turno-server.ts — UN TURNO del chat de Nexus sobre una cuenta. SERVER-ONLY.
 *
 * Reusa de lib/asistente el hilo (lib/asistente/hilo.ts, con el dueño { clientId }), el acuerdo con su marcador y el
 * cajón; el turno es propio (./bucle.ts): este chat LEE con herramientas, los otros dos no.
 *
 *   1. lo pendiente del hilo se revalida contra hoy (se vuelve a preparar cada cambio);
 *   2. se arma el contexto de la cuenta (la empresa, sus proyectos, su memoria) y se abre la corrida (`AgentRun`);
 *   3. el bucle: el modelo lee y propone, con el tope de vueltas;
 *   4. el acuerdo nuevo (la lista) y los dos turnos del hilo; la corrida se cierra con su costo.
 *
 * ⛔ NO ESCRIBE NADA DE LA CUENTA. Lo que propone vuelve como una lista; aplicarla es ./aplicar-server.ts, con el clic
 * de la persona. Cada llamada al modelo queda medida (`LlmCall`) con el agente, la cuenta, la persona y el hilo.
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { agregarTurno, huellaDeContexto, leerHilo, type HiloConTurnos } from "@/lib/asistente/hilo";
import { marcaDeAcuerdo, type CambioAcordado } from "@/lib/asistente/acuerdo";
import { ESFUERZO_DEL_CHAT, SLUG_DEL_CHAT_DE_NEXUS, TOPES_DEL_CHAT, origenDelHilo } from "./constantes";
import { correrBucle, type CambioPropuesto, type EjecutorDelChat } from "./bucle";
import { MODELO_DEL_ASISTENTE } from "@/lib/asistente/turno";
import { componerAcuerdo, pendientesDeNexus, ventanaDelHilo } from "./libro";
import { bloqueDeLoPendiente, contextoDeLaCuenta, PROMPT_DE_NEXUS } from "./prompt";
import { contextoDelChat, ejecutorDelChat, herramientasDelChat, prepararParaLaCuenta } from "./herramientas-server";
import { loQueSeSabeDeLaCuenta } from "./lecturas-server";
import { costoDeLaCorrida } from "./uso-server";
import { avisoDeRechazos, lineaDeLaLista, sinMarcadores } from "./textos";
import { tomarHilo } from "./candado-server";
import { ErrorDelChat } from "./aplicar-server";
import { comoInformacion } from "./bucle";
import { baseDeLaGuia, loEstableDeLaGuia, preguntasDeLaGuiaParaElChat } from "@/lib/operaciones/guia-server";

/** El presupuesto de salida de cada llamada (el razonamiento sale de acá). */
const MAX_TOKENS_DE_RESPUESTA = 8_000;

export interface ResultadoDelTurnoDeNexus {
  respuesta: string;
  acuerdo: CambioAcordado | null;
  costoUsd: number;
}


/**
 * El turno con el candado del hilo, el MISMO que toma aplicar (./candado-server.ts): un clic en «Aplicar» mientras corre
 * el turno no puede dejar que el turno vuelva a proponer lo que se acaba de aplicar. El hilo se relee CON el candado.
 */
/**
 * Lo que la persona señaló al abrir el chat (validación 71): la guía de la próxima sesión de una exploración. Lo estable
 * (la próxima sesión, lo que dejó cada sesión, lo que ya sabemos, lo vendido, la memoria del proyecto) va en el `system`,
 * después de la cuenta, y se cachea; las preguntas, que cambian al aplicar, van en el mensaje de ESTE turno, como
 * información de la cuenta (caso CEMACO, 2026-10-20: antes iba todo en el mensaje y sin ninguna sesión).
 */
export interface FocoDelChat {
  tipo: "guia";
  exploracionId: string;
}

/** La guía, si la exploración es de esta cuenta: lo estable para el `system` y las preguntas para el mensaje. */
export async function bloqueDelFoco(foco: FocoDelChat | undefined, clientId: string, ctx: object): Promise<{ contexto: string; mensaje: string }> {
  const nada = { contexto: "", mensaje: "" };
  if (!foco) return nada;
  const f = await prisma.exploracionDeVenta.findUnique({ where: { id: foco.exploracionId }, select: { clientId: true } });
  if (!f || f.clientId !== clientId) return nada;
  // La guía queda armada en el contexto del turno: los cambios que se preparen después la reusan (guia-server.ts).
  const base = await baseDeLaGuia(ctx, foco.exploracionId).catch(() => null);
  if (!base) return nada;
  return {
    contexto: loEstableDeLaGuia(foco.exploracionId, base),
    mensaje: `[LA PERSONA ABRIÓ EL CHAT DESDE LA GUÍA — lo escribe Nexus, no la persona]\n${comoInformacion(preguntasDeLaGuiaParaElChat(foco.exploracionId, base))}\n\n`,
  };
}

export async function correrTurnoDeNexus(
  hilo: HiloConTurnos,
  mensajeCrudo: string,
  quien: { persona: TeamMember; clientId: string; veMontos: boolean },
  ahora: Date = new Date(),
  foco?: FocoDelChat,
): Promise<ResultadoDelTurnoDeNexus> {
  const soltar = tomarHilo(hilo.id);
  if (!soltar) throw new ErrorDelChat(409, "Nexus está terminando algo en esta conversación: espera un momento y vuelve a escribir.");
  try {
    const fresco = (await leerHilo(hilo.id, { clientId: quien.clientId }, hilo.usuarioEmail)) ?? hilo;
    return await correrTurno(fresco, mensajeCrudo, quien, ahora, foco);
  } finally {
    soltar();
  }
}

/** El hilo que necesita pensar un turno (el script de medición pasa uno sin guardar). */
export type HiloDelTurno = Pick<HiloConTurnos, "id" | "usuarioEmail" | "turnos"> & { modelo?: string };

/** Cuánto tardó cada parte de un turno (validación 106): queda en el `AgentRun` y lo imprime el script de medición. */
export interface TiemposDelTurno {
  pendientesMs: number;
  contextoMs: number;
  focoMs: number;
  llamadas: Array<{ ms: number; entrada: number; cacheLeida: number; cacheEscrita: number; salida: number }>;
  herramientas: Array<{ nombre: string; ms: number }>;
  totalMs: number;
}

export interface TurnoPensado {
  respuesta: string;
  acuerdo: CambioAcordado | null;
  propuestos: CambioPropuesto[];
  rechazados: Array<{ herramienta: string; motivo: string }>;
  vueltas: number;
  herramientas: string[];
  sha: string;
  tiempos: TiemposDelTurno;
}

/** El ejecutor, midiendo cuánto tarda cada herramienta. */
function conTiempos(e: EjecutorDelChat, anotar: TiemposDelTurno["herramientas"]): EjecutorDelChat {
  const medir = async <T>(nombre: string, f: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await f();
    } finally {
      anotar.push({ nombre, ms: Date.now() - t });
    }
  };
  return {
    esLectura: (h) => e.esLectura(h),
    leer: (h, i) => medir(h, () => e.leer(h, i)),
    preparar: (h, i) => medir(h, () => e.preparar(h, i)),
  };
}

/**
 * EL TURNO SIN ESCRIBIR NADA: revalida lo pendiente, arma el contexto, corre el bucle y compone la lista. Lo usan
 * `correrTurno` (que después guarda los turnos y cierra la corrida) y scripts/medir-turno-de-la-guia.ts.
 */
export async function pensarElTurno(o: {
  hilo: HiloDelTurno;
  mensaje: string;
  quien: { persona: TeamMember; clientId: string; veMontos: boolean };
  ahora: Date;
  foco?: FocoDelChat;
  agentRunId: string | null;
}): Promise<TurnoPensado> {
  const t0 = Date.now();
  const { hilo, mensaje, quien, ahora, foco } = o;
  const { persona, clientId } = quien;
  const ctx = contextoDelChat(persona, quien.veMontos, ahora);
  const tiempos: TiemposDelTurno = { pendientesMs: 0, contextoMs: 0, focoMs: 0, llamadas: [], herramientas: [], totalMs: 0 };

  // 1. Lo pendiente, revalidado contra hoy: lo que ya no se puede se cae con su motivo.
  const vivas: CambioPropuesto[] = [];
  const caidas: Array<{ linea: string; motivo: string }> = [];
  for (const p of pendientesDeNexus(hilo.turnos)) {
    const r = await prepararParaLaCuenta(ctx, clientId, p.nombre, p.entrada);
    if (r.ok) vivas.push(r.cambio);
    else caidas.push({ linea: p.linea, motivo: r.motivo });
  }
  tiempos.pendientesMs = Date.now() - t0;

  // 2. El contexto de la cuenta y la guía, si la persona abrió el chat desde ahí: en paralelo (no dependen entre sí).
  const medido = async <T>(f: () => Promise<T>, anotar: (ms: number) => void): Promise<T> => {
    const t = Date.now();
    try {
      return await f();
    } finally {
      anotar(Date.now() - t);
    }
  };
  const [saber, guia] = await Promise.all([
    medido(() => loQueSeSabeDeLaCuenta(clientId), (ms) => (tiempos.contextoMs = ms)),
    medido(() => bloqueDelFoco(foco, clientId, ctx), (ms) => (tiempos.focoMs = ms)),
  ]);
  if (!saber) throw new Error("La cuenta no existe.");
  const contexto = contextoDeLaCuenta({
    ahora,
    persona: { nombre: persona.name, email: persona.email, rol: String(persona.roleEnum), equipos: persona.area ? [persona.area] : [] },
    cuenta: saber.cuenta,
    proyectos: saber.proyectos,
    memoria: saber.memoria,
    exploracion: guia.contexto,
  });
  const sha = huellaDeContexto(contexto);

  // 3. El pedido: la ventana del hilo (con su breakpoint), y lo pendiente + el mensaje de la persona.
  const ventana = ventanaDelHilo(hilo.turnos, TOPES_DEL_CHAT.turnosALaVista);
  const historia: Anthropic.Messages.MessageParam[] = ventana.map((t, i) =>
    i === ventana.length - 1 ? { role: t.rol, content: [{ type: "text" as const, text: t.texto, cache_control: { type: "ephemeral" as const } }] } : { role: t.rol, content: t.texto },
  );
  const messages: Anthropic.Messages.MessageParam[] = [...historia, { role: "user", content: `${bloqueDeLoPendiente(vivas.map((v) => v.linea))}${guia.mensaje}${mensaje}` }];
  const tools = herramientasDelChat();
  const llamar = async (msgs: Anthropic.Messages.MessageParam[], op: { sinHerramientas: boolean }) => {
    const tl = Date.now();
    const m = await conContextoDeIA({ agentSlug: SLUG_DEL_CHAT_DE_NEXUS, agentRunId: o.agentRunId, clientId, triggeredByEmail: hilo.usuarioEmail, origen: origenDelHilo(hilo.id) }, () =>
      getAnthropic().messages.create({
        model: hilo.modelo ?? MODELO_DEL_ASISTENTE,
        max_tokens: MAX_TOKENS_DE_RESPUESTA,
        // Un chat, no un documento: pensar poco y contestar rápido (validación 106; ver ./constantes.ts).
        output_config: { effort: ESFUERZO_DEL_CHAT },
        /* Dos breakpoints en `system` (el prompt, igual para todos; la cuenta, que cambia con su memoria) y uno en
           `messages` (el último de la ventana). Las herramientas van antes del prompt y siempre en el mismo orden. */
        system: [
          { type: "text", text: PROMPT_DE_NEXUS, cache_control: { type: "ephemeral" } },
          { type: "text", text: `TU CONTEXTO\n\n${contexto}`, cache_control: { type: "ephemeral" } },
        ],
        tools,
        // La última vuelta contesta con lo que ya leyó.
        ...(op.sinHerramientas ? { tool_choice: { type: "none" as const } } : {}),
        messages: msgs,
      }),
    );
    tiempos.llamadas.push({
      ms: Date.now() - tl,
      entrada: m.usage.input_tokens,
      cacheLeida: m.usage.cache_read_input_tokens ?? 0,
      cacheEscrita: m.usage.cache_creation_input_tokens ?? 0,
      salida: m.usage.output_tokens,
    });
    return m;
  };

  const b = await correrBucle({
    llamar,
    ejecutor: conTiempos(ejecutorDelChat(ctx, clientId), tiempos.herramientas),
    mensajes: messages,
    maxVueltas: TOPES_DEL_CHAT.vueltasPorTurno,
    maxCambios: TOPES_DEL_CHAT.cambiosPorLista,
    yaPendientes: vivas.length,
  });

  // 4. La lista y la respuesta.
  const acuerdo = componerAcuerdo({ vivas, caidas, descartar: b.descartar, nuevos: b.propuestos });
  let respuesta = sinMarcadores(b.texto);
  if (b.stop === "refusal") respuesta = "No puedo ayudarte con eso en este chat.";
  const aviso = avisoDeRechazos(b.rechazados);
  if (aviso) respuesta = `${respuesta.trim()}\n\n${aviso}`;
  if (caidas.length) respuesta = `${respuesta.trim()}\n\n⚠ Salió de la lista porque cambió: ${caidas.map((c) => `${c.linea} (${c.motivo})`).join(" · ")}`;
  // Sin texto, la lista es la respuesta: una línea, sin repetirla (validación 104).
  if (!respuesta.trim()) respuesta = acuerdo?.lineas?.length ? lineaDeLaLista(acuerdo.lineas.length) : (acuerdo?.resumen ?? "(Nexus no devolvió texto)");
  tiempos.totalMs = Date.now() - t0;
  return { respuesta: respuesta.trim(), acuerdo, propuestos: b.propuestos, rechazados: b.rechazados, vueltas: b.vueltas, herramientas: b.herramientas, sha, tiempos };
}

async function correrTurno(
  hilo: HiloConTurnos,
  mensajeCrudo: string,
  quien: { persona: TeamMember; clientId: string; veMontos: boolean },
  ahora: Date,
  foco?: FocoDelChat,
): Promise<ResultadoDelTurnoDeNexus> {
  const mensaje = sinMarcadores(mensajeCrudo).trim();
  const run = await prisma.agentRun.create({
    data: { agentSlug: SLUG_DEL_CHAT_DE_NEXUS, clientId: quien.clientId, triggeredByEmail: hilo.usuarioEmail, status: "RUNNING", stepLabel: "Chat de Nexus", currentPhase: "Leyendo la cuenta…" },
    select: { id: true },
  });

  try {
    const t = await pensarElTurno({ hilo, mensaje, quien, ahora, foco, agentRunId: run.id });
    const { acuerdo, respuesta, sha } = t;

    // El turno de la persona se guarda solo si el modelo contestó (un error no cuenta en el tope).
    await agregarTurno(hilo.id, { rol: "CSE", contenido: mensaje, shaDeContexto: sha });
    await agregarTurno(hilo.id, { rol: "ASISTENTE", contenido: acuerdo ? `${respuesta}\n\n${marcaDeAcuerdo(acuerdo)}` : respuesta, shaDeContexto: sha });

    const costo = await costoDeLaCorrida(run.id).catch(() => ({ usd: 0, llamadas: 0 }));
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        currentPhase: null,
        output: JSON.stringify({
          hiloId: hilo.id,
          vueltas: t.vueltas,
          herramientas: t.herramientas,
          propuestos: t.propuestos.length,
          rechazados: t.rechazados.length,
          enLaLista: acuerdo?.operaciones?.length ?? 0,
          costoUsd: costo.usd,
          llamadas: costo.llamadas,
          tiempos: t.tiempos,
        }),
      },
    });
    return { respuesta, acuerdo, costoUsd: costo.usd };
  } catch (e) {
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ hiloId: hilo.id, error: e instanceof Error ? e.message : String(e) }) } })
      .catch(() => {});
    throw e;
  }
}
