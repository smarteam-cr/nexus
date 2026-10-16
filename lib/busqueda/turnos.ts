/**
 * lib/busqueda/turnos.ts — cómo se parte una transcripción para buscar en ella, y cómo se arma la consulta (etapa 4c de
 * docs/mi-dia-plan.md). PURO.
 *
 * Un TURNO es lo que dijo una persona seguido (lib/sessions/conversacion.ts). Un monólogo largo se parte en pedazos de
 * hasta `MAX_POR_TURNO` caracteres, cortando entre oraciones: así un resultado cita un párrafo y no diez minutos.
 * Se busca sin tildes: la columna generada de la base y la consulta pasan por la misma normalización.
 */
import { comprimirConversacion } from "@/lib/sessions/conversacion";

export const MAX_POR_TURNO = 900;

export interface TurnoParaIndexar {
  orden: number;
  hablante: string;
  texto: string;
}

/** Parte un texto largo entre oraciones, sin pasar de `max` (una oración más larga que `max` se corta por palabras). */
export function partirEntreOraciones(texto: string, max = MAX_POR_TURNO): string[] {
  if (texto.length <= max) return [texto];
  const oraciones = texto.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let actual = "";
  const empujar = (s: string) => {
    if (!s) return;
    if (s.length <= max) {
      out.push(s);
      return;
    }
    let resto = s;
    while (resto.length > max) {
      const corte = resto.lastIndexOf(" ", max);
      const i = corte > max / 2 ? corte : max;
      out.push(resto.slice(0, i).trim());
      resto = resto.slice(i).trim();
    }
    if (resto) out.push(resto);
  };
  for (const o of oraciones) {
    if (!actual) actual = o;
    else if (actual.length + 1 + o.length <= max) actual = `${actual} ${o}`;
    else {
      empujar(actual);
      actual = o;
    }
  }
  empujar(actual);
  return out;
}

/** Los turnos de una transcripción, numerados en orden. */
export function turnosParaIndexar(transcript: string): TurnoParaIndexar[] {
  const { turnos } = comprimirConversacion(transcript, Number.MAX_SAFE_INTEGER);
  const out: TurnoParaIndexar[] = [];
  for (const t of turnos) for (const pedazo of partirEntreOraciones(t.texto)) out.push({ orden: out.length + 1, hablante: t.hablante, texto: pedazo });
  return out;
}

/** La huella de una transcripción: si cambia, se vuelve a partir. Largo + un hash simple (FNV-1a de 32 bits). */
export function huellaDeTranscripcion(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${t.length}:${h.toString(16)}`;
}

/** Sin tildes y en minúscula: lo mismo que hace la columna generada de la base (`translate(lower(...))`). */
export function normalizarParaBuscar(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u0302\u0308]/g, "")
    .normalize("NFC");
}

/** Palabras que no sirven para buscar lo que se habló de una reunión (el título trae muchas). */
const VACIAS = new Set([
  "de", "del", "la", "las", "el", "los", "y", "o", "a", "en", "con", "para", "por", "un", "una", "sobre", "al",
  "reunion", "sesion", "seguimiento", "llamada", "meet", "call", "sync", "kickoff", "semanal", "revision", "smarteam",
  "x", "vs", "entre",
]);

/**
 * Las palabras de un título que vale la pena buscar: sin las vacías, sin el nombre de la empresa (aparece en todas sus
 * reuniones) y sin números. Hasta 4. Vacío = no hay qué buscar.
 */
export function palabrasDelTitulo(titulo: string, nombreDeLaEmpresa: string): string[] {
  const empresa = new Set(normalizarParaBuscar(nombreDeLaEmpresa).split(/[^a-z0-9ñ]+/).filter(Boolean));
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const p of normalizarParaBuscar(titulo).split(/[^a-z0-9ñ]+/)) {
    if (p.length < 4 || /^\d+$/.test(p) || VACIAS.has(p) || empresa.has(p) || vistas.has(p)) continue;
    vistas.add(p);
    out.push(p);
    if (out.length === 4) break;
  }
  return out;
}

/** Marca dónde aparece cada palabra buscada en un texto (para resaltarla en pantalla). */
export function partesResaltadas(texto: string, q: string): { texto: string; marca: boolean }[] {
  const palabras = normalizarParaBuscar(q)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length >= 3);
  if (!palabras.length) return [{ texto, marca: false }];
  const norm = normalizarParaBuscar(texto);
  const marcas: boolean[] = new Array(texto.length).fill(false);
  for (const p of palabras) {
    let i = norm.indexOf(p);
    while (i !== -1) {
      for (let k = i; k < i + p.length && k < marcas.length; k++) marcas[k] = true;
      i = norm.indexOf(p, i + p.length);
    }
  }
  const out: { texto: string; marca: boolean }[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.marca === marcas[i]) ultimo.texto += texto[i];
    else out.push({ texto: texto[i], marca: marcas[i] });
  }
  return out;
}
