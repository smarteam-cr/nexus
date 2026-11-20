/**
 * lib/trivias/validar.ts — las reglas de una trivia bien armada, SIN Zod: las usa el editor en el navegador (Zod suma
 * 266 KB al bundle; lo frena el ratchet C-24 de lib/auth/client-safe.test.ts) y las usa el schema de las rutas
 * (lib/trivias/schema.ts), así el aviso del editor y el 400 del servidor dicen lo mismo, con las mismas palabras.
 * schema.test.ts congela que los dos lleguen al mismo veredicto.
 */
import {
  MAXIMO_DE_OPCIONES,
  MAXIMO_DE_PREGUNTAS,
  MAXIMO_DE_SEGUNDOS,
  MINIMO_DE_OPCIONES,
  MINIMO_DE_SEGUNDOS,
  OPCIONES_VERDADERO_FALSO,
  type PreguntaDeTrivia,
  type TipoDePregunta,
} from "./tipos";

export const MAXIMO_DEL_TITULO = 120;
export const MAXIMO_DEL_TEXTO = 300;
export const MAXIMO_DE_LA_OPCION = 90;

export const MENSAJES = {
  sinTitulo: "Ponle un título a la trivia.",
  tituloLargo: `El título puede tener hasta ${MAXIMO_DEL_TITULO} caracteres.`,
  sinPreguntas: "Agrega al menos una pregunta.",
  muchasPreguntas: `Una trivia puede tener hasta ${MAXIMO_DE_PREGUNTAS} preguntas.`,
  textoLargo: `La pregunta puede tener hasta ${MAXIMO_DEL_TEXTO} caracteres.`,
  opcionLarga: `Cada opción puede tener hasta ${MAXIMO_DE_LA_OPCION} caracteres.`,
  segundosEnteros: "El tiempo va en segundos enteros.",
  segundosMinimo: `El tiempo mínimo es de ${MINIMO_DE_SEGUNDOS} segundos.`,
  segundosMaximo: `El tiempo máximo es de ${MAXIMO_DE_SEGUNDOS} segundos.`,
} as const;

/** Deja la pregunta en su forma canónica: verdadero o falso con sus dos opciones fijas, encuesta sin correctas. */
export function normalizarPregunta(p: PreguntaDeTrivia): PreguntaDeTrivia {
  const sinRepetir = [...new Set(p.correctas)].sort((a, b) => a - b);
  if (p.tipo === "VERDADERO_FALSO") {
    return { tipo: p.tipo, texto: p.texto, opciones: [...OPCIONES_VERDADERO_FALSO], correctas: sinRepetir, segundos: p.segundos };
  }
  const correctas = p.tipo === "ENCUESTA" ? [] : sinRepetir;
  return { tipo: p.tipo, texto: p.texto, opciones: p.opciones, correctas, segundos: p.segundos };
}

/** Por qué una pregunta (ya normalizada) no se puede jugar, o null. `n` es su número en la lista (1, 2, 3…). */
export function problemaDeLaPregunta(p: PreguntaDeTrivia, n: number): string | null {
  const donde = `Pregunta ${n}`;
  if (!p.texto) return `${donde}: escribe la pregunta.`;
  if (p.tipo !== "VERDADERO_FALSO") {
    if (p.opciones.length < MINIMO_DE_OPCIONES) return `${donde}: pon al menos ${MINIMO_DE_OPCIONES} opciones.`;
    if (p.opciones.some((o) => !o)) return `${donde}: hay una opción vacía; escríbela o quítala.`;
    const distintas = new Set(p.opciones.map((o) => o.toLocaleLowerCase("es")));
    if (distintas.size !== p.opciones.length) return `${donde}: hay dos opciones iguales.`;
  }
  if (p.correctas.some((i) => i >= p.opciones.length)) return `${donde}: marcaste como correcta una opción que no existe.`;
  if (p.tipo === "OPCION_MULTIPLE" && p.correctas.length === 0) return `${donde}: marca al menos una opción correcta.`;
  if (p.tipo === "VERDADERO_FALSO" && p.correctas.length !== 1) return `${donde}: elige si la respuesta es verdadero o falso.`;
  return null;
}

/** Lo que manda el editor, tal cual (los textos sin recortar y el tiempo como número, NaN si quedó vacío). */
export interface TriviaEnBorrador {
  titulo: string;
  preguntas: { tipo: TipoDePregunta; texto: string; opciones: string[]; correctas: number[]; segundos: number }[];
}

export type RevisionDeTrivia =
  | { ok: true; datos: { titulo: string; preguntas: PreguntaDeTrivia[] } }
  | { ok: false; mensaje: string; /** Índice de la pregunta con el problema; null si es de la trivia entera. */ pregunta: number | null };

/** El PRIMER problema de la trivia, en el orden en que lo encontraría el servidor; o la trivia lista para guardar. */
export function revisarTrivia(t: TriviaEnBorrador): RevisionDeTrivia {
  const titulo = t.titulo.trim();
  if (!titulo) return { ok: false, mensaje: MENSAJES.sinTitulo, pregunta: null };
  if (titulo.length > MAXIMO_DEL_TITULO) return { ok: false, mensaje: MENSAJES.tituloLargo, pregunta: null };
  if (t.preguntas.length === 0) return { ok: false, mensaje: MENSAJES.sinPreguntas, pregunta: null };
  if (t.preguntas.length > MAXIMO_DE_PREGUNTAS) return { ok: false, mensaje: MENSAJES.muchasPreguntas, pregunta: null };
  const preguntas: PreguntaDeTrivia[] = [];
  for (let i = 0; i < t.preguntas.length; i++) {
    const p = t.preguntas[i];
    const n = i + 1;
    const texto = p.texto.trim();
    if (texto.length > MAXIMO_DEL_TEXTO) return { ok: false, mensaje: `Pregunta ${n}: ${minuscula(MENSAJES.textoLargo)}`, pregunta: i };
    const opciones = p.opciones.map((o) => o.trim());
    if (opciones.some((o) => o.length > MAXIMO_DE_LA_OPCION)) {
      return { ok: false, mensaje: `Pregunta ${n}: ${minuscula(MENSAJES.opcionLarga)}`, pregunta: i };
    }
    if (p.tipo !== "VERDADERO_FALSO" && opciones.length > MAXIMO_DE_OPCIONES) {
      return { ok: false, mensaje: `Pregunta ${n}: puede tener hasta ${MAXIMO_DE_OPCIONES} opciones.`, pregunta: i };
    }
    if (!Number.isInteger(p.segundos) || p.segundos < MINIMO_DE_SEGUNDOS || p.segundos > MAXIMO_DE_SEGUNDOS) {
      return {
        ok: false,
        mensaje: `Pregunta ${n}: el tiempo va de ${MINIMO_DE_SEGUNDOS} a ${MAXIMO_DE_SEGUNDOS} segundos, en números enteros.`,
        pregunta: i,
      };
    }
    const normal = normalizarPregunta({ tipo: p.tipo, texto, opciones, correctas: p.correctas, segundos: p.segundos });
    const problema = problemaDeLaPregunta(normal, n);
    if (problema) return { ok: false, mensaje: problema, pregunta: i };
    preguntas.push(normal);
  }
  return { ok: true, datos: { titulo, preguntas } };
}

function minuscula(texto: string): string {
  return texto.charAt(0).toLocaleLowerCase("es") + texto.slice(1);
}
