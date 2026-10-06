/**
 * lib/carga/semana.ts — semanas de lunes a domingo en hora de Costa Rica. PURO.
 *
 * La carga se mide por semana. Costa Rica es UTC-6 todo el año (sin horario de verano), así que el lunes de una
 * reunión se saca restando 6 horas y mirando el día UTC: sin `Intl` y sin depender de la zona del servidor (el
 * contenedor de producción corre en UTC y la PC de desarrollo en hora local).
 */

const HORA_CR_MS = 6 * 3_600_000;
const DIA_MS = 86_400_000;
const SEMANA_MS = 7 * DIA_MS;

/** «2026-09-28»: el lunes (en Costa Rica) de la semana de una fecha. */
export function lunesDe(fecha: Date | string): string {
  const d = new Date(+new Date(fecha) - HORA_CR_MS);
  const diaDeLaSemana = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - diaDeLaSemana);
  return d.toISOString().slice(0, 10);
}

/**
 * El lunes de una fecha de CALENDARIO (sin hora: el arranque de un cronograma, la fecha manual de una tarea). Se
 * guardan a medianoche UTC, y restarles las 6 horas de Costa Rica las correría al día anterior.
 */
export function lunesDeFecha(fecha: Date | string): string {
  const d = new Date(`${new Date(fecha).toISOString().slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Suma semanas a un lunes «AAAA-MM-DD». */
export function sumarSemanas(lunes: string, n: number): string {
  return new Date(Date.parse(`${lunes}T00:00:00Z`) + n * SEMANA_MS).toISOString().slice(0, 10);
}

/** Los `n` lunes que terminan en el de `hasta` (incluido), del más viejo al más nuevo. */
export function lunesHasta(hasta: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => sumarSemanas(hasta, i - n + 1));
}

/** El instante (UTC) en que empieza un lunes de Costa Rica: las 6:00 UTC. */
export function inicioDelLunes(lunes: string): Date {
  return new Date(Date.parse(`${lunes}T00:00:00Z`) + HORA_CR_MS);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «28 sep». */
export function etiquetaDelLunes(lunes: string): string {
  const d = new Date(`${lunes}T00:00:00Z`);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Días enteros entre dos fechas (b − a). */
export function diasEntre(a: Date | string, b: Date | string): number {
  return Math.floor((+new Date(b) - +new Date(a)) / DIA_MS);
}
