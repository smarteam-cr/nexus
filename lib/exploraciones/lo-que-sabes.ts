/**
 * lib/exploraciones/lo-que-sabes.ts — «AGREGAR ALGO QUE SABES» (K6 del roadmap, 2026-10-27). PURO y client-safe.
 *
 * Lo que alguien del equipo sabe del cliente y no quedó en ninguna reunión: lo que Marco le contó a Liz, lo que dijo por
 * WhatsApp, lo que se sabe de la industria. Hasta acá llegaba a la guía solo atado a una sesión (las notas de la sesión) o
 * como un documento resumido en 900 caracteres; una nota suelta no entraba a «Lo que ya sabemos».
 *
 * Cada cosa es una nota de la exploración (`contenido.notas`, clave `sabido:<id>`), con la operación `nota` de siempre:
 * sin SQL. Entra ENTERA a la guía cuando es corta (hasta `LARGO_ENTERO`); una larga entra hasta ahí, con el aviso. Como
 * nota del vendedor también es fuente del agente al leer (fuentes.ts › textoDeLasNotas, N0). No es palabra del cliente:
 * la guía la toma como contexto a validar, nunca como algo que el cliente dijo.
 */

export const PREFIJO_DE_LO_QUE_SABES = "sabido:";
/** Hasta cuántos caracteres entra entera a la guía. */
export const LARGO_ENTERO = 1500;
/** El bloque entero, con todas. */
export const LARGO_DEL_BLOQUE = 6000;
/** Cuántas se pueden agregar (una exploración tiene un registro de notas compartido). */
export const MAX_LO_QUE_SABES = 30;

export function esClaveDeLoQueSabes(clave: string): boolean {
  return clave.startsWith(PREFIJO_DE_LO_QUE_SABES);
}

/** Una clave nueva: el instante en base 36, así se ordenan por cuándo se agregaron. */
export function claveNuevaDeLoQueSabes(ahora = Date.now()): string {
  return `${PREFIJO_DE_LO_QUE_SABES}${ahora.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Cuándo se agregó (ms), por su clave. null si la clave no se entiende. */
export function cuandoSeAgrego(clave: string): number | null {
  // Los primeros 8: el instante en base 36 (hasta el año 2059); lo que sigue es el azar.
  const m = /^sabido:([0-9a-z]{8})/.exec(clave);
  if (!m) return null;
  const n = parseInt(m[1], 36);
  return Number.isFinite(n) ? n : null;
}

/** Lo que sabe el equipo, de lo más viejo a lo más nuevo, sin las vacías. */
export function loQueSabeElEquipo(notas: Readonly<Record<string, string>>): { clave: string; texto: string }[] {
  return Object.entries(notas)
    .filter(([k, t]) => esClaveDeLoQueSabes(k) && t.trim())
    .map(([clave, texto]) => ({ clave, texto: texto.trim() }))
    .sort((a, b) => a.clave.localeCompare(b.clave));
}

/** Lo que va a la guía: cada una entera si es corta; una larga, hasta `LARGO_ENTERO`. El bloque, hasta `LARGO_DEL_BLOQUE`. */
export function loQueSabesParaLaGuia(notas: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  let usado = 0;
  for (const { texto } of loQueSabeElEquipo(notas)) {
    const linea = texto.length > LARGO_ENTERO ? `${texto.slice(0, LARGO_ENTERO - 1).trimEnd()}… (sigue; está entera en las notas de la exploración)` : texto;
    if (usado + linea.length > LARGO_DEL_BLOQUE) break;
    out.push(linea.replace(/\s*\n\s*/g, " / "));
    usado += linea.length;
  }
  return out;
}

/** El rótulo de una de estas notas como fuente del agente. */
export const ROTULO_DE_LO_QUE_SABES = "Lo que sabe el equipo (lo agregó quien lleva la exploración; no lo dijo el cliente en una sesión)";
