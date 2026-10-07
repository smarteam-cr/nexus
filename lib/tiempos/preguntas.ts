/**
 * lib/tiempos/preguntas.ts — responder, omitir y «lo que tengo sin anotar». SERVIDOR.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { cuandoFue, leerConfig, nombreDeTipo, type Documento, type Momento } from "./reglas";
import { calibracionActual, ErrorDeTiempos, estimacionDeDocumento, estimacionDeTarea, encuestaDe } from "./servidor";
import type { RespuestaInput } from "./schema";
import type { PreguntaParaResponder } from "./tipos";

/** Responder u omitir una pregunta propia. Se puede cambiar lo respondido; una retirada ya no cuenta. */
export async function responderPregunta(id: string, email: string, input: RespuestaInput, ahora = new Date()): Promise<void> {
  const p = await prisma.preguntaDeTiempo.findUnique({ where: { id }, select: { personaEmail: true, estado: true } });
  if (!p) throw new ErrorDeTiempos(404, "Esa pregunta ya no existe.");
  if (p.personaEmail !== email.toLowerCase()) throw new ErrorDeTiempos(403, "Esa pregunta es de otra persona.");
  if (p.estado === "retirada") throw new ErrorDeTiempos(409, "La tarea se desmarcó: esa pregunta ya no cuenta.");
  await prisma.preguntaDeTiempo.update({
    where: { id },
    data:
      input.accion === "responder"
        ? { estado: "respondida", minutos: input.minutos, motivoOmision: null, respondidaAt: ahora }
        : { estado: "omitida", motivoOmision: input.motivo, minutos: null, respondidaAt: ahora },
  });
  // «Para ti» guarda su medición dos minutos: sin esto, lo recién anotado seguiría ahí.
  olvidarMedicion(email);
}

/** Lo que la persona tiene sin anotar y todavía no venció: lo que muestra «Para ti». */
export async function misPreguntasPendientes(email: string, ahora = new Date()): Promise<PreguntaParaResponder[]> {
  const filas = await prisma.preguntaDeTiempo.findMany({
    where: { personaEmail: email.toLowerCase(), estado: "pendiente", venceAt: { gt: ahora } },
    orderBy: { ocurrioAt: "asc" },
    take: 50,
    select: {
      id: true,
      titulo: true,
      tipoFase: true,
      documento: true,
      taskId: true,
      lote: true,
      ocurrioAt: true,
      venceAt: true,
      encuesta: { select: { id: true, momento: true, config: true } },
      client: { select: { name: true } },
    },
  });
  if (filas.length === 0) return [];
  const tareas = await encuestaDe("TAREA_HECHA");
  const cal = await calibracionActual(tareas.id);
  return filas.map((f) => {
    const momento = f.encuesta.momento as Momento;
    const config = leerConfig(f.encuesta.config, momento);
    const esTarea = momento === "TAREA_HECHA";
    return {
      id: f.id,
      momento,
      pregunta: config.pregunta,
      titulo: f.titulo,
      contexto: [
        f.client?.name ?? null,
        esTarea ? nombreDeTipo(f.tipoFase) : null,
        `${esTarea ? "marcada" : "lo publicaste"} ${cuandoFue(f.ocurrioAt, ahora)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      opciones: config.opciones,
      estimacion: {
        modo: config.estimacion,
        texto: esTarea ? estimacionDeTarea(cal, f.tipoFase).texto : estimacionDeDocumento(null, (f.documento ?? "kickoff") as Documento),
      },
      taskId: f.taskId,
      lote: f.lote,
      venceAt: f.venceAt.toISOString(),
    };
  });
}
