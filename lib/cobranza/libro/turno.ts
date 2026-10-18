/**
 * lib/cobranza/libro/turno.ts — cuándo corre el cobro solo del día (job `lo-pagado-daily`, 2026-10-18). PURO.
 *
 * Corre DESPUÉS de las copias de Odoo y Mercury de las 6:00, con lo que trajeron hoy. Una copia que todavía no corrió
 * bien hoy hace esperar al job, como mucho hasta `HORA_LIMITE`: pasada esa hora cobra con la copia que sí está al día, y
 * lo de la otra queda para mañana (sus datos son de ayer: un pago que alguien deshizo anoche en Odoo seguiría «pagado»).
 * Una copia apagada en este servidor (sin credencial, o apagada a propósito) no hace esperar a nadie.
 */
import type { Fuente } from "./hechos";

/** Hasta qué hora de Costa Rica se espera a una copia atrasada antes de cobrar sin ella. */
export const HORA_LIMITE = 10;

/** Desde qué hora de Costa Rica se mira: una hora después de las copias de las 6:00. */
export const HORA_DE_INICIO = 7;

export type EstadoDeLaCopia = "apagada" | "al-dia" | "atrasada";

export interface Turno {
  /** false = todavía no: esperar a la copia atrasada (el job devuelve SIN_TURNO y lo intenta el tick siguiente). */
  correr: boolean;
  /** Con qué copias se cobra. */
  fuentes: Fuente[];
  /** Copias encendidas que no corrieron bien hoy: el job lo dice en rojo después de cobrar con las demás. */
  atrasadas: Fuente[];
}

export function decidirElTurno(hora: number, copias: Readonly<Record<Fuente, EstadoDeLaCopia>>): Turno {
  const fuentes = (Object.keys(copias) as Fuente[]).filter((f) => copias[f] === "al-dia");
  const atrasadas = (Object.keys(copias) as Fuente[]).filter((f) => copias[f] === "atrasada");
  if (hora < HORA_DE_INICIO) return { correr: false, fuentes, atrasadas };
  if (atrasadas.length > 0 && hora < HORA_LIMITE) return { correr: false, fuentes, atrasadas };
  return { correr: true, fuentes, atrasadas };
}

/**
 * Cómo está una copia hoy: apagada en este servidor, al día (su última corrida BUENA empezó hoy, en hora de Costa Rica)
 * o atrasada. `ultimaBuenaDelDia` = el `dateKey` de Costa Rica de la última corrida buena, o null si nunca hubo una.
 */
export function estadoDeLaCopia(encendida: boolean, ultimaBuenaDelDia: string | null, hoy: string): EstadoDeLaCopia {
  if (!encendida) return "apagada";
  return ultimaBuenaDelDia === hoy ? "al-dia" : "atrasada";
}
