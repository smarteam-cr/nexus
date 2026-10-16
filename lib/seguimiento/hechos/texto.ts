/**
 * lib/seguimiento/hechos/texto.ts — QUÉ TEXTO de una reunión lee la lectura de hechos. PURO: lo usan el servidor
 * (texto-de-la-reunion.ts) y las pruebas.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────────────────
 *  · Con transcripción: lo DICHO, comprimido y numerado por turno (lib/sessions/conversacion.ts), hasta 60.000
 *    caracteres. Los turnos viajan aparte: con ellos se sabe quién dijo cada cita (salida.ts).
 *  · Si la conversación no entró entera o es larga, se le suman las notas priorizadas de Gemini (decisiones y próximos
 *    pasos enteros, lib/sessions/notas-de-gemini.ts): cubren lo que quedó afuera.
 *  · Sin transcripción, solo las notas (fuente «notas»): el 21 % de las reuniones con cliente solo tiene notas.
 *  · Un texto sumado a mano (una minuta, una sesión que no quedó grabada) entra como fuente «texto».
 *
 * Cada parte lleva su fuente: la cita se verifica contra la parte donde aparece, y el hecho guarda de dónde salió.
 */
import { comprimirConversacion, conversacionComoTexto, type Turno } from "@/lib/sessions/conversacion";
import { notasPriorizadas } from "@/lib/sessions/notas-de-gemini";
import { recuerdoDeLaReunion } from "@/lib/sessions/reunion-a-mano";
import type { FuenteDelTexto } from "./tipos";

/** Cuánto de la conversación se lee: el mismo tope que la lectura de seguimiento. */
export const TOPE_DEL_TEXTO = 60_000;

/** Con más que esto la conversación es larga: se le suman las notas priorizadas. */
export const CONVERSACION_LARGA = 30_000;

/** Menos que esto (de conversación o de notas) no deja nada que leer. */
export const MIN_CARACTERES_PARA_LEER = 400;

export interface ParteDelTexto {
  fuente: FuenteDelTexto;
  texto: string;
}

export interface TextoDeLaReunion {
  /** Lo que se le manda al modelo, en partes, con su fuente. */
  partes: ParteDelTexto[];
  /** Los turnos de la conversación (vacío si no hay transcripción o no tiene la forma «Nombre: lo dicho»). */
  turnos: Turno[];
  /** La fuente principal: la transcripción si hay conversación; si no, las notas o el texto sumado. */
  fuente: FuenteDelTexto;
  /** La conversación no entró entera en el tope: faltan turnos del final. */
  recortada: boolean;
  /** Los caracteres de todo lo que se manda. */
  caracteres: number;
}

/** El encabezado de cada parte, como lo lee el modelo. */
export const ENCABEZADO_DE_LA_PARTE: Record<FuenteDelTexto, string> = {
  transcripcion: "--- Transcripción (cada turno: [número] Nombre: lo que dijo) ---",
  notas: "--- Notas de Gemini ---",
  texto: "--- Texto sumado a mano ---",
};

const comoTexto = (v: unknown): string =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).join("\n") : typeof v === "string" ? v : "";

/**
 * Las notas de Gemini enteras: el resumen, sus secciones y los próximos pasos. Es la misma lectura que la preventa
 * (`textoDeLasNotasDeGemini`, lib/exploraciones/lectura.ts), escrita acá porque importar de la preventa la volvería un
 * lector de la exploración (lib/exploraciones/lectores.test.ts). ⚠ Si cambia una, cambia la otra.
 */
export function notasComoTexto(summary: unknown): string {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  const s = summary as { overview?: unknown; sections?: unknown; action_items?: unknown };
  const partes: string[] = [];
  const resumen = comoTexto(s.overview).trim();
  if (resumen) partes.push(resumen);
  if (Array.isArray(s.sections)) {
    for (const sec of s.sections) {
      if (!sec || typeof sec !== "object") continue;
      const t = (sec as { title?: unknown }).title;
      const c = (sec as { content?: unknown }).content;
      if (typeof c === "string" && c.trim()) partes.push(typeof t === "string" && t.trim() ? `${t.trim()}:\n${c.trim()}` : c.trim());
    }
  }
  const pasos = comoTexto(s.action_items).trim();
  if (pasos) partes.push(`Próximos pasos:\n${pasos}`);
  return partes.join("\n\n").trim();
}

/** El resumen de Gemini (el texto con «Resumen / Decisiones / Próximos pasos / Detalles»), si lo trae. */
const overview = (summary: unknown): string => {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  return comoTexto((summary as { overview?: unknown }).overview).trim();
};

/**
 * Arma el texto de una reunión. null si no deja nada que leer (sin conversación, sin notas y sin texto sumado, o
 * todo por debajo de `MIN_CARACTERES_PARA_LEER`).
 */
export function armarTextoDeLaReunion(
  e: { transcript: string | null | undefined; summary: unknown; textoSumado?: string | null },
  tope: number = TOPE_DEL_TEXTO,
): TextoDeLaReunion | null {
  const partes: ParteDelTexto[] = [];
  let turnos: Turno[] = [];
  let recortada = false;
  let conConversacion = false;

  const transcript = (e.transcript ?? "").trim();
  if (transcript) {
    const c = comprimirConversacion(transcript, tope);
    if (c.turnos.length && c.caracteres >= MIN_CARACTERES_PARA_LEER) {
      turnos = c.turnos;
      recortada = c.recortada;
      conConversacion = true;
      partes.push({ fuente: "transcripcion", texto: conversacionComoTexto(c.turnos) });
      // Larga o recortada: las notas priorizadas cubren lo que no entró (o lo que se pierde en tanto texto).
      if (c.recortada || c.caracteres > CONVERSACION_LARGA) {
        const notas = notasPriorizadas(overview(e.summary));
        if (notas.trim().length >= MIN_CARACTERES_PARA_LEER) partes.push({ fuente: "notas", texto: notas.trim() });
      }
    } else if (!c.turnos.length && transcript.length >= MIN_CARACTERES_PARA_LEER) {
      // Una transcripción sin la forma «Nombre: lo dicho»: se lee cruda, cortada al tope, sin turnos.
      conConversacion = true;
      recortada = transcript.length > tope;
      partes.push({ fuente: "transcripcion", texto: transcript.slice(0, tope) });
    }
  }

  // Lo que alguien recuerda de una reunión agregada a mano no son notas de Gemini: va como texto sumado a mano, que
  // nunca cuenta como palabras del cliente (lib/sessions/reunion-a-mano.ts).
  const recuerdo = recuerdoDeLaReunion(e.summary);
  if (!conConversacion && !recuerdo) {
    const notas = notasComoTexto(e.summary);
    if (notas.length >= MIN_CARACTERES_PARA_LEER) partes.push({ fuente: "notas", texto: notas.slice(0, tope) });
  }

  const sumado = [e.textoSumado ?? "", conConversacion ? "" : (recuerdo ?? "")]
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n");
  if (sumado.length >= MIN_CARACTERES_PARA_LEER) partes.push({ fuente: "texto", texto: sumado.slice(0, tope) });

  if (!partes.length) return null;
  return {
    partes,
    turnos,
    fuente: partes[0].fuente,
    recortada,
    caracteres: partes.reduce((s, p) => s + p.texto.length, 0),
  };
}

/** Lo que lee el modelo: cada parte con su encabezado. */
export function textoParaElModelo(t: TextoDeLaReunion): string {
  return t.partes.map((p) => `${ENCABEZADO_DE_LA_PARTE[p.fuente]}\n${p.texto}`).join("\n\n");
}
