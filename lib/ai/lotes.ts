/**
 * lib/ai/lotes.ts — LAS REGLAS DE LOS PEDIDOS POR LOTE (API Batch de Anthropic). PURO: lo usa lib/ai/lotes-server.ts y
 * lo prueba lib/ai/lotes.test.ts.
 *
 * La API Batch cobra la mitad y responde cuando puede (casi siempre en menos de una hora; como mucho en 24). Sirve para
 * lo que nadie está esperando: el barrido diario del vigía hoy; los reintentos de los hechos, el avance, la ficha y
 * marketing son los candidatos que siguen (DECISIONS «El gasto de la IA»). Un pedido se encola con su `tipo`, el job
 * «ia-lotes» junta los que esperan y los manda en un lote, mira los lotes enviados y, cuando terminan, le pasa cada
 * respuesta al manejador de su tipo.
 */

/** Los tipos de pedido que van por lote, cada uno con su manejador en lib/ai/lotes-manejadores.ts. */
export const TIPOS_DE_LOTE = ["vigia-barrido"] as const;
export type TipoDeLote = (typeof TIPOS_DE_LOTE)[number];

export const esTipoDeLote = (t: string): t is TipoDeLote => (TIPOS_DE_LOTE as readonly string[]).includes(t);

/** Cuánto se espera a que se junten más pedidos antes de mandar el lote (un lote de uno también vale la mitad). */
export const ESPERA_PARA_JUNTAR_MS = 5 * 60_000;
/** Con tantos pendientes se manda sin esperar. Anthropic acepta hasta 100.000; acá alcanza de sobra. */
export const MAX_PEDIDOS_POR_LOTE = 100;
/** Cada cuánto se pregunta por un lote enviado. */
export const MIRAR_CADA_MS = 3 * 60_000;
/** Anthropic vence un lote a las 24 h; pasadas 26 sin respuesta, el pedido se da por vencido de este lado. */
export const HORAS_PARA_VENCER = 26;

export type EstadoDelPedido = "en_espera" | "enviado" | "listo" | "error" | "vencido";

/** ¿Hay que mandar los pendientes? Si el más viejo esperó lo suficiente o ya son muchos. */
export function hayQueEnviar(pendientes: readonly { createdAt: Date }[], ahora: Date): boolean {
  if (!pendientes.length) return false;
  if (pendientes.length >= MAX_PEDIDOS_POR_LOTE) return true;
  const masViejo = Math.min(...pendientes.map((p) => p.createdAt.getTime()));
  return ahora.getTime() - masViejo >= ESPERA_PARA_JUNTAR_MS;
}

/** El estado de un pedido según el tipo de resultado que devolvió Anthropic. */
export function estadoDelResultado(tipo: "succeeded" | "errored" | "canceled" | "expired"): EstadoDelPedido {
  if (tipo === "succeeded") return "listo";
  if (tipo === "expired") return "vencido";
  return "error";
}

/** ¿Un pedido enviado ya no va a volver? */
export function seVencio(enviadoAt: Date | null, ahora: Date): boolean {
  return !!enviadoAt && ahora.getTime() - enviadoAt.getTime() > HORAS_PARA_VENCER * 3_600_000;
}

/** El `custom_id` de Anthropic acepta letras, números, «_» y «-», hasta 64: el id de la fila (un cuid) entra. */
export function idParaAnthropic(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error(`lib/ai/lotes.ts: el id «${id}» no sirve como custom_id`);
  return id;
}
