/**
 * lib/cobranza/borrador-contexto.ts
 *
 * Lo que el borrador de correo de cobro sabe de ESTA factura. PURO: el adaptador de bitácora
 * (lib/cobranza/adapters/communication-bitacora.ts) lee la base y el agente
 * (lib/cobranza/agents/borrador-cobro.ts) arma el prompt; qué se elige y cómo se dice vive acá.
 *
 * ── EL DEFECTO QUE CIERRA ───────────────────────────────────────────────────────
 * El contexto era la última entrada de la bitácora de la CUENTA, sin mirar de qué factura hablaba,
 * y el prompt no traía la promesa de pago. Ileana Aguilar tiene dos facturas pendientes: la 0295,
 * con la anotación «falta de informes», y la 0338, sin anotación. El borrador de la segunda citaba
 * la nota de la primera, y ninguno de los dos sabía que había una promesa. El dato estaba: 45 de las
 * 66 entradas de la bitácora ya traen su cobro (medido el 2026-09-12). Faltaba leerlo.
 */
import { diffDays, marcaPromesa } from "./engine";
import type { ComContexto } from "./ports";

/** Cuántas entradas recientes lee el adaptador antes de elegir. */
export const ENTRADAS_DE_BITACORA_A_LEER = 50;

export interface EntradaDeBitacora {
  tipo: string;
  contenido: string;
  createdAt: Date;
  cobroId: string | null;
}

/**
 * ¿Esta entrada le sirve al correo de este cobro? Las generales de la cuenta (sin cobro), sí; las
 * de este cobro, sí; las de OTRA factura, nunca. Sin cobro pedido (`null`) es el contexto de la
 * cuenta entera y valen todas.
 *
 * ⚠ El adaptador filtra con la misma regla en la consulta, para que las notas de otras facturas no
 * le coman la ventana de `ENTRADAS_DE_BITACORA_A_LEER`. Si cambia acá, cambia allá.
 */
export function leCorrespondeAlCobro(entrada: { cobroId: string | null }, cobroId: string | null): boolean {
  return cobroId === null || entrada.cobroId === null || entrada.cobroId === cobroId;
}

/** La última comunicación humana y el último correo que le corresponden a este cobro. */
export function contextoDeComunicacion(
  entradas: readonly EntradaDeBitacora[],
  cobroId: string | null,
  correoCobro: string | null,
): ComContexto {
  const propias = entradas
    .filter((e) => e.tipo !== "ACTUALIZACION_IA" && leCorrespondeAlCobro(e, cobroId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const ultimaHumana = propias[0] ?? null;
  const ultimoCorreo = propias.find((e) => e.tipo === "CORREO") ?? null;
  return {
    ultimaComunicacion: ultimaHumana
      ? {
          fechaISO: ultimaHumana.createdAt.toISOString().slice(0, 10),
          tipo: ultimaHumana.tipo,
          resumen: ultimaHumana.contenido.slice(0, 1500),
        }
      : null,
    hiloReciente: ultimoCorreo?.contenido.slice(0, 4000) ?? null,
    correoCobro,
  };
}

/**
 * La promesa de pago de esta factura, en una línea para el prompt. `null` cuando `marcaPromesa` no
 * marca nada: sin promesa, ya cobrado o sin factura emitida.
 *
 * ⚠ Dice que la factura sigue siendo deuda a propósito: la promesa es marca, no descuento (decisión
 * de Alex, 2026-09-12), y un correo que la trate como «ya arreglado» afloja el cobro.
 */
export function lineaDePromesa(
  cobro: { estado: string; fechaEmisionISO: string | null; promesaPagoISO: string | null },
  todayISO: string,
): string | null {
  const marca = marcaPromesa(cobro, todayISO);
  if (!cobro.promesaPagoISO || marca === null) return null;
  const fecha = cobro.promesaPagoISO.slice(0, 10);
  if (marca === "vigente") {
    return `Promesa de pago de ESTA factura: el cliente prometió pagar el ${fecha}. Todavía está vigente, y la factura sigue siendo deuda hasta que entre el depósito.`;
  }
  return `Promesa de pago de ESTA factura: el cliente prometió pagar el ${fecha} y pasaron ${diffDays(fecha, todayISO)} día(s) sin depósito. La promesa está incumplida.`;
}
