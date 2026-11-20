/**
 * lib/trivias/reglas.ts — las reglas de una partida, puras (sin base, sin reloj propio): las prueba reglas.test.ts y
 * las aplica lib/trivias/mutations.ts con el reloj del servidor.
 *
 * - Los puntos: «precisión» = 1000 por acierto; «velocidad» = de 1000 (inmediato) a 500 (en el último instante).
 * - Una respuesta vale si la partida está en ESA pregunta, la pregunta sigue abierta con el reloj del servidor, la
 *   persona no respondió ya y la opción existe. La base sostiene lo mismo con un único (jugador, pregunta).
 * - La pregunta se cierra sola: está cerrada cuando el reloj llega a `preguntaCierraAt`. Responder todos o el botón
 *   del anfitrión solo ADELANTAN esa hora; no hay otro estado que mantener en sincronía.
 * - El anfitrión avanza con una máquina de estados chica: ESPERA → PREGUNTA → (se cierra) → POSICIONES → PREGUNTA
 *   siguiente… → FINALIZADA (el podio).
 */
import type { AccionDelAnfitrion } from "./schema";
import { TOP_DE_POSICIONES, TOP_DEL_PODIO, type EstadoDePartida, type ModoDePuntos, type Posicion, type PreguntaDeTrivia } from "./tipos";

export const PUNTOS_POR_ACIERTO = 1000;
export const PUNTOS_MINIMOS_EN_VELOCIDAD = 500;

// ── El código de la partida ─────────────────────────────────────────────────

/** Sin 0/O, 1/I/L: lo que se dicta por Meet o se copia de una pantalla no se confunde. */
export const ALFABETO_DEL_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LARGO_DEL_CODIGO = 6;
const FORMA_DEL_CODIGO = new RegExp(`^[${ALFABETO_DEL_CODIGO}]{${LARGO_DEL_CODIGO}}$`);

/** Arma un código con los bytes que le den (en el servidor, `crypto.randomBytes`). */
export function codigoDesdeBytes(bytes: ArrayLike<number>): string {
  let c = "";
  for (let i = 0; i < LARGO_DEL_CODIGO; i++) c += ALFABETO_DEL_CODIGO[bytes[i] % ALFABETO_DEL_CODIGO.length];
  return c;
}

/** Lo que escribió la persona («k7m-2qx», con espacios) → el código, o null si no puede ser uno. */
export function normalizarCodigo(entrada: string): string | null {
  const c = entrada.toUpperCase().replace(/[\s-]/g, "");
  return FORMA_DEL_CODIGO.test(c) ? c : null;
}

// ── Los puntos ──────────────────────────────────────────────────────────────

/** null = la pregunta no tiene respuesta correcta (encuesta). */
export function esRespuestaCorrecta(pregunta: PreguntaDeTrivia, opcion: number): boolean | null {
  if (pregunta.tipo === "ENCUESTA") return null;
  return pregunta.correctas.includes(opcion);
}

export function puntosDeLaRespuesta(input: {
  modo: ModoDePuntos;
  esCorrecta: boolean | null;
  tardoMs: number;
  limiteMs: number;
}): number {
  if (input.esCorrecta !== true) return 0;
  if (input.modo === "PRECISION") return PUNTOS_POR_ACIERTO;
  const fraccion = input.limiteMs > 0 ? Math.min(1, Math.max(0, input.tardoMs / input.limiteMs)) : 0;
  const puntos = Math.round(PUNTOS_POR_ACIERTO * (1 - fraccion / 2));
  return Math.max(PUNTOS_MINIMOS_EN_VELOCIDAD, Math.min(PUNTOS_POR_ACIERTO, puntos));
}

// ── El reloj de la pregunta ─────────────────────────────────────────────────

export interface RelojDePartida {
  estado: EstadoDePartida;
  preguntaActual: number;
  preguntaAbiertaAt: Date | null;
  preguntaCierraAt: Date | null;
}

/** La pregunta en curso recibe respuestas en este instante: desde que se abrió y antes de su hora de cierre. */
export function preguntaAbierta(p: RelojDePartida, ahora: Date): boolean {
  return (
    p.estado === "PREGUNTA" &&
    p.preguntaAbiertaAt !== null &&
    p.preguntaCierraAt !== null &&
    ahora.getTime() >= p.preguntaAbiertaAt.getTime() &&
    ahora.getTime() < p.preguntaCierraAt.getTime()
  );
}

/** Ya no recibe respuestas y se puede mostrar cómo votaron y cuál era la correcta. */
export function preguntaCerrada(p: RelojDePartida, ahora: Date): boolean {
  if (p.estado === "POSICIONES" || p.estado === "FINALIZADA") return p.preguntaAbiertaAt !== null;
  return p.estado === "PREGUNTA" && p.preguntaCierraAt !== null && ahora.getTime() >= p.preguntaCierraAt.getTime();
}

/**
 * Hasta qué pregunta (incluida) cuentan los puntos que se muestran. Hasta que la pregunta cierra, hasta la anterior:
 * así nadie deduce si acertó viendo subir su puntaje antes de que se cierre.
 */
