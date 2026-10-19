/**
 * lib/mi-dia/agenda-dias.ts — qué día (o qué semana) muestra la agenda del inicio (2026-10-17). PURO y client-safe.
 *
 * La agenda es de trabajo: de lunes a viernes, en hora de Costa Rica (UTC-6 todo el año). Quien entra un sábado o un
 * domingo ve la semana que viene (y en la vista «Día», el lunes): el fin de semana no hay nada que preparar. Moverse
 * de a un día salta el fin de semana (del viernes al lunes y al revés).
 *
 * La agenda abre en la semana; el día se elige con su botón (`vistaPedidaDeLaAgenda`).
 *
 * Los días van como `AAAA-MM-DD` (el día de Costa Rica ya calculado, p. ej. `crDateParts(ahora).dateKey`).
 */

export type VistaDeLaAgenda = "dia" | "semana";

/**
 * La vista que se pide en la dirección (`?agenda=`): la semana por defecto (2026-10-18, validación 9); el día solo con
 * `?agenda=dia`. Un `?agenda=semana` de un enlace viejo sigue siendo la semana.
 */
export function vistaPedidaDeLaAgenda(param: string | null | undefined): VistaDeLaAgenda {
  return param === "dia" ? "dia" : "semana";
}

const DIA_MS = 86_400_000;

export const sumarDiasAgenda = (ymd: string, n: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** 0 = lunes … 6 = domingo. */
export const diaDeLaSemanaAgenda = (ymd: string): number => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;

/** El lunes de la semana de un día. */
export const lunesDeLaAgenda = (ymd: string): string => sumarDiasAgenda(ymd, -diaDeLaSemanaAgenda(ymd));

/** ¿Es sábado o domingo? */
export const esFinDeSemana = (ymd: string): boolean => diaDeLaSemanaAgenda(ymd) >= 5;

/** El día de trabajo de un día: el mismo de lunes a viernes; el lunes siguiente si cae en sábado o domingo. */
export function diaDeTrabajo(ymd: string): string {
  const d = diaDeLaSemanaAgenda(ymd);
  return d >= 5 ? sumarDiasAgenda(ymd, 7 - d) : ymd;
}

/**
 * Lo que la agenda muestra al entrar (o con «Hoy»): en «Día», hoy (el lunes si es fin de semana); en «Semana», el
 * lunes de esa semana (el de la que viene si es fin de semana).
 */
export function diaDeEntradaDeLaAgenda(hoyISO: string, vista: VistaDeLaAgenda): string {
  const d = diaDeTrabajo(hoyISO);
  return vista === "semana" ? lunesDeLaAgenda(d) : d;
}

/** Lo que se ve para un día pedido: en «Semana», su lunes; en «Día», el día de trabajo (un sábado pedido da el lunes). */
export function diaQueSeVe(vista: VistaDeLaAgenda, dia: string): string {
  const d = diaDeTrabajo(dia);
  return vista === "semana" ? lunesDeLaAgenda(d) : d;
}

/** ‹ y ›: una semana en «Semana»; un día de trabajo en «Día» (del viernes al lunes, del lunes al viernes). */
export function pasoDeLaAgenda(vista: VistaDeLaAgenda, dia: string, paso: -1 | 1): string {
  if (vista === "semana") return sumarDiasAgenda(lunesDeLaAgenda(dia), 7 * paso);
  let d = sumarDiasAgenda(dia, paso);
  while (esFinDeSemana(d)) d = sumarDiasAgenda(d, paso);
  return d;
}

/** Los días de la grilla: de lunes a viernes en «Semana», uno en «Día». */
export function diasDeLaGrilla(vista: VistaDeLaAgenda, dia: string): string[] {
  return vista === "semana" ? [0, 1, 2, 3, 4].map((i) => sumarDiasAgenda(dia, i)) : [dia];
}
