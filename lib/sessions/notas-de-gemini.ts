/**
 * lib/sessions/notas-de-gemini.ts — QUÉ PARTE de las notas de una reunión llega a los agentes. PURO.
 *
 * ── EL HALLAZGO (medido el 2026-10-02 sobre 14 sesiones reales) ──────────────────────────────
 * Las notas de Gemini llegan en UN solo texto con cuatro bloques: «Resumen», «Decisiones», «Próximos
 * pasos» y «Detalles». `fetchTranscriptContent` las cortaba en los primeros 1.500 caracteres, así que
 * en 38 de 51 sesiones el corte caía en medio de «Próximos pasos» y «Detalles» no llegaba nunca. El
 * agente de avance veía el 4,3 % del texto, y de 33 compromisos y pedidos fuera de alcance perdidos,
 * 17 nunca le llegaron. Ejemplo real (Spectrum): «[Rodrigo] Entregar base datos: Proporcionar la base
 * de datos de clientes a mas tarda» — lo que seguía era «el miércoles».
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────────────────
 * Las decisiones y los próximos pasos son donde viven las fechas y los compromisos: entran ENTEROS
 * (hasta su tope). El resumen se acorta, y los detalles completan lo que quede. Sin los títulos de
 * Gemini, el texto se corta como siempre.
 */

const TITULOS = ["resumen", "decisiones", "próximos pasos", "proximos pasos", "pasos siguientes", "siguientes pasos", "detalles"] as const;

type Bloque = "resumen" | "decisiones" | "proximos" | "detalles";

const BLOQUE_DE: Record<(typeof TITULOS)[number], Bloque> = {
  resumen: "resumen",
  decisiones: "decisiones",
  "próximos pasos": "proximos",
  "proximos pasos": "proximos",
  "pasos siguientes": "proximos",
  "siguientes pasos": "proximos",
  detalles: "detalles",
};

/** Topes por bloque. Suman ~4.900: lo justo para que una reunión no se coma el reparto de las demás. */
export const TOPES_DE_LAS_NOTAS: Record<Bloque, number> = {
  resumen: 600,
  decisiones: 1_500,
  proximos: 2_000,
  detalles: 800,
};

/** Tope histórico cuando las notas no traen los títulos de Gemini. */
export const TOPE_SIN_TITULOS = 1_500;

/** Parte las notas por sus títulos (una línea sola con el título). null si no trae ninguno de los de acción. */
export function partirNotas(texto: string): Partial<Record<Bloque, string>> | null {
  const lineas = texto.split(/\r?\n/);
  const bloques: Partial<Record<Bloque, string[]>> = {};
  let actual: Bloque | null = null;
  for (const l of lineas) {
    const t = l.trim().toLowerCase() as (typeof TITULOS)[number];
    if ((TITULOS as readonly string[]).includes(t)) {
      actual = BLOQUE_DE[t];
      bloques[actual] ??= [];
      continue;
    }
    if (actual) bloques[actual]!.push(l);
  }
  if (!bloques.decisiones && !bloques.proximos) return null;
  const out: Partial<Record<Bloque, string>> = {};
  for (const k of Object.keys(bloques) as Bloque[]) {
    const v = bloques[k]!.join("\n").trim();
    if (v) out[k] = v;
  }
  return out;
}

/** El texto de las notas que llega a un agente: decisiones y próximos pasos enteros primero en importancia. */
export function notasPriorizadas(texto: string): string {
  const partes = partirNotas(texto);
  if (!partes) return texto.trim().slice(0, TOPE_SIN_TITULOS);
  const salida: string[] = [];
  if (partes.resumen) salida.push(`Resumen:\n${partes.resumen.slice(0, TOPES_DE_LAS_NOTAS.resumen)}`);
  if (partes.decisiones) salida.push(`Decisiones:\n${partes.decisiones.slice(0, TOPES_DE_LAS_NOTAS.decisiones)}`);
  if (partes.proximos) salida.push(`Próximos pasos:\n${partes.proximos.slice(0, TOPES_DE_LAS_NOTAS.proximos)}`);
  if (partes.detalles) salida.push(`Detalles:\n${partes.detalles.slice(0, TOPES_DE_LAS_NOTAS.detalles)}`);
  return salida.join("\n\n");
}
