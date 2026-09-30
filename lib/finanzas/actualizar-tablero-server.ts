/**
 * lib/finanzas/actualizar-tablero-server.ts
 *
 * «Actualizar» del punto de equilibrio (revisión con Alex, 2026-09-29): vuelve a hacer AHORA las dos copias que el
 * tablero lee y que normalmente se hacen una vez por día, a las 6 de la mañana. Server-only.
 *
 *   · las ventas ganadas de HubSpot del año (la línea «Vendido»), con `syncVentasGanadas`;
 *   · las facturas y los clientes de Odoo, con `actualizarDesdeOdoo` (lo mismo que el botón de Cobranza › Odoo).
 *
 * Las dos a la vez —son sistemas distintos— y cada una con su propio candado: si el job de la mañana o otra persona
 * ya las está corriendo, no corren dos veces. ⛔ Solo LEE HubSpot y Odoo. No toca ningún cobro, ni el gasto, ni la
 * planilla: esos ya se leen de la base cada vez que se abre el tablero.
 *
 * ⚠ Nunca lanza por una fuente caída: devuelve qué pasó con cada una (`actualizar-tablero.ts` arma el texto) y quien
 * llama recarga el tablero igual.
 */
import "server-only";
import { syncVentasGanadas } from "@/lib/ventas/sync-ganadas";
import { actualizarDesdeOdoo } from "@/lib/cobranza/odoo/servicio";
import { resumenDeVentas, ventasSinActualizar, type FuenteActualizada } from "./actualizar-tablero";

export async function actualizarFuentesDelTablero(actor: string, anio: number): Promise<FuenteActualizada[]> {
  const ventas = syncVentasGanadas({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` })
    .then((r) => resumenDeVentas(r, anio))
    .catch(ventasSinActualizar);
  const odoo = actualizarDesdeOdoo(actor)
    .then((r): FuenteActualizada => ({ fuente: "ODOO", ok: r.estado !== "FALLO", texto: r.mensaje }))
    .catch(
      (e: unknown): FuenteActualizada => ({
        fuente: "ODOO",
        ok: false,
        texto: `No se pudo actualizar la copia de Odoo: ${e instanceof Error ? e.message : String(e)}`,
      }),
    );
  return Promise.all([ventas, odoo]);
}
