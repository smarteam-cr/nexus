/**
 * lib/external/pagina-del-resumen.ts — LA FORMA del Resumen de la escala tal como llega a la página (9 nov). PURO, sin nada
 * de la exploración: lo importa la vista del cliente (components/external/test/ResumenDeLaEscalaVista.tsx), que no puede
 * leer de lib/exploraciones (lib/exploraciones/lectores.test.ts: la escala al cliente solo entra por su puerta). Quien
 * decide qué sale es `resumenParaLaPagina` (lib/exploraciones/resumen-de-la-escala.ts).
 */
import type { Letra } from "@/lib/escala/documento/tipos";

/** De dónde sale un dato o un hallazgo: la reunión (su id), su fecha, el turno y lo dicho, con la letra de la transcripción. */
export interface CitaDelResumen {
  reunion: string;
  /** ISO. */
  fecha: string;
  turno: number;
  hablante: string;
  texto: string;
  /**
   * Lo dijo alguien de Smarteam y alguien de la empresa lo confirmó en el turno siguiente («Ajá. Exacto.»): quién y qué
   * dijo. En Centauro, la cifra que pedía Elías («25 clientes y se nos van 14») la resumió Marco y la confirmó la empresa.
   */
  confirmo?: { hablante: string; texto: string };
}

export interface PreguntaDelResumen {
  id: string;
  texto: string;
  mano?: boolean;
}

/** La cifra en grande de un dato rojo («14 de 25»). */
export const TOPE_DE_LA_CIFRA = 28;

/** Lo que escribe una persona: más holgado. */
export const TOPE_A_MANO = 600;

/** Minutos en palabras: «2 h 53 min», «45 min». */
export function enHoras(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export interface LoQueHicimos {
  sesiones: number;
  minutos: number;
  /** Reuniones sin duración conocida: el tiempo es «al menos». */
  sinDuracion: number;
  equipos: string[];
  personas: number;
  /** El texto de la parte: el de una persona o el de los datos. */
  texto: string;
  /** Lo escribió una persona. */
  mano: boolean;
}

export interface DatoRojoDeLaPagina {
  id: string;
  cifra: string;
  texto: string;
  areaId: string;
  areaNombre: string;
  dimensionNombre: string | null;
  /** La fecha de la reunión de donde sale (ISO), sin la cita. */
  fecha: string | null;
  /** Solo adentro (`conCitas`). */
  citas?: CitaDelResumen[];
  mano?: boolean;
  /**
   * Solo adentro: por qué esta cifra NO sale al cliente (se escribió a mano con un número que su cita no dice, o no tiene
   * cita). La página del cliente nunca la lleva (Elías, 9 nov).
   */
  noSale?: string;
}

export interface AreaDelResumenDeLaPagina {
  areaId: string;
  nombre: string;
  nivel: Letra | null;
  nivelNombre: string | null;
  porque: string | null;
  /** De dónde sale el «por qué»: el agente, una persona o los datos. Solo adentro importa. */
  origenDelPorque: "agente" | "mano" | "respaldo" | null;
  /** El «por qué» guardado se escribió con otros niveles: sale el de respaldo. */
  porqueViejo: boolean;
  hallazgos: { id: string; texto: string; dimensionNombre: string | null; citas?: CitaDelResumen[]; mano?: boolean }[];
}

export interface ResumenDeLaPagina {
  /** Cuándo se armó (ISO). null: nunca, y solo sale «Dónde quedan». */
  at: string | null;
  hicimos: LoQueHicimos | null;
  datosRojos: DatoRojoDeLaPagina[];
  areas: AreaDelResumenDeLaPagina[];
  entendimos: PreguntaDelResumen[];
  falta: PreguntaDelResumen[];
}
