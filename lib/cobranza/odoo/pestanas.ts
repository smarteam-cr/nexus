/**
 * lib/cobranza/odoo/pestanas.ts
 *
 * Las pestañas de Cobranza › Odoo y cómo se lee la que pide un enlace (`?pestana=no-cuadra`).
 *
 * ⚠ POR QUÉ VIVE ACÁ Y NO EN OdooClient.tsx: la página es un componente de SERVIDOR y OdooClient es
 * "use client". Lo que un servidor importa de un módulo de cliente no es el valor sino una referencia
 * opaca: `PESTANAS.find(...)` no existía y la página entera caía al boundary de error
 * (`m.PESTANAS.find is not a function`, 2026-09-20 → 24, en producción). Un módulo sin "use client" lo
 * pueden usar los dos lados.
 */

export type Pestana = "que-es" | "emparejar" | "no-cuadra";

export const PESTANAS: readonly Pestana[] = ["que-es", "emparejar", "no-cuadra"];

/** La pestaña que pidió el enlace, o `undefined` si no pidió ninguna o pidió una que no existe. */
export function pestanaDe(valor: string | undefined): Pestana | undefined {
  return PESTANAS.find((p) => p === valor);
}
