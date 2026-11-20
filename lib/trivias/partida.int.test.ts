/**
 * lib/trivias/partida.int.test.ts — una partida entera contra la base de prueba: lanzar, entrar (y volver a entrar
 * desde otro dispositivo), responder una vez y a tiempo, cerrar sola cuando respondieron todos, la tabla, el podio y el
 * historial. El reloj se fija en cada paso (`ahora`): es el del servidor.
 * Correr: `npx vitest run --project integration lib/trivias` (la base nexus_test es compartida entre copias).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { ErrorDeTrivias } from "./error";
import { avanzarPartida, crearTrivia, guardarTrivia, lanzarPartida, responder, unirseAPartida } from "./mutations";
import { estadoParaAnfitrion, estadoParaJugador, listarPartidas, resultadoDePartida } from "./queries";
import { TriviaInput } from "./schema";

const T0 = new Date("2026-11-19T15:00:00.000Z");
const en = (ms: number) => new Date(T0.getTime() + ms);

async function equipo() {
  const [anfitrion, ana, beto] = await Promise.all([
    prisma.teamMember.create({ data: { name: "Elena Anfitriona", email: "elena@trivia.test", roleEnum: "SUPER_ADMIN", area: "Admin" } }),
    prisma.teamMember.create({ data: { name: "Ana Jugadora", email: "ana@trivia.test", roleEnum: "CSE", area: "CSE" } }),
    prisma.teamMember.create({ data: { name: "Beto Jugador", email: "beto@trivia.test", roleEnum: "CSE", area: "CSE" } }),
  ]);
  return { anfitrion, ana, beto };
}

const TRIVIA = TriviaInput.parse({
  titulo: "Coaching de HubSpot",
  preguntas: [
    { tipo: "OPCION_MULTIPLE", texto: "¿Qué es un objeto estándar?", opciones: ["Contactos", "Facturas de Odoo", "Empresas"], correctas: [0, 2], segundos: 20 },
    { tipo: "VERDADERO_FALSO", texto: "Un negocio puede tener varias empresas.", opciones: [], correctas: [0], segundos: 10 },
    { tipo: "ENCUESTA", texto: "¿Cómo te sentiste?", opciones: ["Bien", "Regular"], correctas: [], segundos: 15 },
  ],
});

async function rechazo(p: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErrorDeTrivias) return { status: e.status, message: e.message };
    throw e;
  }
  throw new Error("se esperaba un rechazo");
}

describe("una partida de trivia de punta a punta", { timeout: 60_000 }, () => {
  it("se juega entera con las reglas del servidor y queda en el historial", async () => {
    const { anfitrion, ana, beto } = await equipo();
    const { id: triviaId } = await crearTrivia(TRIVIA, anfitrion.id);

    // Solo quien creó la trivia la lanza.
    expect((await rechazo(lanzarPartida(triviaId, "VELOCIDAD", ana.id))).status).toBe(404);
    const { id: partidaId, codigo } = await lanzarPartida(triviaId, "VELOCIDAD", anfitrion.id);
    expect(codigo).toMatch(/^[A-Z2-9]{6}$/);

    // Entrar, y volver a entrar desde otro dispositivo: la MISMA participación.
    const primera = await unirseAPartida(codigo, { teamMemberId: ana.id, nombre: ana.name });
    const otroDispositivo = await unirseAPartida(codigo, { teamMemberId: ana.id, nombre: ana.name });
    expect(otroDispositivo.jugadorId).toBe(primera.jugadorId);
    await unirseAPartida(codigo, { teamMemberId: beto.id, nombre: beto.name });
    expect(await prisma.jugadorDeTrivia.count({ where: { partidaId } })).toBe(2);

    const sala = await estadoParaAnfitrion(partidaId, anfitrion.id, T0);
    expect(sala?.partida.estado).toBe("ESPERA");
    expect(sala?.jugadores.map((j) => j.nombre)).toEqual(["Ana Jugadora", "Beto Jugador"]);
    // Otra persona no ve la consola.
    expect(await estadoParaAnfitrion(partidaId, ana.id, T0)).toBeNull();

    // Antes de empezar no se responde.
    expect((await rechazo(responder(codigo, ana.id, { pregunta: 0, opcion: 0 }, T0))).status).toBe(409);

    // Empezar. Un segundo clic con lo viejo en pantalla es un 409, no un segundo avance.
    await avanzarPartida(partidaId, anfitrion.id, { accion: "empezar", desde: { estado: "ESPERA", pregunta: 0 } }, T0);
    expect((await rechazo(avanzarPartida(partidaId, anfitrion.id, { accion: "empezar", desde: { estado: "ESPERA", pregunta: 0 } }, T0))).status).toBe(409);

    // Con la pregunta abierta el jugador NO recibe las correctas.
    // La forma EXACTA de lo que viaja: ni una llave de más (un cambio que sume `correctas` a la pregunta se pone en rojo).
    const abierta = await estadoParaJugador(codigo, ana.id, en(1_000));
    expect(abierta?.pregunta).toEqual({
      indice: 0,
      tipo: "OPCION_MULTIPLE",
      texto: "¿Qué es un objeto estándar?",
      opciones: ["Contactos", "Facturas de Odoo", "Empresas"],
      segundos: 20,
    });
    expect(abierta?.correctas).toBeNull();
    const consolaAbierta = await estadoParaAnfitrion(partidaId, anfitrion.id, en(1_000));
    expect(consolaAbierta?.pregunta?.correctas).toBeNull(); // la pantalla se proyecta
    expect(consolaAbierta?.distribucion).toBeNull();

    // Ana responde a los 5 s; la segunda vez (o dos toques a la vez) se bloquea.
    await responder(codigo, ana.id, { pregunta: 0, opcion: 2 }, en(5_000));
    expect(await rechazo(responder(codigo, ana.id, { pregunta: 0, opcion: 0 }, en(6_000)))).toEqual({
      status: 409,
      message: "Ya respondiste esta pregunta.",
    });
    const mientras = await estadoParaJugador(codigo, ana.id, en(6_000));
    expect(mientras?.miRespuesta).toEqual({ opcion: 2, resultado: null }); // el resultado llega al cerrar
    expect(mientras?.correctas).toBeNull();
    // Ni el puntaje ni el lugar se mueven con la pregunta abierta: no se deduce si acertó.
    expect(mientras?.yo).toMatchObject({ puntos: 0, lugar: null });
    expect((await estadoParaAnfitrion(partidaId, anfitrion.id, en(6_000)))?.respondieron).toBe(1);

    // Beto responde y ya respondieron todos: la pregunta se cierra en ese instante, sin esperar el tiempo.
    await responder(codigo, beto.id, { pregunta: 0, opcion: 1 }, en(8_000));
    const cerrada = await estadoParaAnfitrion(partidaId, anfitrion.id, en(8_500));
    expect(cerrada?.partida.cerrada).toBe(true);
    expect(cerrada?.distribucion).toEqual([0, 1, 1]);
    expect(cerrada?.pregunta?.correctas).toEqual([0, 2]);

    const anaVe = await estadoParaJugador(codigo, ana.id, en(8_500));
    expect(anaVe?.miRespuesta?.resultado).toEqual({ esCorrecta: true, puntos: 875 });
    expect(anaVe?.correctas).toEqual([0, 2]);
    expect(anaVe?.yo).toMatchObject({ puntos: 875, lugar: 1, jugadores: 2 });
    expect((await estadoParaJugador(codigo, beto.id, en(8_500)))?.yo).toMatchObject({ puntos: 0, lugar: 2 });

    // Posiciones y la segunda pregunta (10 s).
    await avanzarPartida(partidaId, anfitrion.id, { accion: "posiciones", desde: { estado: "PREGUNTA", pregunta: 0 } }, en(9_000));
    const tabla = await estadoParaAnfitrion(partidaId, anfitrion.id, en(9_000));
    expect(tabla?.posiciones.map((p) => [p.nombre, p.puntos])).toEqual([["Ana Jugadora", 875], ["Beto Jugador", 0]]);
    await avanzarPartida(partidaId, anfitrion.id, { accion: "siguiente", desde: { estado: "POSICIONES", pregunta: 0 } }, en(10_000));

    // Fuera de tiempo no se acepta (el reloj del servidor manda): 10 s después de abrir.
    expect(await rechazo(responder(codigo, beto.id, { pregunta: 1, opcion: 0 }, en(20_000)))).toEqual({
      status: 409,
      message: "Se acabó el tiempo de esta pregunta.",
    });
    // Ni una pregunta que ya pasó.
    expect((await rechazo(responder(codigo, beto.id, { pregunta: 0, opcion: 0 }, en(11_000)))).status).toBe(409);
    await responder(codigo, beto.id, { pregunta: 1, opcion: 0 }, en(11_000)); // 1 s de 10: 950 puntos
    // El anfitrión cierra antes de que Ana responda.
    await avanzarPartida(partidaId, anfitrion.id, { accion: "cerrar", desde: { estado: "PREGUNTA", pregunta: 1 } }, en(12_000));
    expect((await rechazo(responder(codigo, ana.id, { pregunta: 1, opcion: 0 }, en(12_500)))).status).toBe(409);

    // Terminar antes de la encuesta: el podio con lo que hay.
    await avanzarPartida(partidaId, anfitrion.id, { accion: "terminar", desde: { estado: "PREGUNTA", pregunta: 1 } }, en(13_000));
    const podio = await estadoParaAnfitrion(partidaId, anfitrion.id, en(13_000));
    expect(podio?.partida.estado).toBe("FINALIZADA");
    expect(podio?.posiciones.map((p) => [p.nombre, p.puntos, p.lugar])).toEqual([
      ["Beto Jugador", 950, 1],
      ["Ana Jugadora", 875, 2],
    ]);

    // A una partida terminada no entra alguien nuevo; quien ya jugó sí puede volver a mirarla.
    const carla = await prisma.teamMember.create({ data: { name: "Carla Tarde", email: "carla@trivia.test", roleEnum: "CSE", area: "CSE" } });
    expect(await rechazo(unirseAPartida(codigo, { teamMemberId: carla.id, nombre: carla.name }))).toEqual({
      status: 409,
      message: "Esta partida ya terminó.",
    });
    expect((await unirseAPartida(codigo, { teamMemberId: ana.id, nombre: ana.name })).jugadorId).toBe(primera.jugadorId);

    // El historial: lo que respondió cada uno en cada pregunta jugada (la encuesta no se llegó a abrir).
    const r = await resultadoDePartida(partidaId, anfitrion.id);
    expect(r?.preguntas.map((q) => [q.texto, q.respondieron, q.aciertos])).toEqual([
      ["¿Qué es un objeto estándar?", 2, 1],
      ["Un negocio puede tener varias empresas.", 1, 1],
    ]);
    expect(r?.respuestasPorJugador[primera.jugadorId]).toEqual([
      { opcion: 2, esCorrecta: true, puntos: 875, tardoMs: 5_000 },
      null,
    ]);
    expect(await resultadoDePartida(partidaId, ana.id)).toBeNull();
    const lista = await listarPartidas(anfitrion.id);
    expect(lista[0]).toMatchObject({ codigo, estado: "FINALIZADA", jugadores: 2, ganador: { nombre: "Beto Jugador", puntos: 950 } });

    // Editar la trivia después no cambia la partida jugada (tiene su copia).
    await guardarTrivia(triviaId, TriviaInput.parse({ ...TRIVIA, titulo: "Otra cosa", preguntas: [TRIVIA.preguntas[2]] }), anfitrion.id);
    expect((await resultadoDePartida(partidaId, anfitrion.id))?.titulo).toBe("Coaching de HubSpot");
  });

  it("dos toques a la vez desde dos dispositivos dejan una sola respuesta", async () => {
    const { anfitrion, ana } = await equipo();
    const { id: triviaId } = await crearTrivia(TRIVIA, anfitrion.id);
    const { id: partidaId, codigo } = await lanzarPartida(triviaId, "PRECISION", anfitrion.id);
    await unirseAPartida(codigo, { teamMemberId: ana.id, nombre: ana.name });
    await avanzarPartida(partidaId, anfitrion.id, { accion: "empezar", desde: { estado: "ESPERA", pregunta: 0 } }, T0);
    const resultados = await Promise.allSettled([
      responder(codigo, ana.id, { pregunta: 0, opcion: 0 }, en(2_000)),
      responder(codigo, ana.id, { pregunta: 0, opcion: 1 }, en(2_000)),
    ]);
    expect(resultados.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.respuestaDeTrivia.count({ where: { partidaId } })).toBe(1);
  });
});
