/**
 * lib/trivias/mutations.ts — las escrituras de Trivias: el ÚNICO lugar que escribe sus tablas. SERVIDOR.
 *
 * Todas reciben `ahora` (por defecto el reloj del servidor) para que las pruebas fijen el tiempo; nunca se usa una
 * hora que mande el navegador. Las reglas (si la respuesta vale, cuántos puntos, a dónde avanza la partida) son las de
 * reglas.ts; la base sostiene las dos que no pueden fallar con dos pedidos a la vez: un jugador por persona y partida
 * (`JugadorDeTrivia_partidaId_teamMemberId_key`) y una respuesta por jugador y pregunta
 * (`RespuestaDeTrivia_jugadorId_pregunta_key`).
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esUnicoViolado as esDuplicado } from "@/lib/db/unico-violado";
import { ErrorDeTrivias } from "./error";
import {
  MENSAJE_DEL_RECHAZO,
  codigoDesdeBytes,
  decidirIngreso,
  evaluarRespuesta,
  siguientePaso,
  type RechazoDeRespuesta,
} from "./reglas";
import { leerPreguntasJugadas, type TriviaInput } from "./schema";
import { problemaDeLaPregunta } from "./validar";
import type { AccionDelAnfitrion } from "./schema";
import type { EstadoDePartida, ModoDePuntos, TipoDePregunta } from "./tipos";


function filasDePreguntas(input: TriviaInput) {
  return input.preguntas.map((p, orden) => ({
    orden,
    tipo: p.tipo,
    texto: p.texto,
    opciones: p.opciones,
    correctas: p.correctas,
    segundos: p.segundos,
  }));
}

// ── Las trivias ─────────────────────────────────────────────────────────────

export async function crearTrivia(input: TriviaInput, teamMemberId: string): Promise<{ id: string }> {
  return prisma.trivia.create({
    data: { titulo: input.titulo, creadaPorId: teamMemberId, preguntas: { create: filasDePreguntas(input) } },
    select: { id: true },
  });
}

/** Reemplaza el título y TODAS las preguntas. Las partidas ya jugadas no cambian: guardan su copia. */
export async function guardarTrivia(id: string, input: TriviaInput, teamMemberId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await tx.trivia.findFirst({ where: { id, creadaPorId: teamMemberId }, select: { id: true } });
    if (!t) throw new ErrorDeTrivias("No encontramos esa trivia.", 404);
    await tx.preguntaDeTrivia.deleteMany({ where: { triviaId: id } });
    await tx.preguntaDeTrivia.createMany({ data: filasDePreguntas(input).map((f) => ({ ...f, triviaId: id })) });
    await tx.trivia.update({ where: { id }, data: { titulo: input.titulo } });
  });
}

/** Borra la trivia; sus partidas quedan en el historial con su copia de las preguntas. */
export async function borrarTrivia(id: string, teamMemberId: string): Promise<void> {
  const { count } = await prisma.trivia.deleteMany({ where: { id, creadaPorId: teamMemberId } });
  if (count === 0) throw new ErrorDeTrivias("No encontramos esa trivia.", 404);
}

// ── Lanzar ──────────────────────────────────────────────────────────────────

const INTENTOS_DE_CODIGO = 5;

