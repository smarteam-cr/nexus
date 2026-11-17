/**
 * lib/exploraciones/minuta-de-la-sesion.ts — la transcripción o la minuta que se suma a mano a una sesión. PURO.
 *
 * Pedido de Elías (2026-11-17, Ulacit): una reunión de una hora y veinte que no se grabó se pegaba entera y el
 * servidor respondía «Cuerpo inválido», porque el texto pasaba de los 60.000 caracteres que lee el agente. Ahora
 * entra, y se guarda el principio y el final, con una marca donde se quitó el tramo del medio: el arranque trae el
 * contexto y el cierre el siguiente paso, que es lo que se perdía cortando solo por el final.
 */
import type { SesionPlaneada } from "./guia";

/** Cuánto lee el agente de una reunión (el mismo tope que las de Meet, fuentes.ts › `MAX` al leer). */
export const MAX_TEXTO_DEL_DOCUMENTO = 60_000;

/**
 * Lo más largo que se acepta pegar: va en el cuerpo del pedido y el nginx del VPS corta a 1 MB. Con acentos, saltos de
 * línea escapados en el JSON y algún emoji, 250.000 caracteres quedan holgados (una reunión de 3 horas).
 */
export const MAX_TEXTO_PEGADO = 250_000;

/** Cuánto se extrae de un archivo subido (va directo a Storage, sin el corte del nginx): lo largo se recorta por el medio. */
export const MAX_TEXTO_DEL_ARCHIVO = 1_000_000;

/** Del espacio que se guarda, cuánto va al principio (el resto, al final). */
const PARTE_DEL_PRINCIPIO = 2 / 3;

export const marcaDelRecorte = (quitados: number) =>
  `\n\n[… se quitaron ${quitados.toLocaleString("es-CR").replace(/[  ]/g, " ")} caracteres del medio para que el agente pueda leerla …]\n\n`;

/**
 * El texto que cabe en `max`: igual si ya cabe; si no, el principio y el final con la marca en el medio. Corta en un
 * salto de línea cercano para no partir un turno de la transcripción a la mitad. `quitados`: cuántos se quitaron.
 */
export function recortarParaElAgente(texto: string, max: number = MAX_TEXTO_DEL_DOCUMENTO): { texto: string; quitados: number } {
  if (texto.length <= max) return { texto, quitados: 0 };
  // La marca ocupa lugar: se reserva con el número más largo posible.
  const espacio = max - marcaDelRecorte(texto.length).length;
  const principio = Math.floor(espacio * PARTE_DEL_PRINCIPIO);
  const fin = espacio - principio;
  let corteA = principio;
  const saltoA = texto.lastIndexOf("\n", principio);
  if (saltoA > principio * 0.9) corteA = saltoA;
  let corteB = texto.length - fin;
  const saltoB = texto.indexOf("\n", corteB);
  if (saltoB !== -1 && saltoB - corteB < fin * 0.1) corteB = saltoB + 1;
  const quitados = corteB - corteA;
  return { texto: texto.slice(0, corteA).trimEnd() + marcaDelRecorte(quitados) + texto.slice(corteB).trimStart(), quitados };
}

/**
 * La sesión con su minuta: la reunión pasa a ser el documento. «Se hizo por otro canal» y «No se hizo» se quitan: con la
 * transcripción en la mano ya no son ciertas. «Se cortó» se queda, con lo que pasó a la sesión siguiente: una
 * transcripción parcial no deshace que se cortó, y borrarla se llevaría las preguntas que ya pasaron, sin aviso.
 */
export function sesionConLaMinuta(s: SesionPlaneada, documentoId: string): SesionPlaneada {
  const { resultado, ...resto } = s;
  return { ...resto, ...(resultado === "cortada" ? { resultado } : {}), reunion: { origen: "documento", id: documentoId } };
}
