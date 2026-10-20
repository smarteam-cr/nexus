/**
 * lib/tareas/titulo-corto.ts — el nombre corto de una tarea y el título de su bloque en el calendario (2026-10-20,
 * decisión de Elías). CLIENT-SAFE y puro.
 *
 * Fuera de Tareas, una tarea se nombra para una persona: «Cayalá – Enviar propuesta a Marta | Espacio interno», no
 * «T-180 · Preparar y enviar a Marta la propuesta de…». El nombre corto lo escribe la IA cuando nace la tarea
 * (`Tarea.tituloCorto`, lib/tareas/ia/titulo-corto-server.ts); mientras no lo tiene, se recorta el título sin cortar
 * una palabra. El número T-n queda solo dentro de Tareas.
 */

/** Cuántas palabras, como mucho, deja el recorte del título cuando todavía no hay nombre corto. */
export const PALABRAS_DEL_RECORTE = 6;
/** El largo que se le pide a la IA, y el del recorte del título. */
export const TOPE_DEL_TITULO_CORTO = 48;
/** Lo que se le tolera a la IA antes de recortar (la base acepta hasta 80). */
export const TOPE_TOLERADO = 60;
/** Lo que dice el bloque de una tarea en el calendario: es tiempo de trabajo, no una reunión con el cliente. */
export const ESPACIO_INTERNO = "Espacio interno";

/** Palabras con las que una frase no puede terminar: dejan el nombre colgando («Pedirle a Ana los»). */
const COLGANTES = new Set(["a", "al", "de", "del", "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "y", "o", "que", "en", "con", "para", "por", "sin", "sobre", "su", "sus", "e", "u", "primer", "primera", "segundo", "segunda", "tercer", "tercera", "cada", "este", "esta", "otro", "otra"]);

/** Hasta `tope` caracteres y `palabras` palabras, sin cortar una palabra ni terminar en un signo o una palabra colgante. */
export function recortarA(texto: string, tope: number, palabras = Infinity): string {
  const todas = texto.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const out: string[] = [];
  for (const p of todas) {
    if (out.length >= palabras) break;
    if ([...out, p].join(" ").length > tope && out.length) break;
    out.push(p);
  }
  while (out.length > 1 && COLGANTES.has(out[out.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ""))) out.pop();
  return out.join(" ").replace(/[\s,;:.\-–—(]+$/u, "");
}

/** El título recortado a unas pocas palabras, sin cortar una palabra ni dejarlo colgando. */
export function recortarTitulo(titulo: string): string {
  return recortarA(titulo, TOPE_DEL_TITULO_CORTO, PALABRAS_DEL_RECORTE);
}

/** El nombre corto de la tarea: el que escribió la IA o, si todavía no hay, el título recortado. */
export function nombreCortoDeLaTarea(t: { titulo: string; tituloCorto?: string | null }): string {
  return t.tituloCorto?.trim() || recortarTitulo(t.titulo);
}

/** De quién es la tarea en el título: el cliente o, si es interna, su ámbito; sin ninguno, Smarteam. */
export function deQuienEsLaTarea(t: { empresa?: string | null; ambito?: string | null }): string {
  return t.empresa?.trim() || t.ambito?.trim() || "Smarteam";
}

/** El título del bloque de una tarea en el calendario: «Cayalá – Enviar propuesta a Marta | Espacio interno». */
export function tituloDelBloque(t: { titulo: string; tituloCorto?: string | null; empresa?: string | null; ambito?: string | null }): string {
  return `${deQuienEsLaTarea(t)} – ${nombreCortoDeLaTarea(t)} | ${ESPACIO_INTERNO}`;
}

/** La tarea nombrada para una persona, sin el «Espacio interno» (una sugerencia, una lista): «Cayalá – Enviar propuesta». */
export function tareaParaUnaPersona(t: { titulo: string; tituloCorto?: string | null; empresa?: string | null; ambito?: string | null }): string {
  return `${deQuienEsLaTarea(t)} – ${nombreCortoDeLaTarea(t)}`;
}