export function hastaQuePreguntaCuenta(p: RelojDePartida, ahora: Date): number {
  if (p.preguntaAbiertaAt === null) return -1;
  return preguntaCerrada(p, ahora) ? p.preguntaActual : p.preguntaActual - 1;
}

// ── Responder ───────────────────────────────────────────────────────────────

export type RechazoDeRespuesta =
  | "fuera-de-pregunta"
  | "otra-pregunta"
  | "tiempo-agotado"
  | "ya-respondiste"
  | "opcion-invalida";

export const MENSAJE_DEL_RECHAZO: Record<RechazoDeRespuesta, string> = {
  "fuera-de-pregunta": "Ahora no hay una pregunta abierta.",
  "otra-pregunta": "Esa pregunta ya pasó.",
  "tiempo-agotado": "Se acabó el tiempo de esta pregunta.",
  "ya-respondiste": "Ya respondiste esta pregunta.",
  "opcion-invalida": "Esa opción no existe.",
};

export type ResultadoDeResponder =
  | { ok: true; esCorrecta: boolean | null; puntos: number; tardoMs: number }
  | { ok: false; rechazo: RechazoDeRespuesta };

/** Decide si una respuesta vale y cuánto, con el reloj del servidor (`ahora`). */
export function evaluarRespuesta(input: {
  partida: RelojDePartida & { modo: ModoDePuntos };
  pregunta: PreguntaDeTrivia | undefined;
  indice: number;
  opcion: number;
  ahora: Date;
  yaRespondio: boolean;
}): ResultadoDeResponder {
  const { partida, pregunta, indice, opcion, ahora } = input;
  if (partida.estado !== "PREGUNTA" || !pregunta) return { ok: false, rechazo: "fuera-de-pregunta" };
  if (indice !== partida.preguntaActual) return { ok: false, rechazo: "otra-pregunta" };
  // Una respuesta que llegó ANTES de que se abriera la pregunta (el anfitrión la abrió mientras el pedido viajaba) no
  // cuenta: sumaría el puntaje máximo a ciegas.
  if (partida.preguntaAbiertaAt === null || ahora.getTime() < partida.preguntaAbiertaAt.getTime()) {
    return { ok: false, rechazo: "fuera-de-pregunta" };
  }
  // «Ya respondiste» antes que el reloj: con dos toques a la vez (o dos dispositivos), el primero puede cerrar la
  // pregunta por ser el último en responder, y el segundo tiene que oír lo que de verdad pasó.
  if (input.yaRespondio) return { ok: false, rechazo: "ya-respondiste" };
  if (!preguntaAbierta(partida, ahora)) return { ok: false, rechazo: "tiempo-agotado" };
  if (!Number.isInteger(opcion) || opcion < 0 || opcion >= pregunta.opciones.length) {
    return { ok: false, rechazo: "opcion-invalida" };
  }
  const limiteMs = pregunta.segundos * 1000;
  const tardoMs = Math.min(limiteMs, Math.max(0, ahora.getTime() - partida.preguntaAbiertaAt.getTime()));
  const esCorrecta = esRespuestaCorrecta(pregunta, opcion);
  return { ok: true, esCorrecta, tardoMs, puntos: puntosDeLaRespuesta({ modo: partida.modo, esCorrecta, tardoMs, limiteMs }) };
}

// ── Entrar ──────────────────────────────────────────────────────────────────

/** Entrar de nuevo (otro teléfono, otra pestaña) reusa la participación; a una partida terminada ya no se entra. */
export function decidirIngreso(estado: EstadoDePartida, yaEsJugador: boolean): "reusar" | "crear" | "terminada" {
  if (yaEsJugador) return "reusar";
  return estado === "FINALIZADA" ? "terminada" : "crear";
}

// ── El anfitrión avanza ─────────────────────────────────────────────────────

export type CambioDePartida = Partial<{
  estado: EstadoDePartida;
  preguntaActual: number;
  preguntaAbiertaAt: Date;
  preguntaCierraAt: Date;
  terminadaAt: Date;
}>;

export type PasoDelAnfitrion = { ok: true; cambio: CambioDePartida } | { ok: false; mensaje: string };

function abrirPregunta(indice: number, preguntas: PreguntaDeTrivia[], ahora: Date): CambioDePartida {
  return {
    estado: "PREGUNTA",
    preguntaActual: indice,
    preguntaAbiertaAt: ahora,
    preguntaCierraAt: new Date(ahora.getTime() + preguntas[indice].segundos * 1000),
  };
}

