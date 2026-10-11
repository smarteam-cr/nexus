/**
 * lib/tareas/texto.ts — huellas y parecidos del texto de una tarea. CLIENT-SAFE y puro, sin red ni IA.
 *
 * Dos cosas distintas, a propósito:
 *  - `huellaDeTexto`: iguala SOLO textos idénticos (una vez normalizados). Es la clave del único parcial de
 *    propuestas y el id estable de una línea de la reunión: si Gemini mueve una línea de lugar, su id no cambia.
 *  - `raices` y `cuanSeParecen`: un parecido léxico para ORDENAR candidatas («¿Es T-12?») y para ver si varias
 *    líneas pueden ser un proyecto. Nunca decide solo: la IA o una persona elige.
 */

const TILDES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** Minúsculas, sin tildes, sin signos, con un espacio entre palabras. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(TILDES, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** cyrb53: un hash de 53 bits, determinista y sin dependencias (sirve en el navegador y en el servidor). */
function cyrb53(texto: string, semilla = 0): number {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** La huella del texto ENTERO normalizado: solo iguala textos idénticos. */
export function huellaDeTexto(texto: string): string {
  return cyrb53(normalizar(texto)).toString(36);
}

const CONECTORES = new Set(
  (
    "el la los las lo un una unos unas de del al a en y o u que se no es son por para con sin su sus tu tus mi mis te " +
    "le les ya ni mas pero como cuando donde quien cual este esta estos estas ese esa eso esto hay muy tan todo todos " +
    "toda todas cada ser fue hace hacer tiene tener antes despues hoy me nos yo tambien solo puede poder debe estar " +
    "dos tres sobre entre hasta desde segun bien nuevo nueva nuevos nuevas"
  ).split(" "),
);

const RAIZ = 5;

/**
 * Las raíces de un texto: las palabras de 4 letras o más (sin conectores) recortadas a 5, más las SIGLAS del texto
 * original (2 a 5 mayúsculas: «SAP», «CRM»), que son justo los nombres propios cortos que más agrupan.
 */
export function raices(texto: string): string[] {
  const siglas = (texto.match(/\b[A-ZÑ]{2,5}\b/g) ?? []).map((s) => `#${s.toLowerCase()}`);
  const palabras = normalizar(texto)
    .split(" ")
    .filter((w) => w.length >= 4 && !CONECTORES.has(w))
    .map((w) => w.slice(0, RAIZ));
  return [...new Set([...siglas, ...palabras])];
}

export interface Parecido {
  comunes: string[];
  /** Comunes sobre el más corto (0 a 1). */
  proporcion: number;
}

export function cuanSeParecen(a: string, b: string): Parecido {
  const ra = raices(a);
  const rb = new Set(raices(b));
  const comunes = ra.filter((r) => rb.has(r));
  const corto = Math.min(ra.length, rb.size);
  return { comunes, proporcion: corto === 0 ? 0 : comunes.length / corto };
}

/**
 * ¿Es una candidata CLARA para preguntar «¿Es esta?» sin la IA? 2 raíces o más en común, al menos 2/3 del título
 * más corto, y que la diferencia no sea una sigla o un nombre propio (el cliente de una y otra).
 */
export function esCandidataClara(texto: string, candidata: string): boolean {
  const p = cuanSeParecen(texto, candidata);
  if (p.comunes.length < 2 || p.proporcion < 2 / 3) return false;
  const siglasA = raices(texto).filter((r) => r.startsWith("#"));
  const siglasB = raices(candidata).filter((r) => r.startsWith("#"));
  const distintas = siglasA.some((s) => !siglasB.includes(s)) || siglasB.some((s) => !siglasA.includes(s));
  return !distintas;
}

/** Las candidatas ordenadas por parecido (las que no comparten nada, fuera), como mucho `n`. */
export function masParecidas<T>(texto: string, candidatas: readonly T[], textoDe: (c: T) => string, n: number): T[] {
  return candidatas
    .map((c) => ({ c, p: cuanSeParecen(texto, textoDe(c)) }))
    .filter((x) => x.p.comunes.length > 0)
    .sort((x, y) => y.p.comunes.length - x.p.comunes.length || y.p.proporcion - x.p.proporcion)
    .slice(0, n)
    .map((x) => x.c);
}

/**
 * ¿Hay una raíz que comparten `minimo` o más textos? Es la señal (0 tokens) de que varias líneas pueden ser un
 * proyecto (R10): con ella se llama a Haiku para que diga si lo son.
 */
export function raicesCompartidas(textos: readonly string[], minimo: number): string[] {
  const cuenta = new Map<string, number>();
  for (const t of textos) for (const r of raices(t)) cuenta.set(r, (cuenta.get(r) ?? 0) + 1);
  return [...cuenta.entries()].filter(([, n]) => n >= minimo).map(([r]) => r);
}
