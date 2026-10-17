/**
 * lib/seguimiento/reunion/correo-server.ts — arma el correo de seguimiento de UNA reunión con un cliente, desde su
 * página, y lo guarda en `SeguimientoDeReunion`. SERVIDOR. Ficha G (2026-10-17).
 *
 * Reúsa el correo de las exploraciones (DECISIONS «El correo de seguimiento después de una reunión de exploración»):
 * el mismo agente, el mismo pedido (`marco: "reunion"` para un cliente, `"venta"` para un prospecto) y las mismas
 * reglas, por `escribirElCorreoDeSeguimiento`. Lo único que cambia es de dónde salen sus insumos, porque esta reunión no
 * es parte de una exploración:
 *   · la reunión sale del chokepoint (`reunionParaLaTarjeta` + `reunionParaElCorreo`): con dueño, de un cliente o un
 *     prospecto, que ya empezó y que no fue de puertas adentro;
 *   · lo que se acordó y los compromisos, de ESA reunión (`loQueDejoLaReunion`: su minuta sin riesgos ni montos y lo
 *     que guardó su lectura de seguimiento, sin la cita), solo si fue CON EL CLIENTE. ⛔ Nunca Tareas ni hechos;
 *   · lo que ya se sabe de la cuenta, con el alcance del CLIENTE (lector «correo» de lib/memoria);
 *   · la próxima reunión: la que la persona ya agendó desde esta página, si tiene fecha que no pasó.
 * Además le pide al agente la próxima reunión sugerida (título y objetivo); si nadie la tocó, queda guardada.
 * Se arma a pedido, con un botón: nunca solo. Nexus no envía nada.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { conLaReunion } from "@/lib/ai/contexto-de-corrida";
import { memoriaDeLaCuenta } from "@/lib/memoria";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { recortarTranscripcion } from "@/lib/sessions/recortar-transcripcion";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { etiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { dominiosDeLaCasa, reunionParaLaTarjeta } from "@/lib/sessions/reuniones-para-seguimiento";
import { reunionParaElCorreo } from "@/lib/sessions/reunion-para-su-pagina";
import { paraDeLaReunion, MAX_ASUNTO_DEL_CORREO, MAX_CUERPO_DEL_CORREO, type InsumosDelCorreo } from "@/lib/exploraciones/correo-de-seguimiento";
import type { ContextoDelCorreo } from "@/lib/exploraciones/correo-de-seguimiento-pedido";
import { escribirElCorreoDeSeguimiento, loQueDejoLaReunion, nombreDe } from "@/lib/exploraciones/correo-de-seguimiento-server";
import { nombresDelEquipo } from "@/lib/exploraciones/agente";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { SIN_CONVERSACION_EN_LA_REUNION, type CorreoDeLaReunion } from "./correo";
import { guardarCorreo, guardarProximaDelAgente, leerSeguimiento } from "./guardado-server";
import { proximaAgendadaParaElCorreo, proximaDelAgente } from "./proxima";

/** Los topes del asunto y del texto: los mismos del correo de las exploraciones. */
export { MAX_ASUNTO_DEL_CORREO, MAX_CUERPO_DEL_CORREO };

/** El agente en el medidor de costos y en las corridas. */
export const AGENTE_DEL_CORREO_DE_LA_REUNION = "reunion-correo-de-seguimiento";

export type ResultadoDelCorreoDeLaReunion = { ok: true; correo: CorreoDeLaReunion } | { ok: false; status: number; error: string };

