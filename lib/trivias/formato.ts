/**
 * lib/trivias/formato.ts — cómo se escriben el código, los puntos y las fechas en todas las pantallas de Trivias.
 *
 * Escritos a mano y no con `toLocaleString`: el servidor y el navegador tienen que escribir exactamente lo mismo (o
 * React no puede hidratar), y `es-CR` agrupa distinto según el largo del número («4500» pero «12 500»).
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Costa Rica es UTC−6 todo el año (sin horario de verano). */
const DESFASE_CR_MS = 6 * 60 * 60 * 1000;

function enCostaRica(ms: number): Date {
  return new Date(ms - DESFASE_CR_MS);
}

/** «K7M2QX» → «K7M 2QX»: en dos mitades se dicta y se copia sin perderse (el jugador puede escribirlo con espacio). */
export function formatearCodigo(codigo: string): string {
  return codigo.length === 6 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo;
}

/** «4.500»: los miles con punto, siempre igual. */
export function formatearPuntos(n: number): string {
  const entero = Math.round(n);
  const signo = entero < 0 ? "-" : "";
  return signo + String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** «19 nov», o «19 nov 2025» si no es del año de `hoy`. */
export function fechaCortaCR(iso: string, hoy: number = Date.now()): string {
  const d = enCostaRica(Date.parse(iso));
  const base = `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === enCostaRica(hoy).getUTCFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
}

/** «19 nov, 16:05» (hora de Costa Rica). */
export function fechaYHoraCR(iso: string, hoy: number = Date.now()): string {
  const d = enCostaRica(Date.parse(iso));
  return `${fechaCortaCR(iso, hoy)}, ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
