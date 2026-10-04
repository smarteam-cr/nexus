/**
 * lib/finanzas/actualizar-tablero-server.ts
 *
 * «Actualizar» de Finanzas: vuelve a hacer AHORA las copias que normalmente se hacen una vez por día, a las 6 de la
 * mañana. Server-only. Nació en el punto de equilibrio (revisión con Alex, 2026-09-29) con dos fuentes; desde el rediseño
 * de Finanzas (2026-10-03) son tres y es el mismo botón en Conciliación, Integraciones y el punto de equilibrio:
 *
 *   · las ventas ganadas de HubSpot del año (la línea «Vendido»), con `syncVentasGanadas`;
 *   · las facturas y los clientes de Odoo, con `actualizarDesdeOdoo` (lo mismo que el botón de Cobranza › Odoo);
 *   · las facturas, los clientes y los pagos de Mercury, con `actualizarDesdeMercury`.
 *
 * Todas a la vez —son sistemas distintos— y cada una con su propio candado: si el job de la mañana o otra persona ya la
 * está corriendo, no corre dos veces. ⛔ Solo LEE HubSpot, Odoo y Mercury. No toca ningún cobro, ni el gasto, ni la
 * planilla: esos ya se leen de la base cada vez que se abre una pantalla.
 *
 * ⚠ Nunca lanza por una fuente caída: devuelve qué pasó con cada una (`actualizar-tablero.ts` arma el texto) y quien
 * llama recarga lo suyo igual.
 */
import "server-only";
import { syncVentasGanadas } from "@/lib/ventas/sync-ganadas";
import { actualizarDesdeOdoo } from "@/lib/cobranza/odoo/servicio";
import { actualizarDesdeMercury } from "@/lib/cobranza/mercury/servicio";
import { resumenDeVentas, ventasSinActualizar, type FuenteActualizada } from "./actualizar-tablero";

const fallo = (fuente: FuenteActualizada["fuente"], nombre: string) => (e: unknown): FuenteActualizada => ({
  fuente,
  ok: false,
  texto: `No se pudo actualizar la copia de ${nombre}: ${e instanceof Error ? e.message : String(e)}`,
});

export async function actualizarFuentesDelTablero(
  actor: string,
  anio: number,
  opciones: { ventas?: boolean } = {},
): Promise<FuenteActualizada[]> {
  const odoo = actualizarDesdeOdoo(actor)
    .then((r): FuenteActualizada => ({ fuente: "ODOO", ok: r.estado !== "FALLO", texto: r.mensaje }))
    .catch(fallo("ODOO", "Odoo"));
  const mercury = actualizarDesdeMercury(actor)
    .then((r): FuenteActualizada => ({ fuente: "MERCURY", ok: r.estado !== "FALLO", texto: r.mensaje }))
    .catch(fallo("MERCURY", "Mercury"));
  /* Las ventas solo hacen falta donde se miran (el punto de equilibrio, Integraciones): en Conciliación no. */
  if (opciones.ventas === false) return Promise.all([odoo, mercury]);
  const ventas = syncVentasGanadas({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` })
    .then((r) => resumenDeVentas(r, anio))
    .catch(ventasSinActualizar);
  return Promise.all([ventas, odoo, mercury]);
}