/** Qué cambia en la partida con el botón que tocó el anfitrión, o por qué no se puede. */
export function siguientePaso(
  partida: RelojDePartida,
  accion: AccionDelAnfitrion,
  preguntas: PreguntaDeTrivia[],
  ahora: Date,
): PasoDelAnfitrion {
  const ultima = preguntas.length - 1;
  switch (accion) {
    case "empezar":
      if (partida.estado !== "ESPERA") return { ok: false, mensaje: "La partida ya empezó." };
      if (preguntas.length === 0) return { ok: false, mensaje: "Esta partida no tiene preguntas." };
      return { ok: true, cambio: abrirPregunta(0, preguntas, ahora) };
    case "cerrar":
      if (!preguntaAbierta(partida, ahora)) return { ok: false, mensaje: "La pregunta ya está cerrada." };
      return { ok: true, cambio: { preguntaCierraAt: ahora } };
    case "posiciones":
      if (partida.estado !== "PREGUNTA") return { ok: false, mensaje: "No hay una pregunta en pantalla." };
      if (!preguntaCerrada(partida, ahora)) return { ok: false, mensaje: "La pregunta sigue abierta." };
      return { ok: true, cambio: { estado: "POSICIONES" } };
    case "siguiente":
      if (partida.estado !== "POSICIONES") return { ok: false, mensaje: "Primero muestra los resultados." };
      if (partida.preguntaActual >= ultima) return { ok: false, mensaje: "Era la última pregunta." };
      return { ok: true, cambio: abrirPregunta(partida.preguntaActual + 1, preguntas, ahora) };
    case "terminar": {
      if (partida.estado === "FINALIZADA") return { ok: false, mensaje: "La partida ya terminó." };
      const cambio: CambioDePartida = { estado: "FINALIZADA", terminadaAt: ahora };
      // Terminar con una pregunta abierta la cierra: nadie responde a una partida terminada.
      if (preguntaAbierta(partida, ahora)) cambio.preguntaCierraAt = ahora;
      return { ok: true, cambio };
    }
  }
}

// ── Lo que se muestra ───────────────────────────────────────────────────────

/**
 * La tabla: puntos y aciertos de cada jugador hasta la pregunta `hasta` (incluida). Ordena por puntos y, a igual
 * puntaje, por nombre; dos con los mismos puntos comparten el lugar (1, 2, 2, 4). Incluye a quien no sumó nada.
 */
export function calcularPosiciones(
  jugadores: { id: string; nombre: string }[],
  respuestas: { jugadorId: string; pregunta: number; puntos: number; esCorrecta: boolean | null }[],
  hasta: number,
): Posicion[] {
  const suma = new Map<string, { puntos: number; aciertos: number }>();
  for (const j of jugadores) suma.set(j.id, { puntos: 0, aciertos: 0 });
  for (const r of respuestas) {
    const s = suma.get(r.jugadorId);
    if (!s || r.pregunta > hasta) continue;
    s.puntos += r.puntos;
    if (r.esCorrecta === true) s.aciertos += 1;
  }
  const filas = jugadores
    .map((j) => ({ jugadorId: j.id, nombre: j.nombre, ...(suma.get(j.id) as { puntos: number; aciertos: number }) }))
    .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, "es"));
  let lugar = 0;
  return filas.map((f, i) => {
    if (i === 0 || f.puntos !== filas[i - 1].puntos) lugar = i + 1;
    return { ...f, lugar };
  });
}

/**
 * La medalla (oro, plata, bronce): solo los 3 primeros LUGARES que sumaron algo. Una sola regla para el teléfono, la
 * pantalla proyectada y el resultado: con 0 puntos nadie lleva medalla, aunque esté «segundo» porque los demás también
 * tienen 0.
 */
export function tieneMedalla(lugar: number | null, puntos: number): lugar is number {
  return lugar !== null && lugar >= 1 && lugar <= TOP_DEL_PODIO && puntos > 0;
}

/** El podio: los que llevan medalla (con empate, todos los empatados). */
export function podioDe(posiciones: Posicion[]): Posicion[] {
  return posiciones.filter((p) => tieneMedalla(p.lugar, p.puntos));
}

/** La tabla tras una pregunta: los 5 primeros lugares (con empate, todos), sin pasar de 10 filas en la pantalla. */
export const FILAS_MAXIMAS_DE_LA_TABLA = 10;
export function tablaDePosiciones(posiciones: Posicion[]): Posicion[] {
  return posiciones.filter((p) => p.lugar <= TOP_DE_POSICIONES).slice(0, FILAS_MAXIMAS_DE_LA_TABLA);
}

/** Una partida que nadie terminó y lleva medio día sin moverse: en el historial ya no se muestra «en vivo». */
export const HORAS_PARA_DARLA_POR_ABANDONADA = 12;
export function partidaAbandonada(estado: EstadoDePartida, movidaAt: Date, ahora: Date): boolean {
  return estado !== "FINALIZADA" && ahora.getTime() - movidaAt.getTime() > HORAS_PARA_DARLA_POR_ABANDONADA * 3_600_000;
}

/** Cuántos eligieron cada opción de una pregunta. */
export function distribucionDeRespuestas(cantidadDeOpciones: number, opcionesElegidas: number[]): number[] {
  const conteo = new Array<number>(cantidadDeOpciones).fill(0);
  for (const o of opcionesElegidas) if (o >= 0 && o < cantidadDeOpciones) conteo[o] += 1;
  return conteo;
}
