/**
 * lib/sessions/recortar-transcripcion.ts — UNA REUNIÓN ENTERA, RECORTADA A UN TOPE. PURO.
 *
 * Las notas (resumen, decisiones y próximos pasos) y la transcripción. Si no entra, se queda el principio y, sobre todo,
 * el FINAL de la transcripción: ahí se acuerda qué sigue.
 *
 * Vivía en el correo de seguimiento (lib/exploraciones/correo-de-seguimiento.ts, `recortarLaReunion`, que ahora lo
 * reexporta). Se mudó acá (memoria de la cuenta, etapa 3) porque el avance del cronograma también lee «la reunión nueva
 * entera», y lib/timeline no puede importar lib/exploraciones: el censo de lib/exploraciones/lectores.test.ts no deja
 * que un archivo del cronograma la lea.
 */

/** El tope de siempre: lo que lee el correo de seguimiento y el avance de una reunión. */
export const TOPE_DE_LA_REUNION_ENTERA = 40_000;

export function recortarTranscripcion(notas: string, transcripcion: string, max = TOPE_DE_LA_REUNION_ENTERA): string {
  const n = notas.trim().slice(0, Math.floor(max / 3));
  const t = transcripcion.trim();
  const queda = max - n.length;
  let cuerpo = t;
  if (t.length > queda) {
    const inicio = Math.floor(queda * 0.3);
    cuerpo = `${t.slice(0, inicio)}\n[…]\n${t.slice(t.length - (queda - inicio))}`;
  }
  return [n && `--- Notas de la reunión ---\n${n}`, cuerpo && `--- Transcripción ---\n${cuerpo}`].filter(Boolean).join("\n\n");
}
