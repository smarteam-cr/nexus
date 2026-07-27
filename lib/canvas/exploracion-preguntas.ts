/**
 * lib/canvas/exploracion-preguntas.ts — la forma de UNA pregunta del plan de sesiones.
 *
 * Puro y sin React: lo consume el componente (components/canvas/exploracion-sections)
 * y lo testea `lib/**` (el project unit de vitest solo incluye lib/).
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * `preguntas` nació como `string[]`. Ahora una pregunta necesita tres cosas —el texto,
 * qué REPREGUNTAR si la respuesta sale vaga, y si el CSE ya la hizo— así que pasa a ser
 * un objeto. El documento de Wherex (el único generado) tiene 15 preguntas guardadas
 * como strings sueltos: `normalizarPreguntas` las levanta sin migración de datos, igual
 * que el fallback legacy de `porQuePlataforma` en el motor. La migración ocurre sola la
 * primera vez que el CSE edita esa sesión.
 *
 * ── POR QUÉ `hecha` ES UN STRING Y NO UN BOOLEAN ─────────────────────────────
 * `coerceToSchema` (lib/ai/section-schema.ts) aplana TODA hoja a string: un `true`
 * sobreviviría como `""`. El repo ya resolvió esto —ver la nota de `isSi` en
 * components/landing/inline.tsx— con casillas que hablan "si"/"no". Se respeta.
 *
 * ── POR QUÉ `hecha` NO ESTÁ EN EL SCHEMA DEL AGENTE ──────────────────────────
 * Si estuviera, el agente podría marcar preguntas como hechas — y una pregunta que
 * Nexus da por hecha sin que nadie la haya hecho es exactamente la mentira que este
 * documento existe para evitar. Dejándola FUERA del schema, `coerceToSchema` la
 * descarta de la salida del modelo: la invariante la sostiene el tipo, no un pedido en
 * el brief. La UI sí la persiste, porque el guardado del canvas escribe `data` tal cual
 * (useCanvasSections.upsertCardData → PUT del bloque, sin coerción).
 *
 * COROLARIO ACEPTADO: regenerar la sección BORRA las marcas, porque reescribe las
 * preguntas. Es correcto — una marca sobre una pregunta que ya no existe no significa
 * nada. La UI lo avisa antes (ver ExploracionSections).
 */
import { isSi } from "@/lib/ui/si-no";

/** Una pregunta del plan de sesiones, ya normalizada. */
export interface ExploracionPregunta {
  /** La pregunta literal, tal como se va a hacer. La escribe el agente. */
  q: string;
  /** Qué repreguntar si la respuesta sale vaga o genérica. La escribe el agente. */
  repregunta?: string;
  /** "si" = el CSE ya la hizo. SOLO la escribe la UI (ver cabecera). */
  hecha?: string;
}

/** Lo que puede venir guardado: el string suelto legacy o el objeto nuevo. */
export type PreguntaGuardada = string | ExploracionPregunta | null | undefined;

/** Levanta el formato viejo (`string`) al nuevo sin perder nada. Tolera basura. */
export function normalizarPregunta(p: PreguntaGuardada): ExploracionPregunta {
  if (typeof p === "string") return { q: p };
  if (!p || typeof p !== "object") return { q: "" };
  return {
    q: typeof p.q === "string" ? p.q : "",
    repregunta: typeof p.repregunta === "string" ? p.repregunta : undefined,
    hecha: typeof p.hecha === "string" ? p.hecha : undefined,
  };
}

export function normalizarPreguntas(ps: PreguntaGuardada[] | undefined | null): ExploracionPregunta[] {
  return (ps ?? []).map(normalizarPregunta);
}

/** Cuántas están marcadas y cuántas hay — el contador del encabezado del grupo. */
export function contarHechas(ps: ExploracionPregunta[]): { hechas: number; total: number } {
  return { hechas: ps.filter((p) => isSi(p.hecha)).length, total: ps.length };
}

/** Total de marcas de TODAS las sesiones: es lo que se pierde al regenerar, y por eso
 *  la UI lo usa para avisar ANTES en vez de sorprender después. */
export function contarMarcasDelPlan(
  sesiones: { preguntas?: PreguntaGuardada[] }[] | undefined | null,
): number {
  return (sesiones ?? []).reduce(
    (a, s) => a + normalizarPreguntas(s.preguntas).filter((p) => isSi(p.hecha)).length,
    0,
  );
}