export async function armarCorreoDeLaReunion(o: { sessionId: string; dueno: string; email: string | null }): Promise<ResultadoDelCorreoDeLaReunion> {
  const tarjeta = await reunionParaLaTarjeta(o.sessionId);
  // Sin dueño, de un aliado o de Smarteam, de puertas adentro o que todavía no ocurre: no hay correo que mandarle al cliente.
  if (!tarjeta || tarjeta.clientId !== o.dueno) {
    return { ok: false, status: 409, error: "Esta reunión no lleva correo de seguimiento: no fue con un cliente o un prospecto, o todavía no ocurre." };
  }
  const reunion = await reunionParaElCorreo(o.sessionId, o.dueno);
  if (!reunion) return { ok: false, status: 404, error: "No encuentro esa reunión." };

  const dominios = await dominiosDeLaCasa();
  if (esReunionDePuertasAdentro({ participants: reunion.participantes }, dominios)) {
    return { ok: false, status: 409, error: "Esta reunión fue solo con gente de Smarteam: no hay un correo que mandarle al cliente." };
  }
  const notas = await fetchTranscriptContent(reunion.id, reunion.titulo, { maxChars: 14_000 });
  const texto = recortarTranscripcion(notas ?? "", reunion.transcripcion ?? "");
  if (!texto.trim()) return { ok: false, status: 409, error: "Esta reunión no tiene qué leer: no hay de dónde armar el correo." };

  const projectId = tarjeta.proyectos[0]?.id ?? null;
  const conElCliente = etiquetaDeSala({ participants: reunion.participantes }, dominios) === "CON EL CLIENTE";
  const hoy = hoyEnCostaRica();
  const [deLaReunion, cuenta, guardado, firma, equipo] = await Promise.all([
    conElCliente ? loQueDejoLaReunion(reunion.id) : Promise.resolve(null),
    // Con el alcance del CLIENTE: el correo lo lee el cliente. Para no repreguntar lo que ya se sabe.
    memoriaDeLaCuenta(o.dueno, { lector: "correo", projectId })
      .then((m) => m.texto)
      .catch(() => ""),
    leerSeguimiento(reunion.id),
    nombreDe(o.email),
    nombresDelEquipo(),
  ]);

  const insumos: InsumosDelCorreo = {
    resumen: null,
    minuta: deLaReunion?.minuta ?? null,
    compromisos: deLaReunion?.compromisos ?? [],
    cuenta: cuenta.trim(),
    respuestas: [],
    // Esta reunión no tiene una guía con preguntas planeadas: lo que quedó abierto lo saca el agente de la reunión.
    preguntasAbiertas: [],
    siguientePaso: null,
    proxima: proximaAgendadaParaElCorreo(guardado.proxima, hoy),
  };
  const para = paraDeLaReunion(reunion.participantes);
  const ctx: ContextoDelCorreo = {
    marco: tarjeta.empresa.kind === "PROSPECTO" ? "venta" : "reunion",
    pedirProxima: true,
    empresa: tarjeta.empresa.nombre,
    reunion: { titulo: reunion.titulo, fecha: reunion.fecha.toISOString() },
    firma,
    equipo,
    para,
    hoy,
    insumos,
    reunionTexto: texto,
  };

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DEL_CORREO_DE_LA_REUNION,
      clientId: o.dueno,
      projectId,
      status: "RUNNING",
      stepLabel: "Reunión: correo de seguimiento",
      currentPhase: "Escribiendo el correo…",
      triggeredByEmail: o.email,
      sourceSessionIds: [reunion.id],
      filters: { sessionId: reunion.id } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  try {
    const escrito = await conLaReunion(reunion.id, () =>
      escribirElCorreoDeSeguimiento(ctx, firma, {
        agentSlug: AGENTE_DEL_CORREO_DE_LA_REUNION,
        agentRunId: run.id,
        clientId: o.dueno,
        projectId,
        triggeredByEmail: o.email,
        origen: "sessions/correo",
      }),
    );
    if (escrito === "sin-conversacion") {
      await guardarCorreo(reunion.id, null);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", currentPhase: null, output: JSON.stringify({ sinConversacion: true }) } });
      return { ok: false, status: 409, error: SIN_CONVERSACION_EN_LA_REUNION };
    }
    const correo: CorreoDeLaReunion = { asunto: escrito.armado.asunto, cuerpo: escrito.armado.cuerpo, para, en: new Date().toISOString(), corridaId: run.id };
    await guardarCorreo(reunion.id, correo);
    const proxima = proximaDelAgente(escrito.entrada);
    if (proxima) await guardarProximaDelAgente(reunion.id, proxima);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        currentPhase: null,
        output: JSON.stringify({ asunto: correo.asunto, proximosPasos: escrito.partes.proximosPasos.length, para: para.length, proxima: !!proxima }),
      },
    });
    return { ok: true, correo };
  } catch (e) {
    const error = e instanceof Error ? e.message : "No se pudo armar el correo.";
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error }) } })
      .catch(() => {});
    console.error("[sessions/correo] no se pudo armar", e);
    return { ok: false, status: 502, error: "No se pudo armar el correo. Vuelve a intentarlo." };
  }
}