/** Crea la partida en la sala de espera con un código nuevo y la COPIA de las preguntas. Solo quien creó la trivia. */
export async function lanzarPartida(
  triviaId: string,
  modo: ModoDePuntos,
  teamMemberId: string,
): Promise<{ id: string; codigo: string }> {
  const t = await prisma.trivia.findFirst({
    where: { id: triviaId, creadaPorId: teamMemberId },
    select: {
      titulo: true,
      preguntas: {
        orderBy: { orden: "asc" },
        select: { tipo: true, texto: true, opciones: true, correctas: true, segundos: true },
      },
    },
  });
  if (!t) throw new ErrorDeTrivias("No encontramos esa trivia.", 404);
  const preguntas = t.preguntas.map((p) => ({ ...p, tipo: p.tipo as TipoDePregunta }));
  if (preguntas.length === 0) throw new ErrorDeTrivias("La trivia no tiene preguntas: agrega al menos una.", 409);
  for (let i = 0; i < preguntas.length; i++) {
    const problema = problemaDeLaPregunta(preguntas[i], i + 1);
    if (problema) throw new ErrorDeTrivias(problema, 409);
  }
  for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento++) {
    const codigo = codigoDesdeBytes(randomBytes(8));
    try {
      return await prisma.partidaDeTrivia.create({
        data: {
          codigo,
          triviaId,
          anfitrionId: teamMemberId,
          titulo: t.titulo,
          preguntas: preguntas as unknown as Prisma.InputJsonValue,
          modo,
        },
        select: { id: true, codigo: true },
      });
    } catch (e) {
      if (!esDuplicado(e)) throw e; // el código ya existía: se prueba otro
    }
  }
  throw new ErrorDeTrivias("No pudimos generar un código libre; prueba de nuevo.", 503);
}

// ── El anfitrión avanza ─────────────────────────────────────────────────────

export async function avanzarPartida(
  partidaId: string,
  teamMemberId: string,
  input: { accion: AccionDelAnfitrion; desde: { estado: EstadoDePartida; pregunta: number } },
  ahora: Date = new Date(),
): Promise<void> {
  const p = await prisma.partidaDeTrivia.findFirst({
    where: { id: partidaId, anfitrionId: teamMemberId },
    select: { estado: true, preguntaActual: true, preguntaAbiertaAt: true, preguntaCierraAt: true, preguntas: true },
  });
  if (!p) throw new ErrorDeTrivias("No encontramos esa partida.", 404);
  if (p.estado !== input.desde.estado || p.preguntaActual !== input.desde.pregunta) {
    throw new ErrorDeTrivias("La partida ya avanzó; la pantalla se pone al día sola.", 409);
  }
  const reloj = {
    estado: p.estado as EstadoDePartida,
    preguntaActual: p.preguntaActual,
    preguntaAbiertaAt: p.preguntaAbiertaAt,
    preguntaCierraAt: p.preguntaCierraAt,
  };
  const paso = siguientePaso(reloj, input.accion, leerPreguntasJugadas(p.preguntas), ahora);
  if (!paso.ok) throw new ErrorDeTrivias(paso.mensaje, 409);
  // Solo si nadie la movió entre la lectura y esta escritura (otro clic, otra pestaña, el último en responder).
  const { count } = await prisma.partidaDeTrivia.updateMany({
    where: {
      id: partidaId,
      anfitrionId: teamMemberId,
      estado: p.estado,
      preguntaActual: p.preguntaActual,
      preguntaCierraAt: p.preguntaCierraAt,
    },
    data: paso.cambio,
  });
  if (count === 0) throw new ErrorDeTrivias("La partida ya avanzó; la pantalla se pone al día sola.", 409);
}

// ── El jugador ──────────────────────────────────────────────────────────────

/** Entra a la partida (o vuelve a entrar desde otro dispositivo: es la misma participación). */
export async function unirseAPartida(
  codigo: string,
  persona: { teamMemberId: string; nombre: string },
): Promise<{ partidaId: string; jugadorId: string }> {
  const p = await prisma.partidaDeTrivia.findUnique({ where: { codigo }, select: { id: true, estado: true } });
  if (!p) throw new ErrorDeTrivias("No hay una partida con ese código.", 404);
  const clave = { partidaId_teamMemberId: { partidaId: p.id, teamMemberId: persona.teamMemberId } };
  const existente = await prisma.jugadorDeTrivia.findUnique({ where: clave, select: { id: true } });
  const decision = decidirIngreso(p.estado as EstadoDePartida, existente !== null);
  if (decision === "reusar" && existente) return { partidaId: p.id, jugadorId: existente.id };
  if (decision === "terminada") throw new ErrorDeTrivias("Esta partida ya terminó.", 409);
  try {
    const nuevo = await prisma.jugadorDeTrivia.create({
      data: { partidaId: p.id, teamMemberId: persona.teamMemberId, nombre: persona.nombre },
      select: { id: true },
    });
    return { partidaId: p.id, jugadorId: nuevo.id };
  } catch (e) {
    // Dos dispositivos entraron a la vez: el otro ya la creó, y es la misma participación.
    if (!esDuplicado(e)) throw e;
    const ya = await prisma.jugadorDeTrivia.findUnique({ where: clave, select: { id: true } });
    if (!ya) throw e;
    return { partidaId: p.id, jugadorId: ya.id };
  }
}

