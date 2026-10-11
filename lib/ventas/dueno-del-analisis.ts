/**
 * lib/ventas/dueno-del-analisis.ts — DE QUIÉN ES EL GRUPO DE REUNIONES QUE SE ANALIZA EN /sales.
 *
 * El «Análisis de ventas» de /sales manda un grupo de reuniones (las de un dominio) a UN solo
 * prompt. Hasta el 2026-10-09 la ruta las leía por los ids que mandaba el navegador sin mirar de
 * quién eran: cualquier interno podía juntar en la misma llamada reuniones de dos clientes, que es
 * lo que el invariante 1 de CLAUDE.md prohíbe (Memoria de la cuenta · Etapa 0).
 *
 * La regla, pura para poder probarla sin base:
 *   · Un solo dueño entre las que tienen dueño → se puede (y la ruta exige acceso a ese cliente).
 *   · Más de un dueño → no: el vendedor elige las de una sola empresa.
 *   · Ninguna con dueño → se puede: es un prospecto todavía sin resolver, la misma regla que
 *     admite las huérfanas en la propuesta comercial (lib/business-cases/feeding.ts).
 *
 * El dueño de cada reunión sale de `duenoDeLaSesion` (el chokepoint), nunca de otra copia.
 */
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";

export type DuenoDelAnalisis =
  | { ok: true; clientId: string | null }
  | { ok: false; duenos: string[] };

export function unDuenoParaElAnalisis(
  sesiones: ReadonlyArray<{ resolvedClientId: string | null; manualClientId: string | null }>,
): DuenoDelAnalisis {
  const duenos = [...new Set(sesiones.map((s) => duenoDeLaSesion(s)).filter((d): d is string => !!d))];
  if (duenos.length > 1) return { ok: false, duenos };
  return { ok: true, clientId: duenos[0] ?? null };
}

/**
 * Los dueños de un grupo, del que tiene más reuniones al que tiene menos (empate: el que aparece primero). El grupo de
 * /sales se arma por el primer dominio de afuera, así que gmail.com o un holding juntan reuniones de varias empresas:
 * antes la ruta respondía 409 y el botón quedaba sin salida para siempre. Ahora se analiza la empresa con más reuniones
 * (a la que quien pide tiene acceso) y se avisa cuáles quedaron afuera.
 */
export function duenosPorCantidad(sesiones: ReadonlyArray<{ resolvedClientId: string | null; manualClientId: string | null }>): string[] {
  const cuenta = new Map<string, number>();
  for (const s of sesiones) {
    const d = duenoDeLaSesion(s);
    if (d) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

/** Las reuniones que van al análisis de ese dueño: las suyas y las que no son de nadie (un prospecto sin resolver). */
export function sesionesDelDueno<T extends { resolvedClientId: string | null; manualClientId: string | null }>(sesiones: readonly T[], clientId: string | null): T[] {
  if (!clientId) return [...sesiones];
  return sesiones.filter((s) => {
    const d = duenoDeLaSesion(s);
    return d === null || d === clientId;
  });
}
