/**
 * lib/landing/money.test.ts
 *
 * Los casos con ⚠ documentan un error que estaba VIVO en producción: el número que salía
 * en pantalla —y que el prospecto compara contra el contrato— no era el que la tabla decía.
 */
import { describe, it, expect } from "vitest";
import {
  parseMonto,
  sumaLineas,
  sumaRangos,
  formatMonto,
  formatRango,
  monedaDeTexto,
  montoParaLectura,
  aplicarDescuento,
  parseCantidad,
  parseDescuento,
} from "./money";

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

describe("monedaDeTexto: qué moneda declara el propio texto", () => {
  it("símbolo inequívoco y código ISO escrito", () => {
    expect(monedaDeTexto("₡1.500.000")).toBe("CRC");
    expect(monedaDeTexto("USD $7.500")).toBe("USD");
    expect(monedaDeTexto("COP 30.000.000")).toBe("COP");
  });

  /* El `$` no delata nada: lo usan USD, MXN, COP, CLP… Si lo tratara como USD, la moneda
     "deducida" de una propuesta mexicana sería dólares. */
  it("`$` solo NO declara nada", () => {
    expect(monedaDeTexto("$5600")).toBeNull();
    expect(monedaDeTexto("12000")).toBeNull();
    expect(monedaDeTexto("")).toBeNull();
  });
});

describe("montoParaLectura: qué se normaliza y qué sale verbatim", () => {
  /* La columna de una factura tiene que ser verificable de un vistazo: si el renglón dice
     "12000" y el pie dice "$34,250", el lector no puede comprobar la suma que le cobran. El
     valor mostrado ES el que se sumó ⇒ formatearlo no cambia el número, lo hace auditable. */
  it("lo que parsea se formatea con la moneda de la sección", () => {
    expect(montoParaLectura("$5600", "USD")).toEqual({ texto: "$5,600", libre: false });
    expect(montoParaLectura("12000", "USD")).toEqual({ texto: "$12,000", libre: false });
    expect(montoParaLectura("4500", "")).toEqual({ texto: "$4,500", libre: false });
    expect(montoParaLectura("1.500.000", "CRC")).toEqual({ texto: "₡1,500,000", libre: false });
    expect(montoParaLectura("5600-6650", "USD")).toEqual({ texto: "$5,600–6,650", libre: false });
  });

  it("lo que NO parsea sale PALABRA POR PALABRA y marcado libre", () => {
    expect(montoParaLectura("Included", "USD")).toEqual({ texto: "Included", libre: true });
    expect(montoParaLectura("A definir en propuesta formal")).toEqual({
      texto: "A definir en propuesta formal",
      libre: true,
    });
    expect(montoParaLectura("~$2,000/mes (precio de lista referencial)")).toEqual({
      texto: "~$2,000/mes (precio de lista referencial)",
      libre: true,
    });
  });

  /* ⚠ `~` y `+` son CALIFICADORES ("aprox.", "desde"). `parseMonto` los descarta para poder
     sumar; borrarlos en pantalla convertiría una estimación en un precio firme. */
  it("`~` y `+` no se borran", () => {
    expect(montoParaLectura("~2000", "USD").texto).toBe("~2000");
    expect(montoParaLectura("12000+", "USD").texto).toBe("12000+");
  });

  /* ⚠ `formatMonto("")` cae al `$` histórico: una línea en colones saldría en dólares. */
  it("símbolo ajeno sin moneda de sección: NO se reescribe a `$`", () => {
    expect(montoParaLectura("₡500", "").texto).toBe("₡500");
  });

  it("vacío es vacío (la celda pinta el guion, no un monto)", () => {
    expect(montoParaLectura("", "USD")).toEqual({ texto: "", libre: false });
    expect(montoParaLectura(null)).toEqual({ texto: "", libre: false });
  });
});

