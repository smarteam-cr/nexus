/**
 * lib/exploraciones/minuta-de-la-sesion.ts — la transcripción o la minuta que se suma a mano a una sesión. PURO.
 *
 * Pedido de Elías (2026-11-17, Ulacit): una reunión de una hora y veinte que no se grabó se pegaba entera y el
 * servidor respondía «Cuerpo inválido», porque el texto pasaba de los 60.000 caracteres que leía el agente. La
 * primera vuelta la recortaba por el medio; Elías no quiso que se quitara nada. Ahora el agente lee ENTERA cada reunión,
 * sea de Meet o sumada a mano, hasta unas seis horas de conversación, y lo más largo se rechaza con un mensaje que lo
 * dice: nunca se corta en silencio.
 */
import type { SesionPlaneada } from "./guia";

/**
 * Cuánto lee el agente de UNA reunión, entera (fuentes.ts › al leer): unas seis horas de conversación, unos 110.000
 * tokens. Con el resto del pedido cabe holgado en el contexto del modelo, y una reunión más larga no existe en la práctica.
 */
export const MAX_TEXTO_DE_UNA_REUNION = 400_000;

/**
 * Cuánto lee el agente en UNA corrida, sumando todo lo que le llega (reuniones, HubSpot y notas): lo que no entra queda
 * «sin leer» para la siguiente, entero. La primera reunión siempre entra.
 */
export const TOPE_DE_LA_LECTURA = MAX_TEXTO_DE_UNA_REUNION;

/**
 * Lo más largo que se acepta PEGAR: va en el cuerpo del pedido y el nginx del VPS corta a 1 MB. 200.000 caracteres (unas
 * tres horas) con acentos y los saltos de línea escapados en el JSON quedan holgados. Más largo, se sube como archivo
 * (va directo al almacenamiento, sin ese corte).
 */
export const MAX_TEXTO_PEGADO = 200_000;

/** Lo más largo que se acepta en un archivo subido: lo que el agente lee de una reunión. */
export const MAX_TEXTO_DEL_ARCHIVO = MAX_TEXTO_DE_UNA_REUNION;

const enMiles = (n: number) => (n / 1000).toLocaleString("es-CR");

/** Pegado de más (se dice, no se corta). */
export const MENSAJE_DE_PEGADO_LARGO = `Es más largo de lo que se puede pegar (${enMiles(MAX_TEXTO_PEGADO)} mil caracteres, unas tres horas): súbelo como archivo, que admite hasta ${enMiles(MAX_TEXTO_DEL_ARCHIVO)} mil, o divídelo en dos.`;

/** Un archivo de más (se dice, no se corta). */
export const MENSAJE_DE_ARCHIVO_LARGO = `Es más largo de lo que el agente lee de una reunión (${enMiles(MAX_TEXTO_DEL_ARCHIVO)} mil caracteres, unas seis horas): divídelo en dos y súmalos por separado.`;

/**
 * Lo más que puede llevar el pedido al modelo antes de las notas (hasta 60.000) y de las instrucciones del agente: unos
 * 130.000 tokens, holgados dentro de su contexto. Pasarlo hacía fallar la lectura igual cada vez que se pedía.
 */
export const TOPE_DURO_DEL_PEDIDO = 450_000;

/**
 * ¿Entra en esta corrida una reunión de `largo` (ya con el tope por reunión aplicado), con `usado` caracteres ya juntados
 * (HubSpot, tests, otras reuniones) y `reunionesDentro` reuniones ya adentro? La primera entra aunque lo demás ocupe lugar
 * (si no, una larga podía no leerse nunca), salvo que el pedido no cupiera en el modelo; las siguientes, si caben en el
 * tope de la corrida. Lo que no entra no se lee ni se marca: queda «sin leer» para la próxima, entero.
 */
export function entraEnLaLectura(o: { usado: number; reunionesDentro: number; largo: number }): boolean {
  if (o.reunionesDentro === 0) return o.usado + o.largo <= TOPE_DURO_DEL_PEDIDO;
  return o.usado + o.largo <= TOPE_DE_LA_LECTURA;
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
