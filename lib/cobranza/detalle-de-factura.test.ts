/**
 * lib/cobranza/detalle-de-factura.test.ts — el detalle de una factura de Odoo o de Mercury (2026-10-17).
 *
 * Correr: `npx vitest run lib/cobranza/detalle-de-factura.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import { armarDetalle, mesDelServicio, textoPlano } from "./detalle-de-factura";
import { detalleDeFacturaOdoo, lineaDeOdoo } from "./odoo/detalle-de-factura";
import { detalleDeFacturaMercury } from "./mercury/detalle-de-factura";
import type { OdooTransport } from "./odoo/transporte";

describe("el mes del servicio, leído de la nota", () => {
  it("lee «Setiembre» y «Septiembre», con o sin «de»", () => {
    expect(mesDelServicio("Factura de Setiembre 2026")).toBe("2026-09");
    expect(mesDelServicio("mes de cobro septiembre de 2026")).toBe("2026-09");
    expect(mesDelServicio("Implementación de CRM de Octubre 2026")).toBe("2026-10");
    expect(mesDelServicio("Services for September 2026")).toBe("2026-09");
  });

  it("sin año no adivina: un mes suelto no dice de qué año es", () => {
    expect(mesDelServicio("Factura de setiembre")).toBeNull();
    expect(mesDelServicio(null, undefined, "")).toBeNull();
  });

  it("una palabra que no es un mes antes de un año no cuenta", () => {
    expect(mesDelServicio("Contrato 2026, cuota de marzo 2026")).toBe("2026-03");
  });
});

describe("la nota de Odoo en texto", () => {
  it("saca las etiquetas, respeta los saltos y deja null si queda vacía", () => {
    expect(textoPlano("<p>Factura de Setiembre 2026</p><p>Gracias&nbsp;por&nbsp;su pago</p>")).toBe("Factura de Setiembre 2026\nGracias por su pago");
    expect(textoPlano("<p><br></p>")).toBeNull();
  });
});

describe("las líneas de Odoo", () => {
  it("una línea de producto trae su producto, su cuenta y su subtotal; impuestos y plazo de pago no van", () => {
    expect(
      lineaDeOdoo({ name: "Licencias HubSpot", display_type: "product", product_id: [3, "Implementación de CRM"], quantity: 1, price_unit: 1037001, discount: 0, price_subtotal: 1037001, account_id: [7, "4101 Ventas"] }),
    ).toEqual({ tipo: "linea", descripcion: "Licencias HubSpot", producto: "Implementación de CRM", cantidad: 1, precioUnitario: 1037001, descuentoPct: null, subtotal: 1037001, cuenta: "4101 Ventas" });
    expect(lineaDeOdoo({ name: "IVA 13%", display_type: "tax" })).toBeNull();
    expect(lineaDeOdoo({ name: "Sección", display_type: "line_section" })!.tipo).toBe("seccion");
  });

  it("pide el asiento y sus líneas por el puerto, y arma el detalle con su total y su mes", async () => {
    const pedidos: string[] = [];
    const t: OdooTransport = {
      buscarYLeer: async (modelo: string) => {
        pedidos.push(modelo);
        if (modelo === "account.move") return [{ id: 9, narration: "<p>Factura de Setiembre 2026</p>", ref: false }];
        return [
          { name: "Licencias", display_type: "product", quantity: 1, price_unit: 1037001, price_subtotal: 1037001 },
          { name: "Servicio", display_type: "product", quantity: 1, price_unit: 1265600, price_subtotal: 1265600 },
        ];
      },
      contar: async () => 0,
      agrupar: async () => [],
    } as unknown as OdooTransport;
    const d = await detalleDeFacturaOdoo(t, { odooMoveId: 9, numero: "FAC/2026/0359", fecha: "2026-09-30", moneda: "CRC" });
    expect(pedidos.sort()).toEqual(["account.move", "account.move.line"]);
    expect(d.totalLineas).toBe(2302601);
    expect(d.mesDelServicio).toBe("2026-09");
    expect(d.nota).toBe("Factura de Setiembre 2026");
  });
});

describe("las líneas de Mercury", () => {
  it("lee `lineItems` con precio y cantidad, y el mes sale de la línea si la nota no lo dice", () => {
    const d = detalleDeFacturaMercury(
      { lineItems: [{ name: "Implementación de CRM de Setiembre 2026", unitPrice: 6407, quantity: 1 }, { name: "Licencias", unitPrice: 1440, quantity: 12 }] },
      { numero: "INV-60", fecha: "2026-09-01", moneda: "USD" },
    );
    expect(d.lineas.map((l) => l.subtotal)).toEqual([6407, 17280]);
    expect(d.totalLineas).toBe(23687);
    expect(d.mesDelServicio).toBe("2026-09");
    expect(d.nota).toBeNull();
  });

  it("tolera la factura envuelta en `invoice` y una línea sin precio (queda en null, no en cero)", () => {
    const d = detalleDeFacturaMercury({ invoice: { items: [{ description: "Algo" }], payerMemo: "Gracias" } }, { numero: "INV-1", fecha: null, moneda: "USD" });
    expect(d.lineas[0]!.precioUnitario).toBeNull();
    expect(d.lineas[0]!.subtotal).toBeNull();
    expect(d.nota).toBe("Gracias");
  });
});

describe("armarDetalle", () => {
  it("suma solo las líneas con subtotal", () => {
    const d = armarDetalle({
      fuente: "ODOO",
      numero: "X",
      fecha: null,
      moneda: "USD",
      nota: null,
      lineas: [
        { tipo: "seccion", descripcion: "Licencias", producto: null, cantidad: null, precioUnitario: null, descuentoPct: null, subtotal: null, cuenta: null },
        { tipo: "linea", descripcion: "a", producto: null, cantidad: 1, precioUnitario: 10.105, descuentoPct: null, subtotal: 10.1, cuenta: null },
      ],
    });
    expect(d.totalLineas).toBe(10.1);
  });
});
