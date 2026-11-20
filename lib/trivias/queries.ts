/**
 * lib/trivias/queries.ts — las lecturas de Trivias. SERVIDOR.
 *
 * Cada lectura filtra por la persona: una trivia la ve y la edita quien la creó; una partida (en vivo o su resultado)
 * la ve quien la condujo. El jugador solo ve el estado de la partida en la que está, por su código.
 * Lo que decide puntos, lugares y si la pregunta sigue abierta vive en reglas.ts: acá solo se lee y se arma.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  calcularPosiciones,
  distribucionDeRespuestas,
  hastaQuePreguntaCuenta,
  partidaAbandonada,
  podioDe,
  preguntaCerrada,
  tablaDePosiciones,
  type RelojDePartida,
} from "./reglas";
import { leerPreguntasJugadas } from "./schema";
import {
  type CabeceraDePartida,
  type EstadoDePartida,
  type EstadoParaAnfitrion,
  type EstadoParaJugador,
  type ModoDePuntos,
  type Posicion,
  type PreguntaDeTrivia,
  type PreguntaVisible,
  type TipoDePregunta,
} from "./tipos";

// ── Las trivias de quien mira ───────────────────────────────────────────────

export interface TriviaEnLista {
  id: string;
  titulo: string;
  preguntas: number;
  /** Las partidas que se llegaron a jugar (al menos una pregunta abierta). */
  partidas: number;
  updatedAt: string;
}

/** Una partida «jugada» es la que abrió al menos una pregunta: lanzarla y no empezar no cuenta. */
const JUGADA = { preguntaAbiertaAt: { not: null } } as const;

