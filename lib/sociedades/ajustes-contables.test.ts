import { describe, expect, it } from "vitest";
import { mapearCompania, rangoDelMes, senalesDelMes, textoDeLaMarca } from "./ajustes-contables";

describe("la compañía de Odoo y sus cuentas puente", () => {
  it("✓ medido el 2026-11-13: traslado 110202, suspenso 110201 y los cobros y pagos sin aplicar", () => {
    expect(
      mapearCompania({
        id: 1,
        name: "CR SMARTEAM SOCIEDAD ANONIMA",
        currency_id: [39, "CRC"],
        transfer_account_id: [110, "110202 Transferencia interna"],
        account_journal_suspense_account_id: [101, "110201 Cuenta Transito CRC"],
        account_journal_payment_debit_account_id: [111, "21110 Recibos pendientes"],
        account_journal_payment_credit_account_id: [112, "110203 Pagos pendientes"],
      }),
    ).toEqual({ id: 1, nombre: "CR SMARTEAM SOCIEDAD ANONIMA", moneda: "CRC", cuentaDeTraslado: 110, cuentasPuente: [101, 111, 112] });
  });

  it("una versión de Odoo sin esos campos no rompe: sin cuentas puente", () => {
    expect(mapearCompania({ id: 2, name: "Otra" })).toEqual({ id: 2, nombre: "Otra", moneda: null, cuentaDeTraslado: null, cuentasPuente: [] });
    expect(mapearCompania({ id: false })).toBeNull();
  });
});

describe("el mes, para Odoo", () => {
  it("del primer día al primero del siguiente, también en diciembre", () => {
    expect(rangoDelMes("2026-10")).toEqual({ desde: "2026-10-01", hasta: "2026-11-01" });
    expect(rangoDelMes("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2027-01-01" });
  });
});

describe("los indicios de que el resultado del mes es contable", () => {
  it("✓ octubre de 2026: borradores y líneas en cuentas puente", () => {
    const s = senalesDelMes({
      borradores: [
        { nombre: "FAC/2026/0390", tipo: "out_invoice" },
        { nombre: "(sin número)", tipo: "in_invoice" },
      ],
      enPuente: [
        { cuenta: "110201 Cuenta Transito CRC", n: 26 },
        { cuenta: "21110 Recibos pendientes", n: 1 },
      ],
      malClasificadas: [{ cuenta: "410104 Comisiones Comerciales Dolares", n: 3 }],
      trasladosSueltos: 1,
    });
    expect(s.map((x) => [x.clave, x.n])).toEqual([
      ["borradores", 2],
      ["puente", 27],
      ["clasificacion", 3],
      ["traslados", 1],
    ]);
    expect(s[0]!.titulo).toBe("2 documentos del mes en borrador en Odoo");
    expect(s[0]!.detalle).toContain("facturas, facturas de proveedor");
    expect(s[3]!.titulo).toBe("1 traslado entre cuentas propias sin su otra mitad");
  });

  it("sin nada raro, ningún indicio (y eso no marca ni desmarca el mes)", () => {
    expect(senalesDelMes({ borradores: [], enPuente: [], malClasificadas: [], trasladosSueltos: 0 })).toEqual([]);
  });

  it("la frase que acompaña el resultado, con la nota de quien marcó", () => {
    expect(textoDeLaMarca({ nota: null })).toContain("no es una pérdida real");
    expect(textoDeLaMarca({ nota: "Falta rectificar el IVA." })).toMatch(/pérdida real.*Falta rectificar el IVA\.$/);
  });
});
