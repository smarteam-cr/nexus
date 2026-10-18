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

/** De a cuántas facturas se pide (cada pedido es un `id in [...]`: un dominio enorme no lo acepta cualquier servidor). */
const LOTE = 200;

const idDe = (v: unknown): number => (Array.isArray(v) ? Number(v[0]) : Number(v));

/**
 * odooMoveId → `YYYY-MM-DD`. Una factura sin pago encontrado no está en el mapa.
 * En lote: tres pedidos por cada `LOTE` facturas (las líneas por cobrar, sus conciliaciones, las líneas del pago), en
 * vez de tres por factura. Si Odoo falla, lanza: quien llama decide qué hacer con las facturas sin día.
 */
export async function fechasDePagoEnOdoo(t: OdooTransport, odooMoveIds: readonly number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(odooMoveIds)];
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const lineas = await t.buscarYLeer(
      "account.move.line",
      [["move_id", "in", lote], ["account_id.account_type", "=", "asset_receivable"]],
      ["id", "move_id", "matched_credit_ids"],
      {},
    );
    /** parcial → la factura a la que pertenece. */
    const facturaDelParcial = new Map<number, number>();
    for (const l of lineas) {
      const moveId = idDe(l.move_id);
      for (const p of Array.isArray(l.matched_credit_ids) ? (l.matched_credit_ids as number[]) : []) facturaDelParcial.set(Number(p), moveId);
    }
    if (!facturaDelParcial.size) continue;
    const recs = await t.buscarYLeer("account.partial.reconcile", [["id", "in", [...facturaDelParcial.keys()]]], ["id", "credit_amount_currency", "credit_move_id"], {});
    /** línea del pago → las facturas que paga. */
    const facturasDelPago = new Map<number, number[]>();
    for (const r of recs) {
      if (!(Number(r.credit_amount_currency) > 0) || !Array.isArray(r.credit_move_id)) continue;
      const moveId = facturaDelParcial.get(Number(r.id));
      if (moveId === undefined) continue;
      const pago = idDe(r.credit_move_id);
      facturasDelPago.set(pago, [...(facturasDelPago.get(pago) ?? []), moveId]);
    }
    if (!facturasDelPago.size) continue;
    const pagos = await t.buscarYLeer("account.move.line", [["id", "in", [...facturasDelPago.keys()]]], ["id", "date"], {});
    for (const p of pagos) {
      const d = String(p.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      for (const moveId of facturasDelPago.get(Number(p.id)) ?? []) {
        const antes = out.get(moveId);
        if (!antes || d > antes) out.set(moveId, d);
      }
    }
  }
  return out;
}
