/**
 * lib/ventas/dueno-del-analisis.ts — DE QUIÉN ES EL GRUPO DE REUNIONES QUE SE ANALIZA EN /sales.
 *
 * El «Análisis de ventas» de /sales manda un grupo de reuniones (las de un dominio) a UN solo
 * prompt. Hasta el 2026-10-09 la ruta las leía por los ids que mandaba el navegador sin mirar de
 * quién eran: cualquier interno podía juntar en la misma llamada reuniones de dos clientes, que es
 * lo que el invariante 1 de CLAUDE.md prohíbe (Memoria de la cuenta · Etapa 0).
 *
 * La regla: un análisis, una empresa. Se analiza la empresa con más reuniones del grupo a la que quien pide tiene
 * acceso; las de las otras empresas y las que no tienen empresa quedan afuera, y se avisa. Desde el 2026-11-23 una
 * reunión sin empresa ya no entra (antes iba al prompt junto con las de la elegida, o sola: un grupo de gmail juntaba
 * así a dos prospectos). Las reuniones que entran salen de `getClientSessions` en la ruta (app/api/sales/analyze).
 *
 * El dueño de cada reunión sale de `duenoDeLaSesion` (el chokepoint), nunca de otra copia.
 */
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";

/**
 * Los dueños de un grupo, del que tiene más reuniones al que tiene menos (empate: el que aparece primero). El grupo de
 * /sales se arma por el primer dominio de afuera, así que gmail.com o un holding juntan reuniones de varias empresas:
 * antes la ruta respondía 409 y el botón quedaba sin salida para siempre. Ahora se analiza la empresa con más reuniones
 * (a la que quien pide tiene acceso) y se avisa cuáles quedaron afuera. Las reuniones sin empresa no cuentan.
 */
export function duenosPorCantidad(sesiones: ReadonlyArray<{ resolvedClientId: string | null; manualClientId: string | null }>): string[] {
  const cuenta = new Map<string, number>();
  for (const s of sesiones) {
    const d = duenoDeLaSesion(s);
    if (d) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}