export async function listarTrivias(teamMemberId: string): Promise<TriviaEnLista[]> {
  const filas = await prisma.trivia.findMany({
    where: { creadaPorId: teamMemberId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      updatedAt: true,
      _count: { select: { preguntas: true, partidas: { where: JUGADA } } },
    },
  });
  return filas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    preguntas: t._count.preguntas,
    partidas: t._count.partidas,
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export interface TriviaParaEditar {
  id: string;
  titulo: string;
  preguntas: PreguntaDeTrivia[];
  /** Cuántas veces se jugó (sin tope: la tabla de partidas de abajo trae las últimas 50). */
  partidasJugadas: number;
}

/** La trivia con sus preguntas en orden, solo para quien la creó (si no, null: la página responde 404). */
export async function leerTrivia(id: string, teamMemberId: string): Promise<TriviaParaEditar | null> {
  const t = await prisma.trivia.findFirst({
    where: { id, creadaPorId: teamMemberId },
    select: {
      id: true,
      titulo: true,
      preguntas: {
        orderBy: { orden: "asc" },
        select: { tipo: true, texto: true, opciones: true, correctas: true, segundos: true },
      },
      _count: { select: { partidas: { where: JUGADA } } },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    titulo: t.titulo,
    preguntas: t.preguntas.map((p) => ({ ...p, tipo: p.tipo as TipoDePregunta })),
    partidasJugadas: t._count.partidas,
  };
}

// ── Las partidas de quien condujo ───────────────────────────────────────────

export interface PartidaEnLista {
  id: string;
  codigo: string;
  titulo: string;
  modo: ModoDePuntos;
  estado: EstadoDePartida;
  createdAt: string;
  jugadores: number;
  ganador: { nombre: string; puntos: number } | null;
  /** Nadie la terminó y lleva medio día quieta: ya no se muestra «en vivo». */
  abandonada: boolean;
}

export async function listarPartidas(
  teamMemberId: string,
  opciones: { triviaId?: string; limite?: number } = {},
): Promise<PartidaEnLista[]> {
  const partidas = await prisma.partidaDeTrivia.findMany({
    where: { anfitrionId: teamMemberId, ...(opciones.triviaId ? { triviaId: opciones.triviaId } : {}) },
    orderBy: { createdAt: "desc" },
    take: opciones.limite ?? 50,
    select: {
      id: true,
      codigo: true,
      titulo: true,
      modo: true,
      estado: true,
      createdAt: true,
      updatedAt: true,
      jugadores: { select: { id: true, nombre: true } },
    },
  });
  const ahora = new Date();
  if (partidas.length === 0) return [];
  const sumas = await prisma.respuestaDeTrivia.groupBy({
    by: ["partidaId", "jugadorId"],
    where: { partidaId: { in: partidas.map((p) => p.id) } },
    _sum: { puntos: true },
  });
  return partidas.map((p) => {
    const tabla = calcularPosiciones(
      p.jugadores,
      sumas
        .filter((s) => s.partidaId === p.id)
        .map((s) => ({ jugadorId: s.jugadorId, pregunta: 0, puntos: s._sum.puntos ?? 0, esCorrecta: null })),
      Number.MAX_SAFE_INTEGER,
    );
    const primero = tabla[0];
    return {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      modo: p.modo as ModoDePuntos,
      estado: p.estado as EstadoDePartida,
      createdAt: p.createdAt.toISOString(),
      jugadores: p.jugadores.length,
      ganador: primero && primero.puntos > 0 ? { nombre: primero.nombre, puntos: primero.puntos } : null,
      abandonada: partidaAbandonada(p.estado as EstadoDePartida, p.updatedAt, ahora),
    };
  });
}

/** Lo mínimo de una partida para decidir qué pantalla mostrar; null si no existe o no la condujo quien mira. */
export async function partidaDelAnfitrion(partidaId: string, teamMemberId: string) {
  return prisma.partidaDeTrivia.findFirst({
    where: { id: partidaId, anfitrionId: teamMemberId },
    select: { id: true, codigo: true, titulo: true, estado: true, triviaId: true },
  });
}

// ── El estado en vivo ───────────────────────────────────────────────────────

const SELECT_DE_PARTIDA = {
  id: true,
  codigo: true,
  titulo: true,
  modo: true,
  estado: true,
  preguntas: true,
  preguntaActual: true,
  preguntaAbiertaAt: true,
  preguntaCierraAt: true,
} as const;

type FilaDePartida = {
  id: string;
  codigo: string;
  titulo: string;
  modo: string;
  estado: string;
  preguntas: unknown;
  preguntaActual: number;
  preguntaAbiertaAt: Date | null;
  preguntaCierraAt: Date | null;
};

function reloj(p: FilaDePartida): RelojDePartida {
  return {
    estado: p.estado as EstadoDePartida,
    preguntaActual: p.preguntaActual,
    preguntaAbiertaAt: p.preguntaAbiertaAt,
    preguntaCierraAt: p.preguntaCierraAt,
  };
}

function cabecera(p: FilaDePartida, preguntas: PreguntaDeTrivia[], ahora: Date): CabeceraDePartida {
  return {
    codigo: p.codigo,
    titulo: p.titulo,
    modo: p.modo as ModoDePuntos,
    estado: p.estado as EstadoDePartida,
    preguntaActual: p.preguntaActual,
    totalDePreguntas: preguntas.length,
    abiertaAt: p.preguntaAbiertaAt?.getTime() ?? null,
    cierraAt: p.preguntaCierraAt?.getTime() ?? null,
    cerrada: preguntaCerrada(reloj(p), ahora),
  };
}

/** La pregunta en pantalla: en PREGUNTA y en POSICIONES (la tabla se muestra sobre la última pregunta). */
function preguntaEnPantalla(p: FilaDePartida, preguntas: PreguntaDeTrivia[]): PreguntaVisible | null {
  if (p.estado !== "PREGUNTA" && p.estado !== "POSICIONES") return null;
  const q = preguntas[p.preguntaActual];
  if (!q) return null;
  return { indice: p.preguntaActual, tipo: q.tipo, texto: q.texto, opciones: q.opciones, segundos: q.segundos };
}

async function posicionesHasta(
  partidaId: string,
  jugadores: { id: string; nombre: string }[],
  hasta: number,
): Promise<Posicion[]> {
  const respuestas =
    hasta < 0
      ? []
      : await prisma.respuestaDeTrivia.findMany({
          where: { partidaId, pregunta: { lte: hasta } },
          select: { jugadorId: true, pregunta: true, puntos: true, esCorrecta: true },
        });
  return calcularPosiciones(jugadores, respuestas, hasta);
}

/** Lo que ve la pantalla del anfitrión; null si la partida no existe o no la conduce quien pide. */
export async function estadoParaAnfitrion(
  partidaId: string,
  teamMemberId: string,
  ahora: Date,
): Promise<EstadoParaAnfitrion | null> {
  const p = await prisma.partidaDeTrivia.findFirst({
    where: { id: partidaId, anfitrionId: teamMemberId },
    select: SELECT_DE_PARTIDA,
  });
  if (!p) return null;
  const preguntas = leerPreguntasJugadas(p.preguntas);
  const cab = cabecera(p, preguntas, ahora);
  const jugadores = await prisma.jugadorDeTrivia.findMany({
    where: { partidaId: p.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, nombre: true },
  });

  const visible = preguntaEnPantalla(p, preguntas);
  let respondieron = 0;
  let distribucion: number[] | null = null;
  if (visible) {
    if (cab.cerrada) {
      const elegidas = await prisma.respuestaDeTrivia.findMany({
        where: { partidaId: p.id, pregunta: visible.indice },
        select: { opcion: true },
      });
      respondieron = elegidas.length;
      distribucion = distribucionDeRespuestas(visible.opciones.length, elegidas.map((e) => e.opcion));
    } else {
      respondieron = await prisma.respuestaDeTrivia.count({ where: { partidaId: p.id, pregunta: visible.indice } });
    }
  }

  let posiciones: Posicion[] = [];
  if (p.estado === "POSICIONES" || p.estado === "FINALIZADA") {
    const tabla = await posicionesHasta(p.id, jugadores, hastaQuePreguntaCuenta(reloj(p), ahora));
    posiciones = p.estado === "FINALIZADA" ? podioDe(tabla) : tablaDePosiciones(tabla);
  }

  return {
    ahora: ahora.getTime(),
    partida: { ...cab, id: p.id },
    jugadores,
    pregunta: visible
      ? { ...visible, correctas: cab.cerrada ? (preguntas[visible.indice]?.correctas ?? []) : null }
      : null,
    respondieron,
    distribucion,
    posiciones,
  };
}

/** Lo que ve el teléfono del jugador; null si no hay una partida con ese código. */
export async function estadoParaJugador(
  codigo: string,
  teamMemberId: string,
  ahora: Date,
): Promise<EstadoParaJugador | null> {
  const p = await prisma.partidaDeTrivia.findUnique({ where: { codigo }, select: SELECT_DE_PARTIDA });
  if (!p) return null;
  const preguntas = leerPreguntasJugadas(p.preguntas);
  const cab = cabecera(p, preguntas, ahora);
  const visible = preguntaEnPantalla(p, preguntas);
  const yo = await prisma.jugadorDeTrivia.findUnique({
    where: { partidaId_teamMemberId: { partidaId: p.id, teamMemberId } },
    select: { id: true, nombre: true },
  });

  let miRespuesta: EstadoParaJugador["miRespuesta"] = null;
  let resumen: EstadoParaJugador["yo"] = null;
  if (yo) {
    const [mia, jugadores] = await Promise.all([
      visible
        ? prisma.respuestaDeTrivia.findUnique({
            where: { jugadorId_pregunta: { jugadorId: yo.id, pregunta: visible.indice } },
            select: { opcion: true, esCorrecta: true, puntos: true },
          })
        : Promise.resolve(null),
      prisma.jugadorDeTrivia.findMany({ where: { partidaId: p.id }, select: { id: true, nombre: true } }),
    ]);
    if (mia) {
      miRespuesta = {
        opcion: mia.opcion,
        resultado: cab.cerrada ? { esCorrecta: mia.esCorrecta, puntos: mia.puntos } : null,
      };
    }
    const hasta = hastaQuePreguntaCuenta(reloj(p), ahora);
    // Suma en la base (una fila por jugador) en vez de traer cada respuesta: es la lectura que más se repite.
    const sumas =
      hasta < 0
        ? []
        : await prisma.respuestaDeTrivia.groupBy({
            by: ["jugadorId"],
            where: { partidaId: p.id, pregunta: { lte: hasta } },
            _sum: { puntos: true },
          });
    const tabla = calcularPosiciones(
      jugadores,
      sumas.map((s) => ({ jugadorId: s.jugadorId, pregunta: 0, puntos: s._sum.puntos ?? 0, esCorrecta: null })),
      Number.MAX_SAFE_INTEGER,
    );
    const mio = tabla.find((f) => f.jugadorId === yo.id);
    resumen = {
      nombre: yo.nombre,
      puntos: mio?.puntos ?? 0,
      lugar: hasta < 0 ? null : (mio?.lugar ?? null),
      jugadores: jugadores.length,
    };
  }

  return {
    ahora: ahora.getTime(),
    partida: cab,
    yo: resumen,
    pregunta: visible,
    miRespuesta,
    correctas: visible && cab.cerrada ? (preguntas[visible.indice]?.correctas ?? []) : null,
  };
}

// ── El resultado de una partida (historial) ─────────────────────────────────

export interface ResultadoDePartida {
  id: string;
  codigo: string;
  titulo: string;
  modo: ModoDePuntos;
  estado: EstadoDePartida;
  triviaId: string | null;
  createdAt: string;
  terminadaAt: string | null;
  /** Las preguntas que se llegaron a abrir, con cómo respondieron. */
  preguntas: (PreguntaDeTrivia & { distribucion: number[]; respondieron: number; aciertos: number })[];
  posiciones: Posicion[];
  /** Lo que respondió cada jugador en cada pregunta (en el orden de `preguntas`; null = no respondió). */
  respuestasPorJugador: Record<string, ({ opcion: number; esCorrecta: boolean | null; puntos: number; tardoMs: number } | null)[]>;
}

export async function resultadoDePartida(partidaId: string, teamMemberId: string): Promise<ResultadoDePartida | null> {
  const p = await prisma.partidaDeTrivia.findFirst({
    where: { id: partidaId, anfitrionId: teamMemberId },
    select: { ...SELECT_DE_PARTIDA, triviaId: true, createdAt: true, terminadaAt: true },
  });
  if (!p) return null;
  const todas = leerPreguntasJugadas(p.preguntas);
  const [jugadores, respuestas] = await Promise.all([
    prisma.jugadorDeTrivia.findMany({
      where: { partidaId: p.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, nombre: true },
    }),
    prisma.respuestaDeTrivia.findMany({
      where: { partidaId: p.id },
      select: { jugadorId: true, pregunta: true, opcion: true, esCorrecta: true, puntos: true, tardoMs: true },
    }),
  ]);
  // Las que se llegaron a abrir: hasta la actual (una partida terminada antes de tiempo no muestra las que no se jugaron).
  const jugadas = p.preguntaAbiertaAt ? todas.slice(0, p.preguntaActual + 1) : [];
  const preguntas = jugadas.map((q, i) => {
    const deEsta = respuestas.filter((r) => r.pregunta === i);
    return {
      ...q,
      distribucion: distribucionDeRespuestas(q.opciones.length, deEsta.map((r) => r.opcion)),
      respondieron: deEsta.length,
      aciertos: deEsta.filter((r) => r.esCorrecta === true).length,
    };
  });
  const respuestasPorJugador: ResultadoDePartida["respuestasPorJugador"] = {};
  for (const j of jugadores) {
    respuestasPorJugador[j.id] = jugadas.map((_, i) => {
      const r = respuestas.find((x) => x.jugadorId === j.id && x.pregunta === i);
      return r ? { opcion: r.opcion, esCorrecta: r.esCorrecta, puntos: r.puntos, tardoMs: r.tardoMs } : null;
    });
  }
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    modo: p.modo as ModoDePuntos,
    estado: p.estado as EstadoDePartida,
    triviaId: p.triviaId,
    createdAt: p.createdAt.toISOString(),
    terminadaAt: p.terminadaAt?.toISOString() ?? null,
    preguntas,
    posiciones: calcularPosiciones(jugadores, respuestas, Number.MAX_SAFE_INTEGER),
    respuestasPorJugador,
  };
}
