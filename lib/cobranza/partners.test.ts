import { describe, it, expect } from "vitest";
import {
  bucketDeCadencia,
  bucketSiguiente,
  agruparPorCadencia,
  labelDeFrecuencia,
  FRECUENCIAS_PARTNER,
  FRECUENCIA_PARTNER_MAX,
} from "./partners";

describe("bucketDeCadencia — dónde cae un pago según la cadencia del aliado", () => {
  it("B1 · trimestral: los buckets son los trimestres del calendario", () => {
    expect(bucketDeCadencia("2026-01-10", 3).etiqueta).toBe("ene–mar 2026");
    expect(bucketDeCadencia("2026-03-31", 3).etiqueta).toBe("ene–mar 2026");
    expect(bucketDeCadencia("2026-04-01", 3).etiqueta).toBe("abr–jun 2026");
    expect(bucketDeCadencia("2026-12-31", 3).etiqueta).toBe("oct–dic 2026");
  });

  it("B2 · los dos pagos reales de HubSpot caen en trimestres distintos", () => {
    // feb-15 y may-15: el ritmo se ve porque son buckets contiguos.
    const a = bucketDeCadencia("2026-02-15", 3);
    const b = bucketDeCadencia("2026-05-15", 3);
    expect(a.clave).toBe("2026-B00");
    expect(b.clave).toBe("2026-B01");
    expect(bucketSiguiente(a, 3).clave).toBe(b.clave);
  });

  it("B3 · mensual usa el nombre completo del mes, no el abreviado", () => {
    expect(bucketDeCadencia("2026-07-30", 1).etiqueta).toBe("julio 2026");
  });

  it("B4 · anual colapsa a un solo bucket por año", () => {
    expect(bucketDeCadencia("2026-01-01", 12).etiqueta).toBe("2026");
    expect(bucketDeCadencia("2026-12-31", 12).clave).toBe("2026-B00");
  });

  it("B5 · semestral parte el año en dos", () => {
    expect(bucketDeCadencia("2026-06-30", 6).etiqueta).toBe("ene–jun 2026");
    expect(bucketDeCadencia("2026-07-01", 6).etiqueta).toBe("jul–dic 2026");
  });

  it("B6 · una cadencia que no divide a 12 deja el último bucket CORTO, y se ve", () => {
    // Con 5 meses: 1-5, 6-10, 11-12. El tercero dura dos meses y la etiqueta lo dice.
    expect(bucketDeCadencia("2026-11-20", 5).etiqueta).toBe("nov–dic 2026");
    expect(bucketDeCadencia("2026-10-20", 5).etiqueta).toBe("jun–oct 2026");
  });

  it("B7 · la clave ordena cronológicamente como string", () => {
    const claves = ["2026-03-01", "2025-11-01", "2026-08-01"]
      .map((f) => bucketDeCadencia(f, 3).clave)
      .sort();
    expect(claves).toEqual(["2025-B03", "2026-B00", "2026-B02"]);
  });
});

describe("bucketSiguiente — dónde cae el próximo, nunca cuánto", () => {
  it("S1 · avanza dentro del año", () => {
    expect(bucketSiguiente(bucketDeCadencia("2026-02-01", 3), 3).etiqueta).toBe("abr–jun 2026");
  });

  it("S2 · el último bucket del año salta al siguiente", () => {
    expect(bucketSiguiente(bucketDeCadencia("2026-11-01", 3), 3).clave).toBe("2027-B00");
  });

  it("S3 · anual siempre salta de año", () => {
    expect(bucketSiguiente(bucketDeCadencia("2026-05-01", 12), 12).etiqueta).toBe("2027");
  });

  it("S4 · mensual: diciembre → enero del año siguiente", () => {
    expect(bucketSiguiente(bucketDeCadencia("2026-12-01", 1), 1).etiqueta).toBe("enero 2027");
  });
});

