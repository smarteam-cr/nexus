/**
 * lib/escala/eleccion-guardada.ts — las áreas elegidas en La escala sobreviven a recargar (novena vuelta, 2026-11-08; lo
 * cazó una revisión del 8 nov: al recargar volvían a una sola).
 *
 * Se guarda en el NAVEGADOR (`localStorage`), por exploración y por lugar: la elección es de quien mira, no de la
 * exploración. Guardarla en el estado compartido haría que lo que mira un vendedor le cambie la vista a otro, y cada clic
 * sería una escritura al servidor. Sin SQL. Por persona = por navegador: en otra computadora vuelve a la de entrada.
 *
 * PURO salvo `cargarLaEleccion` / `guardarLaEleccion`, que tocan `localStorage` envueltos en try/catch (en una ventana
 * privada, con el almacenamiento bloqueado o lleno, no se recuerda y nada se rompe).
 */
import type { EleccionDeAreas } from "./areas-superpuestas";

const PREFIJO = "nexus-escala-areas";

/** La clave de una exploración en un lugar (preventa, proyecto, cuenta). */
export const claveDeLaEleccion = (lugar: string, exploracionId: string) => `${PREFIJO}:${lugar}:${exploracionId}`;

/**
 * Lee lo guardado con tolerancia: solo áreas que existen hoy en la escala, sin repetir, y la principal solo si quedó
 * elegida. Lo ilegible o de otra forma es `null` (se usa la de entrada). Una lista vacía vale: se soltaron todas.
 */
export function leerLaEleccion(texto: string | null, areasDeLaEscala: readonly string[]): EleccionDeAreas | null {
  if (!texto) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!crudo || typeof crudo !== "object" || !Array.isArray((crudo as { elegidas?: unknown }).elegidas)) return null;
  const { elegidas, principalId } = crudo as { elegidas: unknown[]; principalId?: unknown };
  const validas = [...new Set(elegidas.filter((x): x is string => typeof x === "string" && areasDeLaEscala.includes(x)))];
  // Lo guardado tenía áreas y ninguna existe ya: mejor la de entrada que una pantalla vacía que nadie eligió.
  if (elegidas.length > 0 && validas.length === 0) return null;
  const principal = typeof principalId === "string" && validas.includes(principalId) ? principalId : null;
  return { elegidas: validas, principalId: principal };
}

/** Lo que se guarda. */
export const textoDeLaEleccion = (e: EleccionDeAreas): string => JSON.stringify({ elegidas: [...e.elegidas], principalId: e.principalId });

/** Lo guardado en este navegador para esa clave, o `null`. Nunca lanza. */
export function cargarLaEleccion(clave: string, areasDeLaEscala: readonly string[]): EleccionDeAreas | null {
  try {
    return leerLaEleccion(window.localStorage.getItem(clave), areasDeLaEscala);
  } catch {
    return null;
  }
}

/** Guarda la elección en este navegador. Nunca lanza. */
export function guardarLaEleccion(clave: string, e: EleccionDeAreas): void {
  try {
    window.localStorage.setItem(clave, textoDeLaEleccion(e));
  } catch {
    /* Sin almacenamiento (ventana privada, bloqueado o lleno): no se recuerda. */
  }
}

/** El texto guardado tal cual (para `useSyncExternalStore`: un texto es estable entre lecturas). Nunca lanza. */
export function textoGuardado(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/** Para `useSyncExternalStore`: avisa si otra pestaña cambió lo guardado. */
export function suscribirseALoGuardado(avisar: () => void): () => void {
  try {
    window.addEventListener("storage", avisar);
    return () => window.removeEventListener("storage", avisar);
  } catch {
    return () => undefined;
  }
}
