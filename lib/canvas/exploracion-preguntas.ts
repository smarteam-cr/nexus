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
 * ⛔ REGENERAR NO BORRA LAS MARCAS (pedido de Elías, 2026-10-02). Antes se aceptaba que
 * se perdieran; ahora `conservarMarcas` las arrastra: una pregunta marcada que vuelve
 * (mismo texto normalizado) conserva su marca, y una marcada que el agente ya no trae
 * se agrega de vuelta a su sesión. Lo que el CSE ya preguntó no se borra nunca.
 *
 * ⚠ EL MISMO BORRADO, PERO SIN AVISO, ESPERA EN EL ASSIST. `preserveNonSchemaKeys`
 * (lib/ai/section-schema.ts) es SHALLOW: solo conserva keys fuera de schema de PRIMER
 * NIVEL, y `hecha` vive anidada. Hoy no pasa porque Exploración no está en el mapa `DOC`
 * de app/api/projects/[projectId]/canvas-assist/route.ts — hay una nota ahí para el día
 * que alguien la agregue.
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

/** Texto comparable: sin tildes, sin signos, sin mayúsculas ni espacios de más. */
export function claveDePregunta(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SesionConPreguntas {
  titulo?: unknown;
  preguntas?: PreguntaGuardada[];
  [k: string]: unknown;
}

/** La sesión tal como sale: lo que traía, con sus preguntas ya normalizadas. */
export type SesionConMarcas<T> = Omit<T, "preguntas"> & { titulo?: unknown; preguntas: ExploracionPregunta[] };

/**
 * Arrastra las marcas del plan anterior al plan regenerado. Pura: no muta sus argumentos.
 *   · Pregunta que vuelve con el mismo texto (normalizado) → conserva `hecha`.
 *   · Pregunta marcada que el agente ya no trae → vuelve a su sesión (mismo título, si no
 *     la misma posición, si no la última); si el plan nuevo no tiene sesiones, una propia.
 */
export function conservarMarcas<T extends SesionConPreguntas>(
  previas: SesionConPreguntas[] | undefined | null,
  nuevas: T[] | undefined | null,
): SesionConMarcas<T>[] {
  const salida: SesionConMarcas<T>[] = (nuevas ?? []).map((s) => ({ ...s, preguntas: normalizarPreguntas(s.preguntas) }));
  const marcadas: { clave: string; pregunta: ExploracionPregunta; titulo: string; indice: number }[] = [];
  (previas ?? []).forEach((s, indice) => {
    for (const p of normalizarPreguntas(s.preguntas)) {
      if (isSi(p.hecha) && p.q.trim()) {
        marcadas.push({ clave: claveDePregunta(p.q), pregunta: p, titulo: typeof s.titulo === "string" ? s.titulo : "", indice });
      }
    }
  });
  if (marcadas.length === 0) return salida;

  const vueltas = new Set<string>();
  for (const s of salida) {
    for (const p of s.preguntas) {
      const m = marcadas.find((x) => x.clave === claveDePregunta(p.q));
      if (m) {
        p.hecha = m.pregunta.hecha;
        vueltas.add(m.clave);
      }
    }
  }
  for (const m of marcadas) {
    if (vueltas.has(m.clave)) continue;
    let destino = salida.find((s) => typeof s.titulo === "string" && claveDePregunta(s.titulo) === claveDePregunta(m.titulo));
    destino ??= salida[m.indice] ?? salida[salida.length - 1];
    if (!destino) {
      destino = { titulo: "Lo que ya se preguntó", preguntas: [] } as unknown as SesionConMarcas<T>;
      salida.push(destino);
    }
    destino.preguntas.push({ ...m.pregunta });
    vueltas.add(m.clave);
  }
  return salida;
}