describe("agruparPorCadencia", () => {
  const pagos = [
    { fecha: "2026-02-15", monto: 38756.61, moneda: "USD" },
    { fecha: "2026-05-15", monto: 45921.72, moneda: "USD" },
  ];

  it("A1 · los dos pagos de HubSpot dan dos buckets, el más nuevo arriba", () => {
    const r = agruparPorCadencia(pagos, 3);
    expect(r).toHaveLength(2);
    expect(r[0].etiqueta).toBe("abr–jun 2026");
    expect(r[0].total).toBe(45921.72);
    expect(r[1].total).toBe(38756.61);
  });

  it("A2 · dos pagos del MISMO bucket se suman y se cuentan", () => {
    const r = agruparPorCadencia(
      [
        { fecha: "2026-02-15", monto: 100, moneda: "USD" },
        { fecha: "2026-03-01", monto: 50, moneda: "USD" },
      ],
      3,
    );
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(150);
    expect(r[0].cuantos).toBe(2);
  });

  it("A3 · CRC y USD del mismo bucket son DOS líneas, jamás una convertida", () => {
    const r = agruparPorCadencia(
      [
        { fecha: "2026-02-15", monto: 100, moneda: "USD" },
        { fecha: "2026-02-20", monto: 50000, moneda: "CRC" },
      ],
      3,
    );
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.moneda).sort()).toEqual(["CRC", "USD"]);
  });

  it("A4 · sin pagos, sin buckets (no se inventa uno vacío)", () => {
    expect(agruparPorCadencia([], 3)).toEqual([]);
  });

  it("A5 · con cadencia mensual cada pago de un mes distinto es su propio bucket", () => {
    const r = agruparPorCadencia(pagos, 1);
    expect(r.map((x) => x.etiqueta)).toEqual(["mayo 2026", "febrero 2026"]);
  });
});

describe("labelDeFrecuencia", () => {
  it("L1 · las del catálogo tienen nombre", () => {
    expect(labelDeFrecuencia(3)).toBe("Trimestral");
    expect(labelDeFrecuencia(12)).toBe("Anual");
  });

  it("L2 · una fuera del catálogo se describe, no se rompe", () => {
    expect(labelDeFrecuencia(5)).toBe("Cada 5 meses");
  });

  it("L3 · el catálogo está dentro del rango que acepta la base (CHECK 1..24)", () => {
    for (const f of FRECUENCIAS_PARTNER) {
      expect(f.meses).toBeGreaterThanOrEqual(1);
      expect(f.meses).toBeLessThanOrEqual(FRECUENCIA_PARTNER_MAX);
    }
  });
});

describe("orden de los buckets — el bug que cazó la revisión adversarial", () => {
  it("B8 · con cadencia MENSUAL el historial sale del más nuevo al más viejo", () => {
    // La clave lleva el índice con 2 dígitos justamente por esto: con 1 dígito
    // "2026-B10" caía antes que "2026-B2" al ordenar como string, y octubre,
    // noviembre y diciembre aparecían en el medio de la lista.
    const r = agruparPorCadencia(
      [
        { fecha: "2026-09-05", monto: 10, moneda: "USD" },
        { fecha: "2026-10-05", monto: 20, moneda: "USD" },
        { fecha: "2026-11-05", monto: 30, moneda: "USD" },
        { fecha: "2026-12-05", monto: 40, moneda: "USD" },
      ],
      1,
    );
    expect(r.map((x) => x.etiqueta)).toEqual([
      "diciembre 2026",
      "noviembre 2026",
      "octubre 2026",
      "septiembre 2026",
    ]);
  });

  it("B9 · mezclar un mes de dos dígitos con uno de un dígito tampoco lo rompe", () => {
    const r = agruparPorCadencia(
      [
        { fecha: "2026-02-15", monto: 10, moneda: "USD" },
        { fecha: "2026-12-15", monto: 20, moneda: "USD" },
      ],
      1,
    );
    expect(r.map((x) => x.etiqueta)).toEqual(["diciembre 2026", "febrero 2026"]);
  });
});
