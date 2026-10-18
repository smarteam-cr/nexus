import { describe, expect, it } from "vitest";
import { aCentavos, desgloseIva, ivaDelCierre, modoIvaDe, TASA_IVA_CR } from "./iva";
import { gruposDeInversion } from "./inversion";
import { isBlank, NO_CONTENIDO } from "./is-blank";

const fijo = (n: number) => ({ min: n, max: n });

describe("el modo de la sección", () => {
  it("sin la key es «sin»: lo publicado se ve como hoy", () => {
    expect(modoIvaDe({})).toBe("sin");
    expect(modoIvaDe(null)).toBe("sin");
    expect(modoIvaDe({ iva: "" })).toBe("sin");
    expect(modoIvaDe({ iva: "cualquiera" })).toBe("sin");
  });
  it("lee los dos modos", () => {
    expect(modoIvaDe({ iva: "mas" })).toBe("mas");
    expect(modoIvaDe({ iva: " Incluido " })).toBe("incluido");
  });
  it("es presentación: una sección donde solo se eligió el IVA sigue en blanco", () => {
    expect(NO_CONTENIDO.has("iva")).toBe(true);
    expect(isBlank({ moneda: "CRC", iva: "mas", lineas: [] })).toBe(true);
  });
});

describe("el desglose", () => {
  it("la tasa es el 13% de Costa Rica", () => {
    expect(TASA_IVA_CR).toBe(13);
  });

  it("+ IVA: suma el 13% sobre lo escrito", () => {
    const d = desgloseIva(fijo(10_000), "mas")!;
    expect(d.base).toEqual(fijo(10_000));
    expect(d.iva).toEqual(fijo(1_300));
    expect(d.total).toEqual(fijo(11_300));
  });

  it("IVA incluido: desglosa la base y el total no cambia", () => {
    const d = desgloseIva(fijo(11_300), "incluido")!;
    expect(d.base).toEqual(fijo(10_000));
    expect(d.iva).toEqual(fijo(1_300));
    expect(d.total).toEqual(fijo(11_300));
  });

  it("redondea a 2 decimales y base + IVA da el total al centavo", () => {
    for (const n of [1, 99.99, 1234.57, 333.33, 7_167, 1_500_000, 0.05]) {
      for (const modo of ["mas", "incluido"] as const) {
        const d = desgloseIva(fijo(n), modo)!;
        expect(aCentavos(d.base.min + d.iva.min)).toBe(d.total.min);
        for (const v of [d.base.min, d.iva.min, d.total.min]) expect(aCentavos(v)).toBe(v);
      }
    }
    // 1.234,57 + 13% = 160,4941 → 160,49
    expect(desgloseIva(fijo(1234.57), "mas")!.iva.min).toBe(160.49);
    // 1.000 con IVA incluido → base 884,96 (1000 / 1,13 = 884,955…) e IVA 115,04
    const inc = desgloseIva(fijo(1000), "incluido")!;
    expect(inc.base.min).toBe(884.96);
    expect(inc.iva.min).toBe(115.04);
  });

  it("un rango se desglosa por los dos extremos", () => {
    const d = desgloseIva({ min: 5_600, max: 6_650 }, "mas")!;
    expect(d.iva).toEqual({ min: 728, max: 864.5 });
    expect(d.total).toEqual({ min: 6_328, max: 7_514.5 });
  });

  it("sin modo o sin monto no hay desglose", () => {
    expect(desgloseIva(fijo(100), "sin")).toBeNull();
    expect(desgloseIva(null, "mas")).toBeNull();
  });
});

describe("qué cierre lleva el desglose", () => {
  it("un solo grupo: su subtotal, que es el total", () => {
    const g = gruposDeInversion({ moneda: "USD", lineas: [{ concepto: "Implementación", monto: "$12,000" }] });
    const c = ivaDelCierre(g, "mas");
    expect(c.lineas?.total).toEqual(fijo(13_560));
    expect(c.granTotal).toBeNull();
    expect(c.unico).toBeNull();
    expect(c.moneda).toBe("USD");
  });

  it("dos grupos sin recurrencia: el gran total, no los subtotales", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ concepto: "Implementación", monto: "$10,000" }],
      licencias: [{ concepto: "Setup", monto: "$2,000", recurrencia: "unica" }],
    });
    const c = ivaDelCierre(g, "incluido");
    expect(c.granTotal?.total).toEqual(fijo(12_000));
    expect(c.granTotal?.base).toEqual(fijo(10_619.47));
    expect(c.lineas).toBeNull();
    expect(c.licencias).toBeNull();
  });

  it("con recurrentes: el pago único y el de cada mes, por separado", () => {
    const g = gruposDeInversion({
      moneda: "CRC",
      lineas: [{ concepto: "Implementación", monto: "₡1.500.000" }],
      licencias: [{ concepto: "Sales Hub", monto: "₡100.000" }], // licencias: mensual por defecto
    });
    const c = ivaDelCierre(g, "mas");
    expect(c.unico?.total).toEqual(fijo(1_695_000));
    expect(c.recurrente?.iva).toEqual(fijo(13_000));
    expect(c.moneda).toBe("CRC");
  });

  it("nunca suma colones con dólares: con monedas contradichas no hay total ni desglose", () => {
    const g = gruposDeInversion({
      lineas: [{ concepto: "A", monto: "₡1.500.000" }, { concepto: "B", monto: "USD 7,500" }],
    });
    const c = ivaDelCierre(g, "mas");
    expect([c.lineas, c.licencias, c.granTotal, c.unico, c.recurrente]).toEqual([null, null, null, null, null]);
  });

  it("con el modo «sin» no devuelve nada", () => {
    const g = gruposDeInversion({ moneda: "USD", lineas: [{ concepto: "A", monto: "$100" }] });
    expect(ivaDelCierre(g, "sin").lineas).toBeNull();
  });
});
