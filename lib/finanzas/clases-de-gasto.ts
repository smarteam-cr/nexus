/**
 * lib/finanzas/clases-de-gasto.ts — qué clase de gasto puntual es y en qué fue (2026-11-13). Las listas, solas: las leen
 * el esquema de la frontera (lib/cobranza/schema.ts) y las reglas (reglas-de-gasto.ts), que llega a pantallas de cliente.
 * Sin zod ni nada más, a propósito (client-safe.test.ts, C-24). Espejo de los enums `GastoTipo` y `GastoRubro`.
 */
export const GASTO_TIPOS = ["REPRESENTACION", "TARJETA_CORPORATIVA", "OTRO"] as const;
export const GASTO_RUBROS = ["COMBUSTIBLE", "ALIMENTACION", "EQUIPO", "SUSCRIPCION", "SOFTWARE", "OTRO"] as const;
