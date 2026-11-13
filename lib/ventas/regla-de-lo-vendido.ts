/**
 * lib/ventas/regla-de-lo-vendido.ts — LA regla de qué cuenta como vendido (2026-11-13). PURO: sin Prisma, sin red.
 *
 * Un trato cuenta como vendido si está GANADO en HubSpot, sea del pipeline que sea, y nadie lo marcó como «no es una
 * venta» (`excluida`: una prueba, un duplicado). Nada más.
 *
 * ── POR QUÉ UNA SOLA REGLA ──────────────────────────────────────────────────────
 * El 13 de noviembre lo vendido del punto de equilibrio pasó a sumar TODOS los pipelines (pedido de Finanzas: «también
 * lo que vende Customer Success»), pero «Ventas ganadas sin cobro», el bono de las metas de gerencia y lo vendido de las
 * propuestas seguían con los tres pipelines de `PIPELINES_VENTA_PROPIA`. Una venta de un pipeline nuevo sumaba al
 * vendido y no pedía su cobro ni pagaba bono. Cada lector de lo vendido usa esto; la prueba
 * `regla-de-lo-vendido.test.ts` vigila que ninguno vuelva a filtrar por pipeline.
 *
 * ⚠ «No genera cobro» (`noGeneraCobroEn`, Cobranza › Seguimiento) NO entra acá: una continuidad o un add-on sin cobro
 * propio es una venta de verdad y cuenta en el vendido, la cuota y la comisión. Solo sale de la lista de cobros.
 *
 * ⚠ Lo que mira negocios ABIERTOS (el pronóstico, «Para ti» de Ventas) sigue con la lista de pipelines: es otra pregunta.
 */

/** El `where` de Prisma de una venta que cuenta. Se esparce: `{ ...VENTA_QUE_CUENTA, fechaCierre: … }`. */
export const VENTA_QUE_CUENTA = { estado: "GANADA", excluida: false } as const;

/**
 * Las que son venta (no excluidas), ganadas o no: para quien también mira las que se cayeron después de ganarse (las
 * comisiones: una venta perdida a tiempo descuenta). La mitad «es una venta» de la regla, sin la de «sigue ganada».
 */
export const VENTA_NO_EXCLUIDA = { excluida: VENTA_QUE_CUENTA.excluida } as const;

/** La misma regla, para lo que ya está en memoria. */
export function cuentaComoVendida(v: { estado: string; excluida: boolean }): boolean {
  return v.estado === VENTA_QUE_CUENTA.estado && !v.excluida;
}
