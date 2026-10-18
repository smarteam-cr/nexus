/**
 * lib/operaciones/tipos.ts — el contrato de una operación de Nexus (2026-10-16, fase 0.4 de
 * docs/nexus-sistema-de-trabajo-plan.md). PURO.
 *
 * Una operación es algo que se puede hacer en Nexus desde la pantalla o desde el chat, escrito UNA vez:
 *   · `nombre` («tarea.crear») y `paraQue`: lo que lee el modelo para elegirla (en tuteo, una o dos frases);
 *   · `pide`: el esquema zod de la entrada. De él sale el esquema de la herramienta del chat (./herramientas.ts), así
 *     la pantalla, la ruta y el chat validan con lo mismo;
 *   · `clase`: «lee» (solo devuelve datos) o «propone» (cambia algo y pasa por una persona antes de aplicarse);
 *   · `leer` (las que leen) o `preparar` + `aplicar` (las que proponen).
 *
 * ⛔ La persona va EXPLÍCITA en el contexto, nunca se lee de la sesión: lo mismo vale para un pedido de la pantalla, un
 * turno del chat o un job. `preparar` no escribe nada: valida, resuelve los nombres y arma la línea que se lee antes de
 * aplicar. `aplicar` escribe por el escritor único de su módulo (Tareas, notas, siguiente paso), que es quien hace
 * cumplir las reglas y la transacción de lo suyo.
 */
import type { z } from "zod";

export type ClaseDeOperacion = "lee" | "propone";

/** Lo que una operación sabe de quién la pide y cuándo. Lo arma lib/operaciones/contexto-server.ts. */
export interface ContextoDeOperacion<Persona = unknown, Extras = unknown> {
  persona: Persona;
  ahora: Date;
  /** Lo que se calcula una vez por pedido (la visibilidad de Tareas, los clientes que ve…). */
  extras: Extras;
  /**
   * Reconoce, POR CLASE, los errores de los escritores que traen un mensaje para la persona (ErrorDeTareas,
   * ErrorDeLaNota, ErrorDelPaso…). Lo pone lib/operaciones/contexto-server.ts. Sin él (las pruebas puras) se mira solo
   * la forma, con `esErrorConMotivo`.
   */
  esErrorPropio?: (e: unknown) => e is ErrorConMotivo;
}

/** Lo que devuelve `preparar`: lo que se va a hacer, ya validado, con la línea que lo dice. */
export type Preparada<D> = { ok: true; datos: D; linea: string } | { ok: false; motivo: string };

interface Base<E> {
  nombre: string;
  paraQue: string;
  pide: z.ZodType<E>;
}

export interface OperacionQueLee<E = unknown, R = unknown, C extends ContextoDeOperacion = ContextoDeOperacion> extends Base<E> {
  clase: "lee";
  leer: (ctx: C, entrada: E) => Promise<R>;
}

export interface OperacionQuePropone<E = unknown, D = unknown, R = unknown, C extends ContextoDeOperacion = ContextoDeOperacion>
  extends Base<E> {
  clase: "propone";
  preparar: (ctx: C, entrada: E) => Promise<Preparada<D>>;
  aplicar: (ctx: C, datos: D) => Promise<R>;
}

// `any` en el registro: cada operación tiene sus propios tipos de entrada y de datos; el orquestador valida con `pide`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el registro junta operaciones de tipos distintos
export type Operacion<C extends ContextoDeOperacion = ContextoDeOperacion> = OperacionQueLee<any, any, C> | OperacionQuePropone<any, any, any, C>;

/** Un error de un escritor con su estado HTTP y un mensaje para la persona (ErrorDeTareas, ErrorDelPaso…). */
export interface ErrorConMotivo {
  status: number;
  message: string;
}

/**
 * ⚠ Mira solo la FORMA (un `status` numérico y un `message`), y esa forma la cumple también el `APIError` del SDK de
 * Anthropic: un 401/429/529 de la API saldría con su estado y su texto crudo. Por eso en el servidor manda
 * `ContextoDeOperacion.esErrorPropio`, que distingue por clase; esto queda para las pruebas puras.
 */
export function esErrorConMotivo(e: unknown): e is ErrorConMotivo {
  return !!e && typeof e === "object" && typeof (e as { status?: unknown }).status === "number" && typeof (e as { message?: unknown }).message === "string";
}
