/**
 * lib/asistente/caja.ts — lo que pasa con el texto de la caja del chat «Nexus». Puro y client-safe.
 *
 * Desde el 24 nov todos los chats usan la misma caja (components/asistente/CajonDeNexus.tsx › `CajaDeNexus`), y se puede
 * seguir escribiendo mientras Nexus piensa. Dos reglas que comparten:
 *  · lo dictado se suma a lo escrito como una oración (`textoConLoDictado`; nació en el chat de la preventa el 21 nov);
 *  · si un envío falla, lo que se mandó vuelve a la caja SIN borrar lo que la persona escribió mientras esperaba
 *    (`devolverALaCaja`; la revisión del 24 nov lo encontró: volvía el mensaje viejo y se perdía lo nuevo).
 */

/**
 * `escrito` con la frase dictada al final: si lo escrito no termina en punto, signo de pregunta o de exclamación, se cierra
 * con un punto; la frase empieza con mayúscula. Con `max`, se corta ahí.
 */
export function textoConLoDictado(escrito: string, frase: string, max?: number): string {
  const base = escrito.replace(/\s+$/, "");
  const limpia = frase.trim();
  if (!limpia) return escrito;
  const union = base ? (/[.!?]$/.test(base) ? " " : ". ") : "";
  const nuevo = `${base}${union}${limpia.charAt(0).toUpperCase()}${limpia.slice(1)}`;
  return max ? nuevo.slice(0, max) : nuevo;
}

/**
 * Lo que queda en la caja cuando un envío falla: lo que se mandó vuelve, y si mientras tanto la persona escribió otra cosa,
 * va debajo. No se corta aunque pase del largo máximo: la caja lo avisa y no deja enviarlo hasta acortarlo (nada se pierde).
 */
export function devolverALaCaja(loQueSeMando: string, loEscritoDespues: string): string {
  const despues = loEscritoDespues.trim();
  return despues ? `${loQueSeMando}\n\n${despues}` : loQueSeMando;
}
