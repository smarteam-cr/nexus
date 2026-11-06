/**
 * lib/exploraciones/contexto-de-la-exploracion.ts — el contexto que da la persona ANTES de que Nexus arme una guía
 * (2026-11-06, puntos 1 a 5 de la especificación de Elías). PURO.
 *
 * Nexus ya no planifica por defecto: antes de armar cualquier guía pide
 *   · el contexto de TODA la exploración: por qué exploramos esta empresa y qué queremos lograr, y lo que ya sabemos del
 *     cliente (en preventa, cómo llegó; en un cliente, lo que entregó ventas en el traspaso). Si Nexus ya tiene algo (el
 *     traspaso, notas de HubSpot, lo que agregó el equipo, sesiones leídas), lo muestra cargado para confirmar o completar;
 *   · el contexto de CADA sesión: con quién es (nombre, puesto y área), qué espera el cliente de la reunión, el objetivo y
 *     cuánto dura. El nombre de la sesión y su reunión ya existían.
 * Nexus no impone cuántas sesiones ni cada cuánto.
 *
 * En preventa, además, si no hubo contacto con el prospecto antes de la primera sesión, Nexus ofrece redactar un correo
 * corto o un guion de llamada de 2 a 3 minutos (contacto-previo.ts).
 */
import type { SesionPlaneada } from "./guia";

/** El contexto de toda la exploración, como lo confirmó una persona. */
export interface ContextoDeLaExploracion {
  /** Por qué exploramos esta empresa y qué queremos lograr. */
  objetivo: string;
  /** Lo que ya sabemos del cliente (cómo llegó, o lo que entregó ventas). Puede quedar vacío: no se sabe nada. */
  sabemos?: string;
  /** Quién lo confirmó y cuándo (lo pone el servidor). */
  por: string | null;
  en: string;
}

/** Una persona del cliente con la que es la sesión. */
export interface PersonaDeLaSesion {
  nombre: string;
  puesto?: string;
  area?: string;
}

export const MAX_OBJETIVO_DE_LA_EXPLORACION = 600;
export const MAX_LO_QUE_SABEMOS = 3000;
export const MAX_PERSONAS_DE_LA_SESION = 8;
export const MAX_LO_QUE_ESPERA = 300;
export const DURACIONES = [30, 45, 60, 90] as const;

/** Lo que falta para que Nexus arme la guía de una sesión, en palabras. Vacío = se puede armar. */
export function faltaParaLaGuia(contexto: ContextoDeLaExploracion | undefined, sesion: Pick<SesionPlaneada, "objetivo" | "conQuien"> | null | undefined): string[] {
  const falta: string[] = [];
  if (!contexto?.objetivo.trim()) falta.push("el objetivo de la exploración");
  if (!sesion?.conQuien?.some((p) => p.nombre.trim())) falta.push("con quién es la sesión");
  if (!sesion?.objetivo?.trim()) falta.push("el objetivo de la sesión");
  return falta;
}

/** «Ana Pérez (gerente general, Dirección), Luis Mora (jefe de ventas)». */
export function textoDeConQuien(personas: readonly PersonaDeLaSesion[] | undefined): string | null {
  const t = (personas ?? [])
    .filter((p) => p.nombre.trim())
    .map((p) => {
      const detalle = [p.puesto?.trim(), p.area?.trim()].filter(Boolean).join(", ");
      return detalle ? `${p.nombre.trim()} (${detalle})` : p.nombre.trim();
    })
    .join(", ");
  return t || null;
}

/** De dónde sale cada parte del borrador de «lo que ya sabemos». */
export interface PiezaDelBorrador {
  de: string;
  texto: string;
}

/**
 * El borrador de «lo que ya sabemos»: lo que Nexus ya tiene, en piezas con su origen, sin IA. La persona lo confirma o
 * lo completa; nada de esto se usa sin confirmar.
 */
export function borradorDeLoQueSabemos(piezas: readonly PiezaDelBorrador[], max = MAX_LO_QUE_SABEMOS): string {
  const partes: string[] = [];
  let largo = 0;
  for (const p of piezas) {
    const texto = p.texto.replace(/\s+\n/g, "\n").trim();
    if (!texto) continue;
    const parte = `${p.de}:\n${texto}`;
    if (largo + parte.length + 2 > max) {
      const queda = max - largo - p.de.length - 6;
      if (queda > 120) partes.push(`${p.de}:\n${texto.slice(0, queda).trimEnd()}…`);
      break;
    }
    partes.push(parte);
    largo += parte.length + 2;
  }
  return partes.join("\n\n");
}

/** Preventa: si hubo contacto con el prospecto antes de la primera sesión, y el mensaje que Nexus redactó si no lo hubo. */
export interface ContactoPrevio {
  hubo: boolean;
  mensaje?: { tipo: TipoDeMensajePrevio; texto: string; en: string };
}
export const TIPOS_DE_MENSAJE_PREVIO = ["correo", "llamada"] as const;
export type TipoDeMensajePrevio = (typeof TIPOS_DE_MENSAJE_PREVIO)[number];
export const MAX_MENSAJE_PREVIO = 2500;
