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

import { recuperacionPrendida } from "@/lib/lecturas/reglas";

/**
 * Los tipos de pedido que van por lote, cada uno con su manejador en lib/ai/lotes-manejadores.ts.
 *   · vigia-barrido — el triaje del barrido diario del vigía (lo que entra solo por un riesgo que sigue).
 *   · lectura-recuperacion — la lectura de una reunión de hace más de 14 días que nunca se leyó (T2, el modo de
 *     recuperación: lib/lecturas/recuperacion.ts).
 */
export const TIPOS_DE_LOTE = ["vigia-barrido", "lectura-recuperacion"] as const;
export type TipoDeLote = (typeof TIPOS_DE_LOTE)[number];

export const esTipoDeLote = (t: string): t is TipoDeLote => (TIPOS_DE_LOTE as readonly string[]).includes(t);

/**
 * Los tipos que NO esperan al presupuesto automático del día: los encola una persona con su tope por corrida (el script
 * de la recuperación), y su gasto se anota a nombre de quien lo corrió: cuenta en el presupuesto humano del día, el
 * compartido. Una carga de 300 reuniones por el automático se comería unos 8 días de su tope de 10 USD.
 */
export const FUERA_DEL_PRESUPUESTO_AUTOMATICO: ReadonlySet<TipoDeLote> = new Set(["lectura-recuperacion"]);

/** El `LlmCall.origen` de una respuesta que llegó por lote: así la reconocen el panel y la proyección del gasto. */
export const origenDelLote = (tipo: string) => `lotes › ${tipo}`;
export const ORIGEN_DE_LA_RECUPERACION = origenDelLote("lectura-recuperacion");

/**
 * Los estados de un pedido que todavía puede volver (esperando o enviado): uno así no se vuelve a encolar. La única
 * lista; la recuperación la usa también en SQL.
 */
export const ESTADOS_VIVOS = ["en_espera", "enviado"] as const satisfies readonly EstadoDelPedido[];

/** ¿Este tipo se manda? Cada tipo puede tener su vuelta atrás: apagado, lo que espera se queda esperando. */
export function tipoPrendido(tipo: TipoDeLote, env: Readonly<Record<string, string | undefined>>): boolean {
  if (tipo === "lectura-recuperacion") return recuperacionPrendida(env);
  return true;
}

/**
 * Los tipos que se mandan en este tick: los prendidos y, sin presupuesto automático, solo los que no lo esperan. Se
 * decide ANTES de buscar los pendientes, así 100 pedidos automáticos esperando no tapan a los que sí pueden salir.
 */
export function tiposQueSeMandan(env: Readonly<Record<string, string | undefined>>, quedaAutomatico: boolean): TipoDeLote[] {
  return TIPOS_DE_LOTE.filter((t) => tipoPrendido(t, env) && (quedaAutomatico || FUERA_DEL_PRESUPUESTO_AUTOMATICO.has(t)));
}

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
