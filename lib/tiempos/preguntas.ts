/**
 * lib/tiempos/preguntas.ts — responder, omitir, pasarle la pregunta a quien hizo la tarea y «lo que tengo sin
 * anotar». SERVIDOR.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { familiaPorClave } from "./familias";
import {
  claveReasignada,
  cuandoFue,
  familiaDeLaClave,
  formatoMinutos,
  leerConfig,
  nombreDeTipo,
  textoDelEstimadoGuardado,
  venceEn,
  type Documento,
  type Momento,
} from "./reglas";
import { crearOReabrir } from "./disparar";
import { ErrorDeTiempos, estimacionDeDocumento, personaQueResponde } from "./servidor";
import type { RespuestaInput } from "./schema";
import type { PreguntaParaResponder } from "./tipos";

/**
 * Responder u omitir una pregunta propia. Se puede cambiar lo respondido; una retirada ya no cuenta.
 *
 * «No lo hice yo» con `quien`: la pregunta queda omitida para quien marcó la tarea y nace una igual para quien la hizo
 * (clave `<clave>:<correo>`), con tres días para contestar. Así el tiempo lo dice quien lo sabe. Solo a alguien activo
 * del equipo y nunca a uno mismo.
 */
export async function responderPregunta(id: string, email: string, input: RespuestaInput, ahora = new Date()): Promise<{ pasoA: string | null }> {
  const p = await prisma.preguntaDeTiempo.findUnique({
    where: { id },
    select: {
      personaEmail: true,
      estado: true,
      encuestaId: true,
      clave: true,
      estimadoMinutos: true,
      projectId: true,
      clientId: true,
      taskId: true,
      documento: true,
      tipoFase: true,
      party: true,
      titulo: true,
      ocurrioAt: true,
      lote: true,
    },
  });
  if (!p) throw new ErrorDeTiempos(404, "Esa pregunta ya no existe.");
  const yo = email.toLowerCase();
  if (p.personaEmail !== yo) throw new ErrorDeTiempos(403, "Esa pregunta es de otra persona.");
  if (p.estado === "retirada") throw new ErrorDeTiempos(409, "La tarea se desmarcó: esa pregunta ya no cuenta.");

  let pasoA: string | null = null;
  if (input.accion === "omitir" && input.motivo === "no_lo_hice" && input.quien && input.quien !== yo) {
    const quien = await personaQueResponde(input.quien);
    if (!quien) throw new ErrorDeTiempos(400, "Esa persona no está activa en el equipo.");
    const nueva = await crearOReabrir(p.encuestaId, claveReasignada(p.clave, quien.email), {
      personaEmail: quien.email,
      rol: quien.rol,
      estimadoMinutos: p.estimadoMinutos,
      projectId: p.projectId,
      clientId: p.clientId,
      taskId: p.taskId,
      documento: p.documento,
      tipoFase: p.tipoFase,
      party: p.party,
      titulo: p.titulo,
      origen: "reasignada",
      lote: null,
      ocurrioAt: p.ocurrioAt,
      venceAt: venceEn(ahora),
    });
    if (nueva) {
      pasoA = quien.email;
      olvidarMedicion(quien.email);
    }
  }

  await prisma.preguntaDeTiempo.update({
    where: { id },
    data:
      input.accion === "responder"
        ? { estado: "respondida", minutos: input.minutos, motivoOmision: null, respondidaAt: ahora }
        : { estado: "omitida", motivoOmision: input.motivo, minutos: null, respondidaAt: ahora },
  });
  // «Para ti» guarda su medición dos minutos: sin esto, lo recién anotado seguiría ahí.
  olvidarMedicion(email);
  return { pasoA };
}

/** El contexto de una pregunta: «Grupo Inve · Configuración · marcada el miércoles». */
function contextoDe(momento: Momento, f: { tipoFase: string | null; clave: string; ocurrioAt: Date; origen: string; client: { name: string } | null }, ahora: Date): string {
  if (momento === "ARRANQUE") return ""; // lo dice la cabecera del formulario: «Piensa en una cuenta típica…»
  const esTarea = momento === "TAREA_HECHA";
  return [
    f.client?.name ?? null,
    esTarea ? nombreDeTipo(f.tipoFase) : null,
    f.origen === "reasignada" ? "te la pasaron: la hiciste tú" : `${esTarea ? "marcada" : "lo publicaste"} ${cuandoFue(f.ocurrioAt, ahora)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Lo que la persona tiene sin anotar y todavía no venció: lo que muestra «Para ti». */
export async function misPreguntasPendientes(email: string, ahora = new Date()): Promise<PreguntaParaResponder[]> {
  const filas = await prisma.preguntaDeTiempo.findMany({
    where: { personaEmail: email.toLowerCase(), estado: "pendiente", venceAt: { gt: ahora } },
    orderBy: { ocurrioAt: "asc" },
    take: 50,
    select: {
      id: true,
      clave: true,
      titulo: true,
      tipoFase: true,
      documento: true,
      taskId: true,
      lote: true,
      origen: true,
      estimadoMinutos: true,
      ocurrioAt: true,
      venceAt: true,
      encuesta: { select: { id: true, momento: true, config: true } },
      client: { select: { name: true } },
    },
  });
  return filas.map((f) => {
    const momento = f.encuesta.momento as Momento;
    const config = leerConfig(f.encuesta.config, momento);
    const familia = momento === "ARRANQUE" ? familiaPorClave(familiaDeLaClave(f.clave)) : null;
    return {
      id: f.id,
      momento,
      pregunta: config.pregunta,
      titulo: familia?.enLaPregunta ?? f.titulo,
      contexto: contextoDe(momento, f, ahora),
      opciones: config.opciones,
      estimacion: {
        modo: config.estimacion,
        texto:
          momento === "DOCUMENTO_PUBLICADO"
            ? estimacionDeDocumento(f.estimadoMinutos, (f.documento ?? "kickoff") as Documento)
            : momento === "ARRANQUE"
              ? f.estimadoMinutos
                ? `La carga supone hoy ${formatoMinutos(f.estimadoMinutos)} para esta tarea, antes del factor de la cuenta.`
                : null
              : textoDelEstimadoGuardado(f.estimadoMinutos),
      },
      taskId: f.taskId,
      lote: f.lote,
      venceAt: f.venceAt.toISOString(),
    };
  });
}