const ESTADO_DEL_RECHAZO: Record<RechazoDeRespuesta, number> = {
  "fuera-de-pregunta": 409,
  "otra-pregunta": 409,
  "tiempo-agotado": 409,
  "ya-respondiste": 409,
  "opcion-invalida": 400,
};

/**
 * Guarda la respuesta si vale (reglas.ts › evaluarRespuesta, con el reloj del servidor). Si con ella ya respondieron
 * todos, cierra la pregunta adelantando `preguntaCierraAt`. No devuelve si acertó: eso se ve cuando la pregunta cierra.
 */
export async function responder(
  codigo: string,
  teamMemberId: string,
  input: { pregunta: number; opcion: number },
  ahora: Date = new Date(),
): Promise<void> {
  const p = await prisma.partidaDeTrivia.findUnique({
    where: { codigo },
    select: {
      id: true,
      modo: true,
      estado: true,
      preguntas: true,
      preguntaActual: true,
      preguntaAbiertaAt: true,
      preguntaCierraAt: true,
    },
  });
  if (!p) throw new ErrorDeTrivias("No hay una partida con ese código.", 404);
  const jugador = await prisma.jugadorDeTrivia.findUnique({
    where: { partidaId_teamMemberId: { partidaId: p.id, teamMemberId } },
    select: { id: true },
  });
  if (!jugador) throw new ErrorDeTrivias("Entra a la partida para responder.", 409);
  const ya = await prisma.respuestaDeTrivia.findUnique({
    where: { jugadorId_pregunta: { jugadorId: jugador.id, pregunta: input.pregunta } },
    select: { id: true },
  });
  const r = evaluarRespuesta({
    partida: {
      estado: p.estado as EstadoDePartida,
      modo: p.modo as ModoDePuntos,
      preguntaActual: p.preguntaActual,
      preguntaAbiertaAt: p.preguntaAbiertaAt,
      preguntaCierraAt: p.preguntaCierraAt,
    },
    pregunta: leerPreguntasJugadas(p.preguntas)[input.pregunta],
    indice: input.pregunta,
    opcion: input.opcion,
    ahora,
    yaRespondio: ya !== null,
  });
  if (!r.ok) throw new ErrorDeTrivias(MENSAJE_DEL_RECHAZO[r.rechazo], ESTADO_DEL_RECHAZO[r.rechazo]);
  try {
    await prisma.respuestaDeTrivia.create({
      data: {
        partidaId: p.id,
        jugadorId: jugador.id,
        pregunta: input.pregunta,
        opcion: input.opcion,
        esCorrecta: r.esCorrecta,
        puntos: r.puntos,
        tardoMs: r.tardoMs,
      },
    });
  } catch (e) {
    // Dos toques a la vez (o dos dispositivos): la base deja pasar uno solo.
    if (esDuplicado(e)) throw new ErrorDeTrivias(MENSAJE_DEL_RECHAZO["ya-respondiste"], 409);
    throw e;
  }
  const [respondieron, jugadores] = await Promise.all([
    prisma.respuestaDeTrivia.count({ where: { partidaId: p.id, pregunta: input.pregunta } }),
    prisma.jugadorDeTrivia.count({ where: { partidaId: p.id } }),
  ]);
  if (respondieron >= jugadores) {
    await prisma.partidaDeTrivia.updateMany({
      where: { id: p.id, estado: "PREGUNTA", preguntaActual: input.pregunta, preguntaCierraAt: { gt: ahora } },
      data: { preguntaCierraAt: ahora },
    });
  }
}
