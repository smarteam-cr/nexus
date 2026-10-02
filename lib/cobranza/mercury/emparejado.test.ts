/**
 * lib/cobranza/mercury/emparejado.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/mercury --project unit`.
 *
 * Las propuestas de «Emparejar» de Mercury, con los casos medidos el 2026-10-02: el número escrito con más texto
 * (Metzger, «INVOICE NO.INV-48»), la razón social contra el nombre comercial, y el monto que solo se ofrece entre
 * cuentas que facturan por Mercury (Patagonia Camp contra Honda).
 */
import { describe, it, expect } from "vitest";
import {
  cuentasSinClienteDeMercury,
  nombresParecidos,
  proponerCuentas,
  type ClienteParaEmparejar,
  type CuentaParaEmparejar,
} from "./emparejado";

const cliente = (id: string, nombre: string, extra: Partial<ClienteParaEmparejar> = {}): ClienteParaEmparejar => ({
  mercuryCustomerId: id,
  nombre,
  cuentaId: null,
  ignorado: false,
  ...extra,
});
const cuenta = (cuentaId: string, nombre: string, extra: Partial<CuentaParaEmparejar> = {}): CuentaParaEmparejar => ({
  cuentaId,
  nombre,
  razonSocial: null,
  sociedadesMercury: [],
  via: "MERCURY",
  ...extra,
});

describe("nombresParecidos", () => {
  it("es la misma empresa sin la forma jurídica ni la puntuación", () => {
    expect(nombresParecidos("Visual Branding S.A.", "VISUAL BRANDING")).toBe(true);
  });
  it("uno contiene al otro como palabras enteras, con al menos 5 letras", () => {
    expect(nombresParecidos("Club de Amantes del Vino", "Club de Amantes")).toBe(true);
    expect(nombresParecidos("Hondanet Corp", "Honda")).toBe(false);
  });
  it("un nombre vacío no se parece a nada", () => {
    expect(nombresParecidos("", "Visual Branding")).toBe(false);
  });
});

