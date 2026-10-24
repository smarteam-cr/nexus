/**
 * lib/sessions/tiene-texto.ts — ¿QUÉ TEXTO DEJÓ UNA REUNIÓN? El predicado único (T2 del roadmap, 2026-10-24). PURO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * Hasta el 2026-10-24 cada lector decidía por su cuenta si una reunión «tenía texto»: unos con
 * `transcript: { not: null }` (y contaban `""`), otros con `transcript: { not: null }, NOT: { transcript: "" }`, otros con
 * el largo, y la lectura de seguimiento con sus pisos. Las notas de Gemini quedaban fuera en casi todos: medido el
 * 2026-10-23, 301 de 1.264 reuniones con empresa (24 %) tenían solo notas y Nexus las trataba como sin texto.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────────────────
 *   · «transcripcion»: la transcripción tiene `MIN_TRANSCRIPT_CHARS` caracteres o más (sin los espacios de las puntas).
 *   · «solo_notas»: sin eso, las notas de Gemini (`summary.overview`) tienen `MIN_NOTAS_PARA_LEER` o más.
 *   · «nada»: ninguna de las dos.
 * Las notas cuentan como texto: se leen igual, marcadas «solo notas». La lectura (lib/lecturas/reglas.ts), INV44, INV47,
 * el tablero de salud (T1) y las pantallas usan ESTA clase; no se vuelve a escribir un filtro suelto.
 *
 * Para Prisma, que no sabe medir un largo, hay dos formas: `DONDE_TIENE_TRANSCRIPCION` (no nula y no vacía: la de los
 * lectores que necesitan la conversación misma, como el vigía) y `DONDE_PUEDE_TENER_TEXTO` (un filtro grueso que nunca
 * deja afuera una con texto; se afina con `claseDeTexto`). En SQL crudo, `sqlClaseDeTexto` da la clase exacta sin traer
 * los textos.
 */
import { Prisma } from "@prisma/client";
import { MIN_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";
import { MIN_NOTAS_PARA_LEER } from "@/lib/seguimiento/hechos/reglas";

export { MIN_TRANSCRIPT_CHARS, MIN_NOTAS_PARA_LEER };

export const CLASES_DE_TEXTO = ["transcripcion", "solo_notas", "nada"] as const;
export type ClaseDeTexto = (typeof CLASES_DE_TEXTO)[number];

/** El texto de las notas de Gemini (`summary.overview`, texto o lista de textos). "" si no hay. */
export function notasDeLaReunion(summary: unknown): string {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  const o = (summary as { overview?: unknown }).overview;
  if (Array.isArray(o)) return o.filter((x): x is string => typeof x === "string").join("\n");
  return typeof o === "string" ? o : "";
}

/** El largo de las notas de Gemini, sin los espacios de las puntas. */
export function largoDeLasNotas(summary: unknown): number {
  return notasDeLaReunion(summary).trim().length;
}

/** El largo de la transcripción, sin los espacios de las puntas. */
export function largoDeLaTranscripcion(transcript: string | null | undefined): number {
  return (transcript ?? "").trim().length;
}

/** Qué texto dejó la reunión, desde los largos (lo que da una consulta que no trae los textos). */
export function claseDesdeLosLargos(l: { transcripcion: number; notas: number }): ClaseDeTexto {
  if (l.transcripcion >= MIN_TRANSCRIPT_CHARS) return "transcripcion";
  if (l.notas >= MIN_NOTAS_PARA_LEER) return "solo_notas";
  return "nada";
}

/** Qué texto dejó la reunión. */
export function claseDeTexto(s: { transcript?: string | null; summary?: unknown }): ClaseDeTexto {
  return claseDesdeLosLargos({ transcripcion: largoDeLaTranscripcion(s.transcript), notas: largoDeLasNotas(s.summary) });
}

/** ¿La reunión dejó texto que leer (transcripción o, sin ella, notas de Gemini)? */
export function tieneTexto(s: { transcript?: string | null; summary?: unknown }): boolean {
  return claseDeTexto(s) !== "nada";
}

/**
 * Prisma: la transcripción no es nula NI vacía (`""` no es una transcripción, lección de C-10). Un solo campo, para que
 * se pueda esparcir en cualquier `where` sin pisar su `NOT` ni su `AND`. Para quien necesita la CONVERSACIÓN misma (el
 * vigía, el analizador de venta, el resumen de una reunión): las notas no le sirven.
 * ⚠ `IS NOT NULL` y `<> ''` NO leen el texto (Postgres compara primero los largos); un `> ''` o un `length()` sí, y sobre
 * miles de transcripciones guardadas aparte (TOAST) eso pesa. Por eso no se mide el largo acá.
 */
export const DONDE_TIENE_TRANSCRIPCION = { transcript: { not: null, notIn: [""] } } satisfies Prisma.FirefliesSessionWhereInput;

/** Prisma: la transcripción es nula o vacía (el complemento exacto de `DONDE_TIENE_TRANSCRIPCION`). */
export const DONDE_NO_TIENE_TRANSCRIPCION = { OR: [{ transcript: null }, { transcript: "" }] } satisfies Prisma.FirefliesSessionWhereInput;

/**
 * Prisma: un filtro GRUESO de «puede tener texto» (transcripción no vacía, o resumen guardado). Nunca deja afuera una
 * reunión con texto, pero deja pasar las de notas cortas: quien lo usa afina con `claseDeTexto` (o con
 * `sqlClaseDeTexto` en SQL). Se usa con `AND: [DONDE_PUEDE_TENER_TEXTO]` (trae su propio `OR`).
 */
export const DONDE_PUEDE_TENER_TEXTO = {
  OR: [DONDE_TIENE_TRANSCRIPCION, { summary: { not: Prisma.AnyNull } }],
} satisfies Prisma.FirefliesSessionWhereInput;

/**
 * SQL: la clase de texto de la reunión (`'transcripcion' | 'solo_notas' | 'nada'`), sin traer los textos. `alias` es el
 * de la tabla `FirefliesSession` en la consulta. La transcripción se mide con `octet_length`, en BYTES y sin recortar
 * espacios: Postgres lo sabe sin leer el texto guardado aparte (TOAST), y un `btrim`/`length` lo leería entero en cada
 * fila (~16 mil). La diferencia con `claseDeTexto` solo aparece en una transcripción de menos de 200 letras con tildes o
 * con espacios de relleno, que no es una conversación. El largo de las notas mide el texto del `overview` (si es una
 * lista, su JSON: un poco más largo que el texto, lo mismo para el piso de 400).
 */
export function sqlClaseDeTexto(alias = "s"): Prisma.Sql {
  const t = Prisma.raw(`"${alias.replace(/[^A-Za-z0-9_]/g, "")}"`);
  return Prisma.sql`(CASE
    WHEN coalesce(octet_length(${t}."transcript"), 0) >= ${MIN_TRANSCRIPT_CHARS} THEN 'transcripcion'
    WHEN jsonb_typeof(${t}."summary") = 'object' AND length(btrim(coalesce(${t}."summary"->>'overview', ''))) >= ${MIN_NOTAS_PARA_LEER} THEN 'solo_notas'
    ELSE 'nada' END)`;
}
