/**
 * lib/finanzas/conciliacion.ts — Finanzas › Conciliación: lo que no cuadra con Odoo y con Mercury en UNA lista
 * (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md).
 *
 * Las dos listas ya hablan el mismo contrato (`DiferenciaOdoo`): las de Mercury se distinguen por el prefijo `MERCURY-`
 * de su código. Juntarlas es ordenarlas una sola vez y saber de dónde viene cada línea, para mandar cada «Está bien así»
 * a su ruta.
 *
 * ── QUIÉN LA TRABAJA ────────────────────────────────────────────────────────────
 * Una línea que «falta un dato de negocio» (`donde: PREGUNTANDO`) es una DECISIÓN: no se arregla registrando, la toma
 * quien supervisa («¿entró esta plata?», «¿es venta?»). Todas las demás las trabaja quien registra.
 *
 * PURO: sin Prisma ni red.
 */
import type { DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";

export type FuenteDeLinea = "odoo" | "mercury";
export type FiltroFuente = "todas" | FuenteDeLinea;
/** «mias» = las que se arreglan registrando; «decisiones» = las que decide quien supervisa. */
export type FiltroQuien = "todas" | "mias" | "decisiones";

/** De dónde viene una línea: las de Mercury llevan el prefijo en su código. */
export function fuenteDeLinea(codigo: string): FuenteDeLinea {
  return codigo.startsWith("MERCURY-") ? "mercury" : "odoo";
}

/** ¿La línea es una decisión de negocio (la toma quien supervisa) y no algo que se arregla registrando? */
export function esDecision(l: Pick<DiferenciaOdoo, "donde">): boolean {
  return l.donde === "PREGUNTANDO";
}

const SEVERIDAD: Readonly<Record<string, number>> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/**
 * Las dos listas en una, en el orden en que se trabajan: primero lo que tiene filas pendientes, después lo más grave y,
 * a igual gravedad, lo que mueve más plata. Cada lista ya viene ordenada así; esto solo las intercala.
 */
export function juntarDiferencias(odoo: readonly DiferenciaOdoo[], mercury: readonly DiferenciaOdoo[]): DiferenciaOdoo[] {
  return [...odoo, ...mercury].sort(
    (a, b) =>
      Number(a.items.length === 0) - Number(b.items.length === 0) ||
      (SEVERIDAD[a.severidad] ?? 9) - (SEVERIDAD[b.severidad] ?? 9) ||
      (b.montoEnJuego ?? 0) - (a.montoEnJuego ?? 0),
  );
}

/** Las líneas que pasan los dos filtros de la pantalla. */
export function filtrarDiferencias(
  lineas: readonly DiferenciaOdoo[],
  filtro: { fuente: FiltroFuente; quien: FiltroQuien },
): DiferenciaOdoo[] {
  return lineas.filter(
    (l) =>
      (filtro.fuente === "todas" || fuenteDeLinea(l.codigo) === filtro.fuente) &&
      (filtro.quien === "todas" || (filtro.quien === "decisiones") === esDecision(l)),
  );
}

/** Cuántas FILAS pendientes hay de cada lado: lo que se trabaja registrando y lo que espera una decisión. */
export function filasPorQuien(lineas: readonly DiferenciaOdoo[]): { mias: number; decisiones: number } {
  let mias = 0;
  let decisiones = 0;
  for (const l of lineas) {
    if (esDecision(l)) decisiones += l.items.length;
    else mias += l.items.length;
  }
  return { mias, decisiones };
}