describe("cantidad y descuento por línea", () => {
  it.each([
    ["3", 3],
    ["1,5", 1.5],
    ["12", 12],
  ])("parseCantidad(%s) = %s", (txt, esperado) => {
    expect(parseCantidad(txt)).toBe(esperado);
  });

  /* Todo lo que no sea un número limpio cae a null y el llamador usa 1: multiplicar por un
     número adivinado de "12 usuarios" es peor que no multiplicar. */
  it.each(["", "  ", "12 usuarios", "tres", "0", "-2", "abc"])("parseCantidad(%s) = null", (txt) => {
    expect(parseCantidad(txt)).toBeNull();
  });

  it("lee el porcentaje y el monto fijo", () => {
    expect(parseDescuento("15%")).toEqual({ tipo: "pct", valor: 15 });
    expect(parseDescuento("7,5 %")).toEqual({ tipo: "pct", valor: 7.5 });
    expect(parseDescuento("$200")).toEqual({ tipo: "monto", valor: 200 });
    expect(parseDescuento("1,200")).toEqual({ tipo: "monto", valor: 1200 });
  });

  it("sin descuento no hay descuento", () => {
    expect(parseDescuento("")).toBeNull();
    expect(parseDescuento(null)).toBeNull();
  });

  /* Un descuento ilegible NO se ignora: ensucia la línea entera (ver `montoDeLinea`). Que
     "120%" sea sucio no es purismo — un descuento que devuelve plata no existe, y sumar la
     línea en negativo daría un total que nadie firmó. */
  it.each(["120%", "el negociado", "a definir", "10-20%", "$1,000–2,000"])(
    "descuento sucio: %s",
    (txt) => {
      expect(parseDescuento(txt)).toBe("sucio");
    },
  );

  /* ⚠ EL DESCUENTO EN OTRA MONEDA (2026-08-21). El bug que esto cierra: `parseDescuento`
     llamaba a `parseMonto` SIN la moneda de la sección, así que la guarda anti-mezcla nunca
     corría para los descuentos. "₡5.000" en una propuesta en USD se leía como −$5,000: una
     línea de $1.000 quedaba en CERO, con el tag "−$5,000" al lado y sin el ⚠ "no suma"
     —nada la había marcado sucia—, y entraba al total valiendo 0. Smarteam factura en las dos
     monedas, así que el caso es de todos los días, no de laboratorio. */
  it("un descuento en OTRA moneda ensucia (no se resta como si fuera de la sección)", () => {
    expect(parseDescuento("₡5.000", "USD")).toBe("sucio");
    expect(parseDescuento("CRC 5000", "USD")).toBe("sucio");
    expect(parseDescuento("€200", "USD")).toBe("sucio");
    // En SU moneda sigue leyéndose igual que siempre.
    expect(parseDescuento("₡5.000", "CRC")).toEqual({ tipo: "monto", valor: 5000 });
    expect(parseDescuento("$200", "USD")).toEqual({ tipo: "monto", valor: 200 });
    // Sin símbolo no hay mezcla que detectar: es de la sección, sea cual sea.
    expect(parseDescuento("200", "CRC")).toEqual({ tipo: "monto", valor: 200 });
    // El porcentaje no tiene moneda: nunca se ensucia por esto.
    expect(parseDescuento("15%", "USD")).toEqual({ tipo: "pct", valor: 15 });
  });

  /* `$` NO delata contradicción, y eso es DELIBERADO: lo usan USD, MXN, COP, CLP y ARS (ver
     MONEDA_POR_SIMBOLO). Un "$200" en una sección en colones se lee como 200 colones, igual
     que se lee un MONTO escrito así. Se fija acá para que quede claro que es la regla y no un
     hueco del arreglo de arriba: el descuento hereda exactamente el criterio del monto, ni
     más estricto ni más laxo. */
  it("`$` no ensucia en otra moneda: es ambiguo a propósito, igual que en un monto", () => {
    expect(parseDescuento("$200", "CRC")).toEqual({ tipo: "monto", valor: 200 });
    expect(parseMonto("$200", "CRC")).toEqual({ min: 200, max: 200 });
  });

  it("aplicar: porcentaje, monto y piso en cero", () => {
    expect(aplicarDescuento(1000, { tipo: "pct", valor: 15 })).toBe(850);
    expect(aplicarDescuento(1000, { tipo: "monto", valor: 250 })).toBe(750);
    expect(aplicarDescuento(1000, null)).toBe(1000);
    // Un descuento mayor que el importe no genera un saldo a favor.
    expect(aplicarDescuento(100, { tipo: "monto", valor: 500 })).toBe(0);
    // Dos decimales: sin esto, 33,33% de 100 arrastra la basura del float al total.
    expect(aplicarDescuento(100, { tipo: "pct", valor: 33.33 })).toBe(66.67);
  });
});