describe("proponerCuentas", () => {
  it("NÚMERO: la factura está anotada en un cobro de una sola cuenta, aunque esté escrita con más texto", () => {
    const p = proponerCuentas(
      [cliente("met", "Metzger Group LLC")],
      [{ numero: "INV-48", mercuryCustomerId: "met", monto: 900, moneda: "USD", estado: "Unpaid" }],
      [cuenta("c-met", "Metzger", { via: "ODOO" })],
      [{ cuentaId: "c-met", monto: 900, moneda: "USD", numeroFactura: "INVOICE NO.INV-48" }],
    ).get("met");
    expect(p?.[0]).toMatchObject({ cuentaId: "c-met", via: "NUMERO" });
    expect(p?.[0]?.evidencia).toContain("INV-48");
  });

  it("NÚMERO: si dos cuentas anotaron el mismo número no se propone ninguna por número", () => {
    const p = proponerCuentas(
      [cliente("x", "Zeta Holdings")],
      [{ numero: "INV-10", mercuryCustomerId: "x", monto: 100, moneda: "USD", estado: "Paid" }],
      [cuenta("c1", "Uno", { via: "ODOO" }), cuenta("c2", "Dos", { via: "ODOO" })],
      [
        { cuentaId: "c1", monto: 100, moneda: "USD", numeroFactura: "INV-10" },
        { cuentaId: "c2", monto: 100, moneda: "USD", numeroFactura: "INV-10" },
      ],
    ).get("x");
    expect(p ?? []).toEqual([]);
  });

  it("NOMBRE: por el nombre de la cuenta, su razón social o una sociedad de Mercury ya anotada", () => {
    const r = proponerCuentas(
      [cliente("a", "Visual Branding S.A."), cliente("b", "Servicios San Mateo S.A."), cliente("c", "Atlas Mining Corp")],
      [],
      [
        cuenta("ca", "Visual Branding"),
        cuenta("cb", "Iberorutas", { razonSocial: "Servicios San Mateo" }),
        cuenta("cc", "Atlas", { sociedadesMercury: ["Atlas Mining Corp"] }),
      ],
      [],
    );
    expect(r.get("a")?.[0]).toMatchObject({ cuentaId: "ca", via: "NOMBRE", evidencia: "El nombre es el de la cuenta." });
    expect(r.get("b")?.[0]).toMatchObject({ cuentaId: "cb", via: "NOMBRE" });
    expect(r.get("b")?.[0]?.evidencia).toContain("Servicios San Mateo");
    expect(r.get("c")?.[0]).toMatchObject({ cuentaId: "cc", via: "NOMBRE" });
  });

  it("MONTO: solo entre cuentas que facturan por Mercury (Patagonia Camp no es Honda)", () => {
    const r = proponerCuentas(
      [cliente("pat", "Patagonia Camp SpA")],
      [{ numero: "INV-30", mercuryCustomerId: "pat", monto: 4000, moneda: "USD", estado: "Paid" }],
      [cuenta("honda", "Honda Costa Rica", { via: "ODOO" })],
      [{ cuentaId: "honda", monto: 4000, moneda: "USD", numeroFactura: null }],
    );
    expect(r.get("pat")).toBeUndefined();

    const r2 = proponerCuentas(
      [cliente("pat", "Patagonia Camp SpA")],
      [{ numero: "INV-30", mercuryCustomerId: "pat", monto: 4000, moneda: "USD", estado: "Paid" }],
      [cuenta("pc", "Campamento del Sur")],
      [{ cuentaId: "pc", monto: 4000, moneda: "USD", numeroFactura: null }],
    );
    expect(r2.get("pat")?.[0]).toMatchObject({ cuentaId: "pc", via: "MONTO" });
  });

  it("una cuenta aparece una vez por cliente, con su señal más fuerte", () => {
    const p = proponerCuentas(
      [cliente("vb", "Visual Branding S.A.")],
      [{ numero: "INV-53", mercuryCustomerId: "vb", monto: 1780, moneda: "USD", estado: "Unpaid" }],
      [cuenta("cvb", "Visual Branding")],
      [{ cuentaId: "cvb", monto: 1780, moneda: "USD", numeroFactura: "INV-53" }],
    ).get("vb");
    expect(p).toHaveLength(1);
    expect(p?.[0]?.via).toBe("NUMERO");
  });

  it("no propone nada para un cliente ya emparejado ni para uno marcado «no es cliente»", () => {
    const r = proponerCuentas(
      [cliente("a", "Visual Branding", { cuentaId: "ca" }), cliente("b", "Visual Branding", { ignorado: true })],
      [],
      [cuenta("ca", "Visual Branding")],
      [],
    );
    expect(r.size).toBe(0);
  });

  it("las facturas anuladas no cuentan como evidencia", () => {
    const p = proponerCuentas(
      [cliente("x", "Zeta Holdings")],
      [{ numero: "INV-11", mercuryCustomerId: "x", monto: 100, moneda: "USD", estado: "Cancelled" }],
      [cuenta("c1", "Uno")],
      [{ cuentaId: "c1", monto: 100, moneda: "USD", numeroFactura: "INV-11" }],
    ).get("x");
    expect(p).toBeUndefined();
  });
});

describe("cuentasSinClienteDeMercury", () => {
  it("las cuentas por Mercury que ningún cliente de Mercury tiene (Teamnet tiene dos)", () => {
    const sin = cuentasSinClienteDeMercury(
      [
        { cuentaId: "teamnet", via: "MERCURY" },
        { cuentaId: "sola", via: "MERCURY" },
        { cuentaId: "odoo", via: "ODOO" },
      ],
      [{ cuentaId: "teamnet" }, { cuentaId: "teamnet" }, { cuentaId: null }],
    );
    expect(sin.map((c) => c.cuentaId)).toEqual(["sola"]);
  });
});
