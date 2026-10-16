/**
 * lib/clients/contradice.ts — ¿lo que propone la IA contradice lo confirmado? (la IA como borrador, etapa 4b del
 * roadmap de «Para ti», 2026-10-15). CLIENT-SAFE y puro.
 *
 * La regla de Elías: lo que escribe la IA se usa desde el primer momento, lo que confirmó una persona manda, y si algo
 * nuevo lo contradice, Nexus no lo pisa: pregunta. Una propuesta de la ficha casi siempre SUMA a lo confirmado (el modelo
 * integra lo nuevo con lo que ya había); contradice cuando deja de decir algo que una persona confirmó. Eso se puede ver
 * sin IA: cada renglón de lo confirmado que no está en la propuesta.
 */

const VINETA = /^\s*(?:[-*•]|\d+[.)])\s+/;

function normalizar(t: string): string {
  return t
    .replace(/\*\*/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las palabras que dicen algo (3 letras o más (ERP, SAP, CRM), o un número). */
function palabras(t: string): string[] {
  return normalizar(t)
    .split(" ")
    .filter((p) => p.length >= 3 || /\d/.test(p));
}

/** Los renglones con contenido de un texto, sin la viñeta. */
export function renglones(t: string): string[] {
  return t
    .split("\n")
    .map((l) => l.replace(VINETA, "").trim())
    .filter((l) => palabras(l).length > 0);
}

/** Qué parte de las palabras de un renglón tiene que seguir en la propuesta para contar como dicho. */
const PARTE_QUE_SIGUE = 0.7;

/**
 * Lo confirmado que la propuesta deja de decir: cada renglón de lo confirmado cuyas palabras ya no están (el 70 % o más)
 * en un mismo renglón de la propuesta, ni el renglón entero en el texto. Vacío = la propuesta solo suma o reescribe.
 */
export function loQueDejaDeDecir(confirmado: string, propuesto: string): string[] {
  const nuevo = normalizar(propuesto);
  if (!confirmado.trim() || !nuevo) return [];
  const renglonesNuevos = renglones(propuesto).map((l) => new Set(palabras(l)));
  return renglones(confirmado).filter((l) => {
    if (nuevo.includes(normalizar(l))) return false;
    const suyas = palabras(l);
    const sigue = (r: Set<string>) => suyas.filter((p) => r.has(p)).length / suyas.length >= PARTE_QUE_SIGUE;
    return !renglonesNuevos.some(sigue);
  });
}
