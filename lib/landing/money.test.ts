/**
 * lib/landing/money.test.ts
 *
 * Los casos con ⚠ documentan un error que estaba VIVO en producción: el número que salía
 * en pantalla —y que el prospecto compara contra el contrato— no era el que la tabla decía.
 */
import { describe, it, expect } from "vitest";
import { parseMonto, sumaLineas, sumaRangos, formatMonto, formatRango } from "./money";

const L = (...montos: string[]) => montos.map((monto) => ({ monto }));

describe("parseMonto: qué es un número y qué no", () => {
  it("fijos y rangos limpios", () => {
    expect(parseMonto("$1,800")).toEqual({ min: 1800, max: 1800 });
    expect(parseMonto("12000")).toEqual({ min: 12000, max: 12000 });
    expect(parseMonto("$5,600–6,650")).toEqual({ min: 5600, max: 6650 });
    expect(parseMonto("$5,600-6,650")).toEqual({ min: 5600, max: 6650 }); // guion normal
    expect(parseMonto("~$2,000")).toEqual({ min: 2000, max: 2000 });
    expect(parseMonto("$12,000+")).toEqual({ min: 12000, max: 12000 });
  });

  it("vacío es vacío: no suma y NO cuenta como pendiente", () => {
    expect(parseMonto("")).toBeNull();
    expect(parseMonto("   ")).toBeNull();
    expect(parseMonto(null)).toBeNull();
    expect(parseMonto("$")).toBeNull(); // el símbolo solo tampoco afirma nada
  });

  it("⚠ texto adentro del monto: hoy '$1,800 por 3 páginas' aportaba min = 3", () => {
    expect(parseMonto("$1,800 por 3 páginas")).toBe("sucio");
    expect(parseMonto("A definir en propuesta formal")).toBe("sucio");
    expect(parseMonto("To be defined in formal proposal")).toBe("sucio");
    expect(parseMonto("Included")).toBe("sucio");
    expect(parseMonto("~$2,000/mes (precio de lista referencial)")).toBe("sucio");
    expect(parseMonto("$7,400 (sin impuestos) · 3 pagos de $2,467")).toBe("sucio");
  });

  it("⚠ el IVA como porcentaje: hoy '13%' sumaba 13 al total", () => {
    expect(parseMonto("13%")).toBe("sucio");
  });

  it("⚠ separador de miles europeo: hoy '₡1.500.000' daba 1.5", () => {
    expect(parseMonto("₡1.500.000", "CRC")).toEqual({ min: 1500000, max: 1500000 });
    expect(parseMonto("$5.325", "USD")).toEqual({ min: 5325, max: 5325 });
    expect(parseMonto("USD $7.500", "USD")).toEqual({ min: 7500, max: 7500 });
  });

  it("decimales de verdad: solo 1-2 dígitos después del último separador", () => {
    expect(parseMonto("$1,800.50")).toEqual({ min: 1800.5, max: 1800.5 });
    expect(parseMonto("1,5")).toEqual({ min: 1.5, max: 1.5 });
    expect(parseMonto("1.800")).toEqual({ min: 1800, max: 1800 });
  });

  it("otra moneda que la de la sección queda fuera (CRC y USD no se mezclan)", () => {
    expect(parseMonto("₡50.000", "USD")).toBe("sucio");
    expect(parseMonto("€1.200", "USD")).toBe("sucio");
    expect(parseMonto("USD 7,500", "CRC")).toBe("sucio");
    // El `$` es ambiguo (USD, MXN, COP…): NO delata contradicción.
    expect(parseMonto("$7,500", "MXN")).toEqual({ min: 7500, max: 7500 });
    // Y el código que COINCIDE no molesta.
    expect(parseMonto("$5,325 USD", "USD")).toEqual({ min: 5325, max: 5325 });
  });
});

describe("sumaLineas", () => {
  it("suma fijos", () => {
    expect(sumaLineas(L("$1,800", "$2,200"))).toEqual({ total: { min: 4000, max: 4000 }, pendientes: 0 });
  });

  it("un rango y un fijo se suman como intervalos", () => {
    expect(sumaLineas(L("$5,600–6,650", "$1,000"))).toEqual({ total: { min: 6600, max: 7650 }, pendientes: 0 });
  });

  it("lo sucio se excluye del total Y se cuenta, para poder avisarlo", () => {
    expect(sumaLineas(L("$12,000", "A definir"))).toEqual({ total: { min: 12000, max: 12000 }, pendientes: 1 });
  });

  it("lo vacío no cuenta ni como monto ni como pendiente", () => {
    expect(sumaLineas(L("$12,000", "", "   "))).toEqual({ total: { min: 12000, max: 12000 }, pendientes: 0 });
  });

  it("sin ningún monto sumable no hay total (no se pinta nada)", () => {
    expect(sumaLineas(L("A definir", "Included"))).toEqual({ total: null, pendientes: 2 });
    expect(sumaLineas([])).toEqual({ total: null, pendientes: 0 });
    expect(sumaLineas(null)).toEqual({ total: null, pendientes: 0 });
  });

  /* La propuesta de Prodex que el cliente YA vio: el total tiene que quedar EXACTAMENTE
     igual tras el endurecimiento — lo único nuevo es el aviso por "Included". */
  it("golden: las líneas reales de la propuesta publicada dan el mismo total de siempre", () => {
    expect(sumaLineas(L("$5600", "$12150", "Included", "12000", "4500"), "USD")).toEqual({
      total: { min: 34250, max: 34250 },
      pendientes: 1,
    });
    expect(sumaLineas(L("250", "465", "1800", "280", "1100", "320"), "USD")).toEqual({
      total: { min: 4215, max: 4215 },
      pendientes: 0,
    });
  });
});

describe("sumaRangos: el gran total", () => {
  it("suma dos subtotales", () => {
    expect(sumaRangos({ min: 10, max: 20 }, { min: 1, max: 2 })).toEqual({ min: 11, max: 22 });
  });

  it("con un solo grupo NO hay gran total (no se inventa un parcial)", () => {
    expect(sumaRangos({ min: 10, max: 10 }, null)).toBeNull();
    expect(sumaRangos(null, null)).toBeNull();
  });
});

describe("formato", () => {
  it("⚠ respeta la moneda: hoy hardcodeaba '$' e ignoraba data.moneda", () => {
    expect(formatMonto(1800, "USD")).toBe("$1,800");
    expect(formatMonto(1500000, "CRC")).toBe("₡1,500,000");
    expect(formatMonto(1200, "EUR")).toBe("€1,200");
  });

  it("código desconocido nunca sale con '$'", () => {
    expect(formatMonto(1000, "XAF")).toBe("XAF 1,000");
  });

  it("sin moneda cae a '$' (comportamiento histórico de los documentos viejos)", () => {
    expect(formatMonto(1000, "")).toBe("$1,000");
    expect(formatMonto(1000, null)).toBe("$1,000");
  });

  it("un rango lleva el símbolo solo en el extremo bajo, como se hacía", () => {
    expect(formatRango({ min: 5600, max: 6650 }, "USD")).toBe("$5,600–6,650");
    expect(formatRango({ min: 4215, max: 4215 }, "USD")).toBe("$4,215");
  });
});
