/**
 * lib/landing/por-que-vacia.ts — EL PORQUÉ DE UNA SECCIÓN VACÍA (2026-10-29, feedback de Elías sobre la Planificación).
 *
 * «En vez de entregarlas en blanco, deberían por lo menos explicar por qué. Por ejemplo: "No encontré en las sesiones con
 * qué llenar los pipelines".» Cuando el agente no tiene con qué llenar una sección, la deja vacía (inventar es peor) y su
 * data lleva una línea que lo dice, en `__porQueVacia`. Puro y client-safe: lo usan el runner que la escribe y el motor que
 * la pinta.
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 *  · Es del EQUIPO: el motor la pinta solo en modo edición, como aviso (no como contenido) y con «Quitar». En modo
 *    lectura (el enlace del cliente y el PDF) no existe: `__porQueVacia` está en `NO_CONTENIDO` (lib/landing/is-blank.ts),
 *    así una sección vacía con su porqué sigue vacía y se omite.
 *  · Se ve solo mientras la sección está vacía: apenas alguien escribe algo, el aviso sobra. `alEditar` lo saca de la data
 *    en la primera edición con contenido, así no reaparece si después se vacía.
 *  · Regenerar lo vuelve a calcular: una sección que ahora tiene contenido lo pierde.
 */
import { isBlank } from "./is-blank";

export const CLAVE_POR_QUE_VACIA = "__porQueVacia";

/** El tope de la línea: es un aviso, no un párrafo. */
export const LARGO_DEL_POR_QUE = 280;

/** El porqué guardado en la data de la sección, o null. */
export function porQueVacia(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = (data as Record<string, unknown>)[CLAVE_POR_QUE_VACIA];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** La línea, en una sola línea y con su tope. */
export function normalizarPorQue(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= LARGO_DEL_POR_QUE ? t : `${t.slice(0, LARGO_DEL_POR_QUE - 1).trimEnd()}…`;
}

/** La data con su porqué (o sin él, con `null` o una línea vacía). No toca nada más. */
export function conPorQueVacia<T extends object>(data: T, razon: string | null): T {
  const out = { ...(data as Record<string, unknown>) };
  const r = razon ? normalizarPorQue(razon) : "";
  if (r) out[CLAVE_POR_QUE_VACIA] = r;
  else delete out[CLAVE_POR_QUE_VACIA];
  return out as T;
}

/** La data sin el porqué. */
export function sinPorQueVacia<T extends object>(data: T): T {
  return conPorQueVacia(data, null);
}

/**
 * Lo que se guarda cuando alguien edita la sección: si ya tiene contenido, sin el porqué (sobra y no tiene que volver si
 * después se vacía); si sigue vacía, tal cual.
 */
export function alEditar<T>(data: T, vacia: (d: T) => boolean): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (porQueVacia(data) === null || vacia(data)) return data;
  return sinPorQueVacia(data as unknown as object) as unknown as T;
}

/** ¿La tarjeta no tiene nada más que el porqué? Es la que la corrida crea en una sección curada que no tenía ninguna. */
export function esSoloElPorQue(data: unknown): boolean {
  return porQueVacia(data) !== null && isBlank(data);
}

/** El aviso que el motor pinta: el porqué, solo si la sección sigue vacía. */
export function avisoDeLaSeccion(data: unknown, vacia: boolean): string | null {
  return vacia ? porQueVacia(data) : null;
}
