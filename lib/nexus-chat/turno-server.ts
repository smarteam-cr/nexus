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
import { marcaDeAcuerdo, textoVisible, type CambioAcordado } from "@/lib/asistente/acuerdo";
import { SLUG_DEL_CHAT_DE_NEXUS, TOPES_DEL_CHAT, origenDelHilo } from "./constantes";
import { correrBucle, type CambioPropuesto } from "./bucle";
import { componerAcuerdo, pendientesDeNexus } from "./libro";
import { bloqueDeLoPendiente, contextoDeLaCuenta, PROMPT_DE_NEXUS } from "./prompt";
import { contextoDelChat, ejecutorDelChat, herramientasDelChat, prepararParaLaCuenta } from "./herramientas-server";
import { loQueSeSabeDeLaCuenta } from "./lecturas-server";
import { costoDeLaCorrida } from "./uso-server";
import { avisoDeRechazos, sinMarcadores } from "./textos";
import { tomarHilo } from "./candado-server";
import { ErrorDelChat } from "./aplicar-server";
import { comoInformacion } from "./bucle";
import { guiaParaElChat } from "@/lib/operaciones/guia-server";

/** El presupuesto de salida de cada llamada (el razonamiento sale de acá). */
const MAX_TOKENS_DE_RESPUESTA = 8_000;

export interface ResultadoDelTurnoDeNexus {
  respuesta: string;
  acuerdo: CambioAcordado | null;
  costoUsd: number;
}

/** Los turnos que ve el modelo: los últimos, con el primero de la persona (la API pide empezar por «user»). PURO. */
export function ventanaDelHilo(turnos: HiloConTurnos["turnos"], tope = TOPES_DEL_CHAT.turnosALaVista): Array<{ rol: "user" | "assistant"; texto: string }> {
  const ultimos = turnos.slice(-tope).map((t) => ({ rol: (t.rol === "CSE" ? "user" : "assistant") as "user" | "assistant", texto: (textoVisible(t.contenido) || t.contenido).trim() }));
  const desde = ultimos.findIndex((t) => t.rol === "user");
  return (desde < 0 ? [] : ultimos.slice(desde)).filter((t) => t.texto);
}

/**
 * El turno con el candado del hilo, el MISMO que toma aplicar (./candado-server.ts): un clic en «Aplicar» mientras corre
 * el turno no puede dejar que el turno vuelva a proponer lo que se acaba de aplicar. El hilo se relee CON el candado.
 */
/**
 * Lo que la persona señaló al abrir el chat (validación 71): la guía de la próxima sesión de una exploración. Su texto va
 * en el mensaje de ESTE turno (no en `system`: no rompe la caché), como información de la cuenta.
 */
export interface FocoDelChat {
  tipo: "guia";
  exploracionId: string;
}

