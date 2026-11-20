/**
 * lib/trivias/schema.ts — lo que entra a las rutas de /api/trivia (Zod en la frontera, ARCHITECTURE §3) y la forma de
 * la copia de preguntas que guarda cada partida. SERVIDOR (Zod): el editor del navegador usa validar.ts.
 *
 * Una pregunta se NORMALIZA al validarse: verdadero o falso lleva siempre las dos opciones fijas, una encuesta no
 * tiene correctas, los textos van sin espacios de más. Así lo que se guarda no depende de lo que mandó la pantalla.
 * Las reglas y las palabras viven en validar.ts (sin Zod): las comparte el editor del navegador.
 */
import { z } from "zod";
import {
  ESTADOS_DE_PARTIDA,
  MAXIMO_DE_OPCIONES,
  MAXIMO_DE_PREGUNTAS,
  MAXIMO_DE_SEGUNDOS,
  MINIMO_DE_SEGUNDOS,
  MODOS_DE_PUNTOS,
  SEGUNDOS_POR_DEFECTO,
  TIPOS_DE_PREGUNTA,
  type PreguntaDeTrivia,
} from "./tipos";
import { MAXIMO_DE_LA_OPCION, MAXIMO_DEL_TEXTO, MAXIMO_DEL_TITULO, MENSAJES, normalizarPregunta, problemaDeLaPregunta } from "./validar";

const PreguntaCruda = z.object({
  tipo: z.enum(TIPOS_DE_PREGUNTA),
  texto: z.string().trim().max(MAXIMO_DEL_TEXTO, MENSAJES.textoLargo),
  opciones: z.array(z.string().trim().max(MAXIMO_DE_LA_OPCION, MENSAJES.opcionLarga)).max(MAXIMO_DE_OPCIONES),
  correctas: z.array(z.number().int().min(0).max(MAXIMO_DE_OPCIONES - 1)).max(MAXIMO_DE_OPCIONES),
  segundos: z
    .number()
    .int(MENSAJES.segundosEnteros)
    .min(MINIMO_DE_SEGUNDOS, MENSAJES.segundosMinimo)
    .max(MAXIMO_DE_SEGUNDOS, MENSAJES.segundosMaximo)
    .default(SEGUNDOS_POR_DEFECTO),
});

/** Una pregunta que llega del editor: se valida y sale normalizada. */
export const PreguntaInput = PreguntaCruda.transform(normalizarPregunta);

export const TriviaInput = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(1, MENSAJES.sinTitulo)
      .max(MAXIMO_DEL_TITULO, MENSAJES.tituloLargo),
    preguntas: z
      .array(PreguntaInput)
      .min(1, MENSAJES.sinPreguntas)
      .max(MAXIMO_DE_PREGUNTAS, MENSAJES.muchasPreguntas),
  })
  .superRefine((t, ctx) => {
    t.preguntas.forEach((p, i) => {
      const problema = problemaDeLaPregunta(p, i + 1);
      if (problema) ctx.addIssue({ code: "custom", message: problema, path: ["preguntas", i] });
    });
  });
export type TriviaInput = z.infer<typeof TriviaInput>;

export const LanzarInput = z.strictObject({ modo: z.enum(MODOS_DE_PUNTOS) });

export const ACCIONES_DEL_ANFITRION = ["empezar", "cerrar", "posiciones", "siguiente", "terminar"] as const;
export type AccionDelAnfitrion = (typeof ACCIONES_DEL_ANFITRION)[number];

/** `desde` es lo que el anfitrión tiene en pantalla: si la partida ya cambió (otro clic, otra pestaña), es un 409. */
export const AvanzarInput = z.strictObject({
  accion: z.enum(ACCIONES_DEL_ANFITRION),
  desde: z.strictObject({
    estado: z.enum(ESTADOS_DE_PARTIDA),
    pregunta: z.number().int().min(0).max(MAXIMO_DE_PREGUNTAS),
  }),
});

export const ResponderInput = z.strictObject({
  pregunta: z.number().int().min(0).max(MAXIMO_DE_PREGUNTAS),
  opcion: z.number().int().min(0).max(MAXIMO_DE_OPCIONES - 1),
});

/** La copia de preguntas que guarda la partida (Json): se relee con esto, sin confiar en la forma. */
export const PreguntasJugadas = z.array(
  z.object({
    tipo: z.enum(TIPOS_DE_PREGUNTA),
    texto: z.string(),
    opciones: z.array(z.string()),
    correctas: z.array(z.number().int()),
    segundos: z.number().int().positive(),
  }),
);

/** Lee la copia de una partida; una copia rota no se juega (lista vacía) en vez de reventar la pantalla. */
export function leerPreguntasJugadas(json: unknown): PreguntaDeTrivia[] {
  const r = PreguntasJugadas.safeParse(json);
  return r.success ? r.data : [];
}
