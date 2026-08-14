/**
 * lib/landing/plan-weeks.ts — de "Semanas 6-10" a un rango de semanas dibujable.
 *
 * El cronograma de la propuesta comercial guarda cada fase como `{ name, detail, duration }`,
 * y `duration` es TEXTO LIBRE que escribe el agente y edita Ventas. Para poder dibujar un
 * Gantt hay que leer ese texto — pero leerlo mal es peor que no dibujarlo: una barra en la
 * semana equivocada es una fecha que el cliente da por comprometida.
 *
 * ── LO QUE HAY ESCRITO DE VERDAD ─────────────────────────────────────────────
 * Medido sobre las 28 secciones `cronograma` de la base (4 de ellas en propuestas ya
 * PUBLICADAS). Todas las formas de acá salieron de un valor real, ninguna es hipotética:
 *
 *   · plural con guion común ....... "Semanas 1-2" · "Semanas 6-10"
 *   · EN DASH (U+2013), 9 valores .. "Semanas 1–2" · "Semanas 13–16"
 *   · singular, una sola semana .... "Semana 8"
 *   · SINGULAR con rango ........... "Semana 1-2"   ← el singular NO implica una semana
 *   · "Mes 4" ...................... en una propuesta publicada, y NO se puede leer
 *
 * Dos hechos que mandan sobre el diseño:
 *   1. **Los números son semanas ABSOLUTAS de inicio y fin**, no una duración. "Semanas
 *      6-10" es de la 6 a la 10 — otra unidad que `TimelinePhase.durationWeeks`, que sí es
 *      duración. No confundirlas: el mismo texto leído como duración corre todo el plan.
 *   2. **Hay solapes reales** (fases en paralelo): "Semanas 5-7" y "Semanas 5-9" conviven en
 *      la misma propuesta. El rango es por fase y nadie normaliza el conjunto.
 *
 * ── LA REGLA QUE NO SE NEGOCIA ───────────────────────────────────────────────
 * Lo que no se puede leer devuelve `null` y la fase se dibuja marcada "sin semanas". En
 * particular **"Mes 4" NO se convierte a semanas**: nadie escribió que un mes son cuatro, y
 * convertirlo sería inventar una fecha en un documento que el cliente firma. Es la misma
 * regla que el parser de montos (`lib/landing/money.ts`): sin sustento, afuera.
 */

/** Semanas ABSOLUTAS, 1-indexadas y con `fin >= inicio`. */
export interface RangoSemanas {
  inicio: number;
  fin: number;
}

/** Techo de cordura: un plan de propuesta comercial no llega a dos años. */
const MAX_SEMANA = 104;

/** Los tres guiones que aparecen en la práctica: común, en dash y em dash. */
const GUION = /[-–—]/;

function rango(inicio: number, fin: number): RangoSemanas | null {
  if (!Number.isInteger(inicio) || !Number.isInteger(fin)) return null;
  if (inicio < 1 || fin < 1) return null;
  if (fin < inicio) return null; // "Semanas 8-3" no es un rango, es un typo
  if (fin > MAX_SEMANA) return null;
  return { inicio, fin };
}

/**
 * El OVERRIDE del vendedor: formato estricto `"6-10"` o `"8"`. Es estricto a propósito —
 * es un campo que existe justo para cuando la lectura del texto libre falló, así que
 * aceptar prosa acá reintroduciría la ambigüedad que vino a resolver.
 */
export function parseSemanas(txt: string | null | undefined): RangoSemanas | null {
  const s = (txt ?? "").trim();
  if (!s) return null;
  const partes = s.split(GUION).map((p) => p.trim());
  if (partes.length === 1) {
    const n = Number(partes[0]);
    return Number.isFinite(n) ? rango(n, n) : null;
  }
  if (partes.length !== 2) return null;
  const a = Number(partes[0]);
  const b = Number(partes[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return rango(a, b);
}

/**
 * El texto libre de `duration`. Acepta "Semana(s) N", "Semana(s) N-M" con cualquiera de los
 * tres guiones, y tolera el ruido alrededor ("Semanas 1-2 (kickoff)"). Todo lo demás —"Mes 4",
 * "A convenir", vacío— devuelve null.
 */
export function parseDuracion(txt: string | null | undefined): RangoSemanas | null {
  const s = (txt ?? "").trim().toLowerCase();
  if (!s) return null;
  // El acento importa: el agente escribe "Semanas", pero un humano puede tipear "semana".
  // `\d+` con guion opcional; el segundo número solo cuenta si el guion está presente.
  const m = s.match(/semanas?\s*(\d{1,3})\s*(?:[-–—]\s*(\d{1,3}))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  return rango(a, b);
}

/** Lo mínimo que este módulo necesita saber de una fase (evita importar el tipo del motor). */
export interface FaseConSemanas {
  duration?: string;
  semanas?: string;
}

/** El override gana sobre el texto libre: existe para corregirlo. */
export function rangoDeFase(f: FaseConSemanas): RangoSemanas | null {
  return parseSemanas(f.semanas) ?? parseDuracion(f.duration);
}

/**
 * El span del plan entero, para saber cuántas columnas dibujar. Las fases ilegibles se
 * IGNORAN acá (no arrastran el eje) pero siguen existiendo en la vista, con su marca.
 * `null` = ninguna fase se pudo ubicar ⇒ no hay Gantt que dibujar.
 */
export function spanDelPlan(fases: FaseConSemanas[]): RangoSemanas | null {
  const rangos = fases.map(rangoDeFase).filter((r): r is RangoSemanas => r != null);
  if (!rangos.length) return null;
  return {
    inicio: Math.min(...rangos.map((r) => r.inicio)),
    fin: Math.max(...rangos.map((r) => r.fin)),
  };
}