/** El bloque de la guía para el mensaje, si la exploración es de esta cuenta. null = nada que sumar. */
async function bloqueDelFoco(foco: FocoDelChat | undefined, clientId: string): Promise<string> {
  if (!foco) return "";
  const f = await prisma.exploracionDeVenta.findUnique({ where: { id: foco.exploracionId }, select: { clientId: true } });
  if (!f || f.clientId !== clientId) return "";
  const guia = await guiaParaElChat(foco.exploracionId).catch(() => null);
  if (!guia) return "";
  return `[LA PERSONA ABRIÓ EL CHAT DESDE LA GUÍA — lo escribe Nexus, no la persona]\n${comoInformacion(guia)}\n\n`;
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

async function correrTurno(
  hilo: HiloConTurnos,
  mensajeCrudo: string,
  quien: { persona: TeamMember; clientId: string; veMontos: boolean },
  ahora: Date,
  foco?: FocoDelChat,
): Promise<ResultadoDelTurnoDeNexus> {
  const mensaje = sinMarcadores(mensajeCrudo).trim();
  const { persona, clientId } = quien;
  const ctx = contextoDelChat(persona, quien.veMontos, ahora);

  // 1. Lo pendiente, revalidado contra hoy: lo que ya no se puede se cae con su motivo.
  const vivas: CambioPropuesto[] = [];
  const caidas: Array<{ linea: string; motivo: string }> = [];
  for (const p of pendientesDeNexus(hilo.turnos)) {
    const r = await prepararParaLaCuenta(ctx, clientId, p.nombre, p.entrada);
    if (r.ok) vivas.push(r.cambio);
    else caidas.push({ linea: p.linea, motivo: r.motivo });
  }

  // 2. El contexto y la corrida.
  const saber = await loQueSeSabeDeLaCuenta(clientId);
  if (!saber) throw new Error("La cuenta no existe.");
  const contexto = contextoDeLaCuenta({
    ahora,
    persona: { nombre: persona.name, email: persona.email, rol: String(persona.roleEnum), equipos: persona.area ? [persona.area] : [] },
    cuenta: saber.cuenta,
    proyectos: saber.proyectos,
    memoria: saber.memoria,
  });
  const sha = huellaDeContexto(contexto);
  const run = await prisma.agentRun.create({
    data: { agentSlug: SLUG_DEL_CHAT_DE_NEXUS, clientId, triggeredByEmail: hilo.usuarioEmail, status: "RUNNING", stepLabel: "Chat de Nexus", currentPhase: "Leyendo la cuenta…" },
    select: { id: true },
  });

  try {
    // 3. El pedido: la ventana del hilo (con su breakpoint), y lo pendiente + el mensaje de la persona.
    const ventana = ventanaDelHilo(hilo.turnos);
    const historia: Anthropic.Messages.MessageParam[] = ventana.map((t, i) =>
      i === ventana.length - 1 ? { role: t.rol, content: [{ type: "text" as const, text: t.texto, cache_control: { type: "ephemeral" as const } }] } : { role: t.rol, content: t.texto },
    );
    const guia = await bloqueDelFoco(foco, clientId);
    const messages: Anthropic.Messages.MessageParam[] = [...historia, { role: "user", content: `${bloqueDeLoPendiente(vivas.map((v) => v.linea))}${guia}${mensaje}` }];
    const tools = herramientasDelChat();
    const llamar = (msgs: Anthropic.Messages.MessageParam[], o: { sinHerramientas: boolean }) =>
      conContextoDeIA({ agentSlug: SLUG_DEL_CHAT_DE_NEXUS, agentRunId: run.id, clientId, triggeredByEmail: hilo.usuarioEmail, origen: origenDelHilo(hilo.id) }, () =>
        getAnthropic().messages.create({
          model: hilo.modelo,
          max_tokens: MAX_TOKENS_DE_RESPUESTA,
          /* Dos breakpoints en `system` (el prompt, igual para todos; la cuenta, que cambia con su memoria) y uno en
             `messages` (el último de la ventana). Las herramientas van antes del prompt y siempre en el mismo orden. */
          system: [
            { type: "text", text: PROMPT_DE_NEXUS, cache_control: { type: "ephemeral" } },
            { type: "text", text: `TU CONTEXTO\n\n${contexto}`, cache_control: { type: "ephemeral" } },
          ],
          tools,
          // La última vuelta contesta con lo que ya leyó.
          ...(o.sinHerramientas ? { tool_choice: { type: "none" as const } } : {}),
          messages: msgs,
        }),
      );

    const b = await correrBucle({
      llamar,
      ejecutor: ejecutorDelChat(ctx, clientId),
      mensajes: messages,
      maxVueltas: TOPES_DEL_CHAT.vueltasPorTurno,
      maxCambios: TOPES_DEL_CHAT.cambiosPorLista,
      yaPendientes: vivas.length,
    });

    // 4. La lista y los turnos.
    const acuerdo = componerAcuerdo({ vivas, caidas, descartar: b.descartar, nuevos: b.propuestos });
    let respuesta = sinMarcadores(b.texto);
    if (b.stop === "refusal") respuesta = "No puedo ayudarte con eso en este chat.";
    const aviso = avisoDeRechazos(b.rechazados);
    if (aviso) respuesta = `${respuesta.trim()}\n\n${aviso}`;
    if (caidas.length) respuesta = `${respuesta.trim()}\n\n⚠ Salió de la lista porque cambió: ${caidas.map((c) => `${c.linea} (${c.motivo})`).join(" · ")}`;
    if (!respuesta.trim()) respuesta = acuerdo?.resumen ?? "(Nexus no devolvió texto)";

    // El turno de la persona se guarda solo si el modelo contestó (un error no cuenta en el tope).
    await agregarTurno(hilo.id, { rol: "CSE", contenido: mensaje, shaDeContexto: sha });
    await agregarTurno(hilo.id, { rol: "ASISTENTE", contenido: acuerdo ? `${respuesta.trim()}\n\n${marcaDeAcuerdo(acuerdo)}` : respuesta.trim(), shaDeContexto: sha });

    const costo = await costoDeLaCorrida(run.id).catch(() => ({ usd: 0, llamadas: 0 }));
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        currentPhase: null,
        output: JSON.stringify({
          hiloId: hilo.id,
          vueltas: b.vueltas,
          herramientas: b.herramientas,
          propuestos: b.propuestos.length,
          rechazados: b.rechazados.length,
          enLaLista: acuerdo?.operaciones?.length ?? 0,
          costoUsd: costo.usd,
          llamadas: costo.llamadas,
        }),
      },
    });
    return { respuesta: respuesta.trim(), acuerdo, costoUsd: costo.usd };
  } catch (e) {
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ hiloId: hilo.id, error: e instanceof Error ? e.message : String(e) }) } })
      .catch(() => {});
    throw e;
  }
}
