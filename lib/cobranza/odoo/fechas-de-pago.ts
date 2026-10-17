/**
 * lib/cobranza/odoo/fechas-de-pago.ts — el día en que entró la plata de una factura de Odoo (2026-10-16). Solo lectura.
 *
 * El espejo copia el ESTADO de pago (`payment_state`) pero no el día: Odoo no lo tiene en la factura, lo tiene en el
 * movimiento con que la concilió. Para cada factura se sigue la línea por cobrar → sus conciliaciones parciales → la
 * línea del pago, y se toma su fecha. Es el mismo camino que usaba scripts/cargar-cuenta-desde-odoo.ts.
 *
 * ⚠ Las conciliaciones de diferencia de cambio (monto 0 en la moneda de la factura) no cuentan: una factura en dólares
 * se concilia días después por 0 dólares y algunos colones, y tomarla corría el día del pago al asiento de fin de mes.
 * Con varios pagos, el último: la factura quedó pagada cuando entró el último.
 *
 * Habla con Odoo solo por el puerto (`OdooTransport`): ni HTTP ni base acá (guardas.test.ts).
 */
import type { OdooTransport } from "./transporte";

/** odooMoveId → `YYYY-MM-DD`. Una factura sin pago encontrado no está en el mapa. */
export async function fechasDePagoEnOdoo(t: OdooTransport, odooMoveIds: readonly number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const moveId of odooMoveIds) {
    const lineas = await t.buscarYLeer(
      "account.move.line",
      [["move_id", "=", moveId], ["account_id.account_type", "=", "asset_receivable"]],
      ["id", "matched_credit_ids"],
      {},
    );
    const parciales = lineas.flatMap((l) => (Array.isArray(l.matched_credit_ids) ? (l.matched_credit_ids as number[]) : []));
    if (!parciales.length) continue;
    const recs = await t.buscarYLeer("account.partial.reconcile", [["id", "in", parciales]], ["id", "credit_amount_currency", "credit_move_id"], {});
    const contrapartes = recs
      .filter((r) => Number(r.credit_amount_currency) > 0 && Array.isArray(r.credit_move_id))
      .map((r) => Number((r.credit_move_id as unknown[])[0]));
    if (!contrapartes.length) continue;
    const pagos = await t.buscarYLeer("account.move.line", [["id", "in", contrapartes]], ["id", "date"], {});
    const fechas = pagos
      .map((p) => String(p.date).slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (fechas.length) out.set(moveId, fechas[fechas.length - 1]!);
  }
  return out;
}
