/**
 * lib/hubspot/proyecto-fusionado.ts — un proyecto que se fusionó en HubSpot, y releer después de escribir. PURO.
 *
 * ── EL PROYECTO FUSIONADO (2026-10-19, Librería Internacional) ──────────────────────────────────
 * Al fusionar dos proyectos en HubSpot, el id del que pierde sigue respondiendo 200, pero con los datos y el id del
 * que sigue. Es lo mismo que pasa con las empresas (DECISIONS «Una empresa fusionada no puede partir un cliente en
 * dos»). El espejo no lo veía: el id viejo ya no venía en las asociaciones de la empresa, la verificación lo daba por
 * «vivo» (el GET respondía) y la fila quedaba activa para siempre, con el encargado de antes. En Librería eso dejaba a
 * Heiver Gómez como CSE de la cuenta aunque en HubSpot ya estuviera Caroline Bersot: cambiar el encargado escribía
 * bien allá y la fila vieja lo seguía mostrando.
 *
 * ── RELEER DESPUÉS DE ESCRIBIR ───────────────────────────────────────────────────────────────────
 * El pase de cuenta escribe en HubSpot y después pide la sincronización del cliente. Si hubo otra en el último minuto
 * (la que corre sola al abrir la ficha), el piso la salta; si hay una en curso, devuelve la que empezó ANTES de
 * escribir. En los dos casos Nexus seguía con el encargado viejo y la celda volvía a él.
 */

/** El id del proyecto en que se fusionó el pedido, o null si HubSpot devolvió el mismo (o no devolvió id). */
export function fusionadoEn(pedido: string, devuelto: string | null | undefined): string | null {
  const a = String(pedido ?? "").trim();
  const b = String(devuelto ?? "").trim();
  if (!a || !b) return null;
  return a === b ? null : b;
}

/** Por qué la sincronización completa no trajo lo recién escrito: se la saltó o devolvió una que ya corría. */
export type SyncOmitida = "cooldown" | "piso" | "en_vuelo";

/**
 * ¿Hay que releer uno por uno los proyectos recién escritos? Sí cuando la corrida completa no corrió DESPUÉS de
 * escribir: la saltó el cooldown o el piso, o devolvió la que ya estaba en curso.
 */
export function hayQueReleerLosProyectos(espejo: { omitido?: SyncOmitida | null }): boolean {
  return !!espejo.omitido;
}
