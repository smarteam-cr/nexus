/**
 * lib/cobranza/odoo/fechas-de-pago.test.ts — el día del pago de cada factura de Odoo, pedido en lote (2026-10-17).
 */
import { describe, expect, it } from "vitest";
import type { OdooDominio, OdooTransport } from "./transporte";
import { fechasDePagoEnOdoo } from "./fechas-de-pago";

/** Un Odoo de mentira que contesta `id in [...]` y `move_id in [...]`, y cuenta los pedidos. */
function odooFalso(datos: { lineas: Record<string, unknown>[]; parciales: Record<string, unknown>[]; pagos: Record<string, unknown>[] }) {
  let pedidos = 0;
  const enLista = (dominio: OdooDominio, campo: string) => {
    const regla = (dominio as unknown[]).find((x) => Array.isArray(x) && x[0] === campo) as [string, string, number[]] | undefined;
    return new Set(regla?.[2] ?? []);
  };
  const t: OdooTransport = {
    async buscarYLeer(modelo, dominio) {
      pedidos++;
      if (modelo === "account.partial.reconcile") {
        const ids = enLista(dominio, "id");
        return datos.parciales.filter((p) => ids.has(Number(p.id)));
      }
      if (enLista(dominio, "move_id").size) {
        const moves = enLista(dominio, "move_id");
        return datos.lineas.filter((l) => moves.has(Number((l.move_id as unknown[])[0])));
      }
      const ids = enLista(dominio, "id");
      return datos.pagos.filter((p) => ids.has(Number(p.id)));
    },
    async contar() {
      return 0;
    },
    async agrupar() {
      return [];
    },
  };
  return { t, pedidos: () => pedidos };
}

describe("fechasDePagoEnOdoo", () => {
  it("pide en lote (3 pedidos para varias facturas) y toma el último pago, sin las diferencias de cambio", async () => {
    const { t, pedidos } = odooFalso({
      lineas: [
        { id: 11, move_id: [1, "FAC/1"], matched_credit_ids: [101, 102] },
        { id: 21, move_id: [2, "FAC/2"], matched_credit_ids: [201] },
        { id: 31, move_id: [3, "FAC/3"], matched_credit_ids: [] },
      ],
      parciales: [
        { id: 101, credit_amount_currency: 500, credit_move_id: [1001, "BNK"] },
        { id: 102, credit_amount_currency: 0, credit_move_id: [1002, "DIF"] }, // diferencia de cambio: no cuenta
        { id: 201, credit_amount_currency: 300, credit_move_id: [2001, "BNK"] },
      ],
      pagos: [
        { id: 1001, date: "2026-08-12" },
        { id: 1002, date: "2026-08-31" },
        { id: 2001, date: "2026-09-03" },
      ],
    });
    const fechas = await fechasDePagoEnOdoo(t, [1, 2, 3]);
    expect([...fechas]).toEqual([
      [1, "2026-08-12"],
      [2, "2026-09-03"],
    ]);
    expect(pedidos()).toBe(3);
  });

  it("si Odoo falla, lanza (quien llama manda esas facturas a «sin el día del pago»)", async () => {
    const t: OdooTransport = {
      async buscarYLeer() {
        throw new Error("Odoo no contesta");
      },
      async contar() {
        return 0;
      },
      async agrupar() {
        return [];
      },
    };
    await expect(fechasDePagoEnOdoo(t, [1])).rejects.toThrow("Odoo no contesta");
  });
});
