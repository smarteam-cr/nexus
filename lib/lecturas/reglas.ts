/**
 * lib/lecturas/reglas.ts — las reglas de la LECTURA DE SEGUIMIENTO de cada reunión (memoria de la cuenta, etapa 2). PURO.
 *
 * La lectura de seguimiento es la pasada única sobre cada reunión con un cliente o un prospecto (el post-proceso,
 * lib/sessions/post-process.ts). Su cola es la MISMA fila `LecturaDeReunion` que usa Tareas, con su propio estado en
 * las columnas `seguimiento*` (DECISIONS «La lectura de cada reunión es durable…»): `estado` es la salida de Tareas.
 *
 * Una sola regla para todos los que la necesitan: el job `seguimiento-reuniones`, la cola (lib/lecturas/cola.ts), el
 * enriquecimiento de Meet (que solo encola), los requisitos del job (lib/jobs/requisitos.ts) e INV44. Si dos de ellos
 * tuvieran su copia, el job podría tomar una reunión que INV44 no espera, o al revés.
 */
import { MIN_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";
import { MIN_NOTAS_PARA_LEER } from "@/lib/seguimiento/hechos/reglas";

/**
 * El estado de la lectura de seguimiento de una fila (`LecturaDeReunion.seguimientoEstado`). null = el seguimiento no
 * la leyó (la fila la creó Tareas, o es de antes de la etapa 2).
 *   · en_espera — en la cola; se puede tomar desde `seguimientoDesde` (un reintento espera ahí).
 *   · leyendo   — alguien la está leyendo desde `seguimientoDesde`; más de 15 minutos = colgada.
 *   · lista     — leída: dejó su minuta y sus propuestas.
 *   · sin_texto — no había transcripción que leer.
 *   · copia     — la misma reunión en otra fila (dos series del calendario): se lee una sola vez.
 *   · error     — falló 3 veces (o se colgó 3 veces); queda con su error y no se vuelve a tomar sola. El job falla
 *                 (semáforo rojo + Sentry) el tick en que una fila llega acá.
 *   · omitida   — al leerla, la reunión ya no era de un cliente ni de un prospecto (le cambiaron el dueño), o era de
 *                 puertas adentro.
 */
export const ESTADOS_DE_SEGUIMIENTO = ["en_espera", "leyendo", "lista", "sin_texto", "copia", "error", "omitida"] as const;
export type EstadoDeSeguimiento = (typeof ESTADOS_DE_SEGUIMIENTO)[number];

/** Los estados que INV44 cuenta como «la reunión tiene su lectura». */
export const ESTADOS_QUE_CUENTAN: readonly EstadoDeSeguimiento[] = ["lista", "sin_texto", "copia", "error"];

/** Desde qué estados se puede volver a encolar una fila (nunca una lista, una copia ni una que se está leyendo). */
export const ESTADOS_QUE_SE_ENCOLAN: readonly EstadoDeSeguimiento[] = ["sin_texto", "error", "omitida"];

/**
 * Una reunión se lee sola si tiene 14 días o menos. Lo rescatado de hace meses no se lee: llenaría los tableros de
 * propuestas viejas y propondría avances «as of» reuniones de mayo (venía de meet-enrichment.ts).
 */
export const DIAS_DE_FRESCURA = 14;

/** Una lectura con más de 15 minutos en `leyendo` se cayó a mitad (un reinicio, un deploy): vuelve a la cola. */
export const MINUTOS_COLGADA = 15;

/** Cuántas veces se intenta leer una reunión antes de dejarla en `error`. */
export const MAX_INTENTOS = 3;

/**
 * Cuántas lecturas toma el job en cada tick, en paralelo, y cuánto puede tardar cada una.
 *
 * El tope CORTA la lectura (un AbortSignal llega al clasificador y a cada llamada a Claude), no solo la espera. Tiene
 * que alcanzar para lo que el mismo código permite: el clasificador (1.200 tokens), el primer intento (6.000) y el
 * reintento cuando se corta (12.000); solo los 12.000 tokens de Sonnet tardan de 130 a 240 s. Con 120 s, toda lectura
 * que se cortaba vencía el tope y seguía viva por detrás (dos lecturas de la misma reunión, y lo que sigue perdido).
 * El precio: un tick con una lectura larga traba al scheduler hasta 8 minutos con la gracia (corre los jobs en serie).
 */
export const LECTURAS_POR_TICK = 2;
export const SEGUNDOS_POR_LECTURA = 420;

/**
 * Pasado el tope, cuánto se espera a que la lectura cortada termine lo que estaba escribiendo. Si ni así termina (algo
 * que no escucha el corte), la fila queda `leyendo`: la rescata la regla de colgada, y si la lectura termina después,
 * deja su resultado y corre lo que sigue igual.
 */
export const SEGUNDOS_DE_GRACIA = 60;
if (MINUTOS_COLGADA * 60 <= SEGUNDOS_POR_LECTURA + SEGUNDOS_DE_GRACIA) {
  throw new Error("lib/lecturas/reglas.ts: una lectura viva no puede darse por colgada (MINUTOS_COLGADA tiene que pasar el tope más la gracia).");
}

/**
 * El tope de tokens de la respuesta: UN intento, con el tope alto (2026-10-18). Hasta entonces eran dos (6.000 y, si se
 * cortaba, 12.000), y una respuesta cortada se pagaba dos veces: la salida que se tiraba y la entrada entera otra vez. El
 * tope no se cobra (se cobra lo que el modelo escribe), así que arrancar en 12.000 cuesta lo mismo cuando no se corta.
 * Medido del 17-sep al 17-oct: ninguna lectura pasó de 4.502 tokens de salida. Nunca más de 21.333: con más, una
 * llamada sin streaming lanza «Streaming is required» (DECISIONS, el arreglo del streaming del cronograma).
 */
export const TOPE_DE_TOKENS = [12_000] as const;
export const TOPE_SIN_STREAMING = 21_333;
if (TOPE_DE_TOKENS.some((t) => t > TOPE_SIN_STREAMING)) {
  throw new Error(`lib/lecturas/reglas.ts: un tope de la lectura pasa de ${TOPE_SIN_STREAMING} tokens (pediría streaming).`);
}

/**
 * Cuánto se espera para el intento siguiente después de que falló el número `n` (1 = el primero). null = no hay otro
 * intento: la fila queda en `error`.
 */
export function esperaDelIntento(n: number): number | null {
  if (n >= MAX_INTENTOS) return null;
  return n <= 1 ? 5 * 60_000 : 30 * 60_000;
}

/** Qué se lee de una reunión según la empresa dueña (`Client.kind`). */
export type RutaDeLaLectura = "completa" | "prospecto";

/**
 * De un cliente, todo (minuta, compromisos y pedidos fuera de alcance si hay proyecto); de un prospecto, la minuta y
 * los compromisos (no hay nada vendido contra qué comparar); de un aliado, de Smarteam o sin dueño, nada. Una reunión
 * de puertas adentro tampoco se lee, aunque su dueño sea un cliente (`motivoParaNoEncolar`).
 */
export function rutaDeLaLectura(kind: string | null | undefined): RutaDeLaLectura | null {
  if (kind === "CLIENTE") return "completa";
  if (kind === "PROSPECTO") return "prospecto";
  return null;
}

/** Por qué una reunión no se encola (o null si se encola). */
export type MotivoParaNoEncolar = "sin_duenio" | "no_es_cliente" | "puertas_adentro" | "futura" | "vieja" | "sin_texto";

export interface ReunionParaEncolar {
  kind: string | null | undefined;
  /**
   * Todos los que estuvieron son de la casa (`esReunionDePuertasAdentro` con los dominios internos). La cascada resuelve
   * una reunión «100 % interna + título» a un cliente; lo que se dijo ahí no lo dijo el cliente: no la lee el
   * seguimiento (la lee Tareas). DECISIONS «Una sola revisión por reunión».
   */
  puertasAdentro: boolean;
  fecha: Date;
  largoTranscript: number;
  /** El largo de las notas de Gemini (`summary.overview`): con la lectura de hechos prendida, alcanzan solas. */
  largoNotas?: number;
  ahora: Date;
}

/**
 * `sinCorteDeFrescura`: lo pidió una persona para una reunión puntual (el script de la cola, el botón de la reunión).
 * `leerSoloNotas`: la lectura de hechos está prendida (`SEGUIMIENTO_HECHOS`, memoria de la cuenta, etapa 6): una reunión
 * sin transcripción pero con notas de Gemini de `MIN_NOTAS_PARA_LEER` caracteres o más también entra (deja sus hechos,
 * no una minuta). Sin la bandera, la cobertura de la etapa 2 no cambia.
 * `minNotas`: el piso de las notas para esta reunión. Lo que una persona recuerda de una reunión agregada a mano entra
 * con `MIN_RECUERDO` (lib/sessions/reunion-a-mano.ts), aunque la lectura de hechos esté apagada: se lee entero.
 */
export function motivoParaNoEncolar(
  o: ReunionParaEncolar,
  opciones: { sinCorteDeFrescura?: boolean; leerSoloNotas?: boolean; minNotas?: number } = {},
): MotivoParaNoEncolar | null {
  if (o.kind === null || o.kind === undefined) return "sin_duenio";
  if (!rutaDeLaLectura(o.kind)) return "no_es_cliente";
  if (o.puertasAdentro) return "puertas_adentro";
  if (+o.fecha > +o.ahora) return "futura";
  if (!opciones.sinCorteDeFrescura && +o.ahora - +o.fecha > DIAS_DE_FRESCURA * 86_400_000) return "vieja";
  if (o.largoTranscript < MIN_TRANSCRIPT_CHARS && !(opciones.leerSoloNotas && (o.largoNotas ?? 0) >= (opciones.minNotas ?? MIN_NOTAS_PARA_LEER))) return "sin_texto";
  return null;
}

/**
 * ¿Se encola la lectura de seguimiento de esta reunión? (de un cliente o un prospecto, no de puertas adentro, ya
 * ocurrida, fresca y con transcripción).
 */
export function debeEncolar(o: ReunionParaEncolar): boolean {
  return motivoParaNoEncolar(o) === null;
}

/**
 * ¿La lectura de seguimiento está prendida? Solo `SEGUIMIENTO_REUNIONES_ENABLED=0` la apaga: sin la variable, prendida.
 * Apagada, el enriquecimiento de Meet vuelve al post-proceso viejo (lib/sessions/post-process-viejo.ts).
 */
export function seguimientoPrendido(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.SEGUIMIENTO_REUNIONES_ENABLED !== "0";
}

/**
 * Cómo termina una fila según lo que devolvió la lectura (lib/sessions/post-process.ts): leída (o ya tenía minuta, que
 * es lo mismo: la minuta se escribe la última), sin texto, omitida (no era de un cliente ni de un prospecto) o un error
 * que se reintenta.
 */
export function finDeLaLectura(r: { status: string; reason?: string }): { estado: "lista" | "sin_texto" | "omitida" } | { estado: "error"; error: string } {
  if (r.status === "ok" || r.status === "skipped") return { estado: "lista" };
  if (r.status === "sin_texto") return { estado: "sin_texto" };
  if (r.status === "omitida") return { estado: "omitida" };
  return { estado: "error", error: r.reason?.trim() || "La lectura falló sin decir por qué." };
}

/** El texto con el que el job y el semáforo de Integraciones dicen que está apagada a propósito. */
export const MOTIVO_APAGADO = "Apagado a propósito: SEGUIMIENTO_REUNIONES_ENABLED=0 en el .env del servidor (vuelve al post-proceso viejo).";

/** El SQL que crea las columnas `seguimiento*` (lo nombran los avisos y el job cuando falta). */
export const SQL_DEL_SEGUIMIENTO = "scripts/sql/2026-10-10-lectura-de-seguimiento.sql";
