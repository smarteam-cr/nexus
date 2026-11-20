/**
 * lib/trivias/tipos.ts — vocabulario de las trivias que comparten el servidor y las pantallas (sin Prisma, sin React).
 *
 * Los estados de lo que ven el anfitrión y el jugador viajan por JSON: las horas van en milisegundos y `ahora` es el
 * reloj del SERVIDOR, para que la cuenta regresiva de cada pantalla se mida contra el mismo reloj que valida las
 * respuestas (lib/trivias/reglas.ts › evaluarRespuesta).
 */

export const TIPOS_DE_PREGUNTA = ["OPCION_MULTIPLE", "VERDADERO_FALSO", "ENCUESTA"] as const;
export type TipoDePregunta = (typeof TIPOS_DE_PREGUNTA)[number];

export const MODOS_DE_PUNTOS = ["PRECISION", "VELOCIDAD"] as const;
export type ModoDePuntos = (typeof MODOS_DE_PUNTOS)[number];

export const ESTADOS_DE_PARTIDA = ["ESPERA", "PREGUNTA", "POSICIONES", "FINALIZADA"] as const;
export type EstadoDePartida = (typeof ESTADOS_DE_PARTIDA)[number];

export const ETIQUETA_DEL_TIPO: Record<TipoDePregunta, string> = {
  OPCION_MULTIPLE: "Opción múltiple",
  VERDADERO_FALSO: "Verdadero o falso",
  ENCUESTA: "Encuesta",
};

export const ETIQUETA_DEL_MODO: Record<ModoDePuntos, string> = {
  PRECISION: "Precisión",
  VELOCIDAD: "Velocidad",
};

export const EXPLICACION_DEL_MODO: Record<ModoDePuntos, string> = {
  PRECISION: "Solo cuenta acertar: cada respuesta correcta vale 1000 puntos.",
  VELOCIDAD: "Acertar rápido da más: 1000 puntos si es inmediato y nunca menos de 500 si es correcta.",
};

export const OPCIONES_VERDADERO_FALSO = ["Verdadero", "Falso"] as const;

export const MINIMO_DE_OPCIONES = 2;
export const MAXIMO_DE_OPCIONES = 4;
export const SEGUNDOS_POR_DEFECTO = 20;
export const MINIMO_DE_SEGUNDOS = 5;
export const MAXIMO_DE_SEGUNDOS = 120;
export const MAXIMO_DE_PREGUNTAS = 50;
/** Cuántas posiciones muestra la tabla tras cada pregunta y cuántas el podio. */
export const TOP_DE_POSICIONES = 5;
export const TOP_DEL_PODIO = 3;

/** Una pregunta tal como se edita y como queda copiada en la partida. */
export interface PreguntaDeTrivia {
  tipo: TipoDePregunta;
  texto: string;
  opciones: string[];
  /** Índices de las opciones correctas (vacío en una encuesta). */
  correctas: number[];
  segundos: number;
}

/** La pregunta que se muestra mientras está abierta: sin las correctas. */
export interface PreguntaVisible {
  indice: number;
  tipo: TipoDePregunta;
  texto: string;
  opciones: string[];
  segundos: number;
}

export interface Posicion {
  jugadorId: string;
  nombre: string;
  puntos: number;
  aciertos: number;
  /** 1 = primero; dos con los mismos puntos comparten el lugar (1, 2, 2, 4). */
  lugar: number;
}

/** Lo común de la partida que ven las dos pantallas. */
export interface CabeceraDePartida {
  codigo: string;
  titulo: string;
  modo: ModoDePuntos;
  estado: EstadoDePartida;
  preguntaActual: number;
  totalDePreguntas: number;
  /** Milisegundos (reloj del servidor). */
  abiertaAt: number | null;
  cierraAt: number | null;
  /** La pregunta en curso ya no recibe respuestas (se acabó el tiempo, respondieron todos o el anfitrión la cerró). */
  cerrada: boolean;
}

export interface EstadoParaAnfitrion {
  ahora: number;
  partida: CabeceraDePartida & { id: string };
  jugadores: { id: string; nombre: string }[];
  pregunta: (PreguntaVisible & { correctas: number[] | null }) | null;
  respondieron: number;
  /** Cuántos eligieron cada opción: solo con la pregunta cerrada. */
  distribucion: number[] | null;
  /** Los 5 primeros tras la pregunta, o los 3 del podio al final. */
  posiciones: Posicion[];
}

export interface EstadoParaJugador {
  ahora: number;
  partida: CabeceraDePartida;
  /** null = todavía no entró a la partida. */
  yo: { nombre: string; puntos: number; lugar: number | null; jugadores: number } | null;
  pregunta: PreguntaVisible | null;
  /** Lo que respondió en la pregunta en curso; el resultado llega cuando la pregunta se cierra. */
  miRespuesta: { opcion: number; resultado: { esCorrecta: boolean | null; puntos: number } | null } | null;
  /** Las correctas de la pregunta en curso: solo con la pregunta cerrada. */
  correctas: number[] | null;
}
