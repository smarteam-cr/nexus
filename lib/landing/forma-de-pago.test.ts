import { describe, expect, it } from "vitest";
import { cuotasDe, inversionDelDocumento, nombreDelPago, planDePago } from "./forma-de-pago";
import type { InversionData } from "./inversion";

/** La Inversión de ABG tal como está en producción (2026-10-07). */
const ABG: InversionData = {
  moneda: "USD",
  lineas: [
    { concepto: "Implementación Marketing Hub Professional", descuento: "200", recurrencia: "unica", precioUnitario: "3200", monto: "" },
    { concepto: "Implementación Sales Hub Professional", recurrencia: "unica", precioUnitario: "3500", monto: "" },
    { concepto: "Implementación Service Hub", descuento: "500", recurrencia: "unica", precioUnitario: "2500", monto: "" },
    { concepto: "Integración bidireccional ABG ↔ HubSpot", descuento: "500", recurrencia: "unica", precioUnitario: "4500", monto: "" },
    { concepto: "Conector de la integración ABG - Hubspot", recurrencia: "mensual", precioUnitario: "300", monto: "" },
  ],
  licencias: [],
};

describe("planDePago — el caso de ABG", () => {
  const p = planDePago({ cuotas: 5 }, ABG);

  it("reparte el total único de los servicios, con los descuentos ya aplicados", () => {
    expect(p.total).toEqual({ min: 12500, max: 12500 });
    expect(p.pagos.map((x) => x.monto?.min)).toEqual([2500, 2500, 2500, 2500, 2500]);
    expect(p.iguales).toBe(true);
  });

  it("los descuentos por línea son el beneficio comercial", () => {
    expect(p.beneficio).toEqual({ min: 1200, max: 1200 });
    expect(p.descuentos.map((d) => [d.concepto, d.monto.min])).toEqual([
      ["Marketing Hub Professional", 200],
      ["Service Hub", 500],
      ["Integración bidireccional ABG ↔ HubSpot", 500],
    ]);
  });

  it("la mensualidad del conector NO se reparte: va aparte, desde el mes siguiente al último pago", () => {
    expect(p.recurrentes).toEqual([{ concepto: "Conector de la integración ABG - Hubspot", detalle: "", monto: { min: 300, max: 300 } }]);
    expect(p.recurrenteDesde).toBe("mes 5");
  });

  it("los nombres y los momentos por defecto", () => {
    expect(p.pagos.map((x) => x.nombre)).toEqual(["Pago inicial", "Segundo pago", "Tercer pago", "Cuarto pago", "Pago final"]);
    expect(p.pagos[0].momento).toBe("Antes de iniciar el proyecto");
    expect(p.pagos[2].cuando).toBe("Mes 2");
  });
});

describe("planDePago — los porcentajes", () => {
  it("un pago inicial fijo y el resto parejo", () => {
    const p = planDePago({ cuotas: 3, pagos: [{ porcentaje: "50%" }] }, ABG);
    expect(p.pagos.map((x) => x.porcentaje)).toEqual([50, 25, 25]);
    expect(p.pagos.map((x) => x.monto?.min)).toEqual([6250, 3125, 3125]);
    expect(p.iguales).toBe(false);
    expect(p.problema).toBeNull();
  });

  it("los centavos los absorbe el último pago: la suma da el total exacto", () => {
    const p = planDePago({ cuotas: 3 }, { moneda: "USD", lineas: [{ concepto: "X", monto: "$10,000" }] });
    const montos = p.pagos.map((x) => x.monto!.min);
    expect(montos[0]).toBe(3333.33);
    expect(montos.reduce((a, b) => a + b, 0)).toBeCloseTo(10000, 6);
  });

  it("porcentajes que pasan del 100 % se avisan", () => {
    expect(planDePago({ cuotas: 2, pagos: [{ porcentaje: "80" }, { porcentaje: "40" }] }, ABG).problema).toMatch(/120/);
  });
});

describe("planDePago — sin montos todavía", () => {
  it("sin Inversión hay plan (cuotas y momentos) pero no montos", () => {
    const p = planDePago({ cuotas: 4 }, null);
    expect(p.total).toBeNull();
    expect(p.pagos).toHaveLength(4);
    expect(p.pagos[0].monto).toBeNull();
  });

  it("una línea de cobro único con texto libre deja el total sin repartir (sería un número que nadie cotizó)", () => {
    const p = planDePago({ cuotas: 2 }, { moneda: "USD", lineas: [{ concepto: "A", monto: "$1,000" }, { concepto: "B", monto: "A definir" }] });
    expect(p.total).toBeNull();
    expect(p.pendientes).toBe(1);
  });

  it("las licencias de un Hub no entran al plan", () => {
    const p = planDePago(
      { cuotas: 1 },
      { moneda: "USD", lineas: [{ concepto: "Impl", monto: "$1,000" }], licencias: [{ hub: "sales_hub", concepto: "Sales Hub", monto: "$90" }] },
    );
    expect(p.total).toEqual({ min: 1000, max: 1000 });
    expect(p.recurrentes).toEqual([]);
    expect(p.pagos[0].nombre).toBe("Pago único");
  });
});

describe("cuotasDe y los nombres", () => {
  it("acota a 1–5 y cae a 4 sin dato", () => {
    expect(cuotasDe({ cuotas: 9 })).toBe(5);
    expect(cuotasDe({ cuotas: "3" })).toBe(3);
    expect(cuotasDe({})).toBe(4);
    expect(cuotasDe({ cuotas: 0 })).toBe(4);
  });
  it("en inglés", () => {
    expect(nombreDelPago(0, 3, "en")).toBe("Initial payment");
    expect(nombreDelPago(2, 3, "en")).toBe("Final payment");
  });
  it("la Inversión del documento se busca por su key", () => {
    expect(inversionDelDocumento([{ key: "hero", data: {} }, { key: "inversion", data: ABG }])).toBe(ABG);
  });
});
