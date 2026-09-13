/**
 * lib/cobranza/libro-alex-lectura.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/libro-alex-lectura.test.ts --project unit`.
 *
 * Los renglones copian la forma del libro real («Asientos Contables Mercury Bank & Odoo Oficial.xlsx»,
 * leído el 2026-09-12): mismas pestañas, mismos encabezados, los mismos montos. El último bloque arma un
 * .xlsx en memoria para probar lo que solo exceljs ve: el color y las celdas fusionadas.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { colorDeFila, leerHoja, leerLibro, type CeldaLibro, type FilaCrudaLibro, type HojaCruda } from "./libro-alex-lectura";
import { hojasDelXlsx } from "./libro-alex-xlsx";

const AMARILLO = "FFFFFF00";
const VERDE = "FF00FF00";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function renglon(fila: number, valores: unknown[], fillArgb: string | null = null, fusionadas: number[] = []): FilaCrudaLibro {
  const celdas: CeldaLibro[] = valores.map((valor, i) =>
    fusionadas.includes(i) ? { valor, fillArgb, fusionada: true } : { valor, fillArgb },
  );
  return { fila, celdas };
}

const ENCABEZADO_ODOO = (mes: string) => [
  "Número",
  `Nombre del contacto a mostrar en la factura ${mes}`,
  "Fecha de la factura",
  "Fecha de vencimiento",
  "Total en moneda firmado",
  "Importe pendiente firmado",
  "Moneda",
  "Estado del pago",
  "Consecutivo",
  "Mes",
  "Anotación",
];

const ODOO: HojaCruda = {
  nombre: "Asiento Contable por Mes ODOO",
  filas: [
    renglon(12, ENCABEZADO_ODOO("Febrero"), "FF4285F4"),
    renglon(13, ["FAC/2026/0204", "ACCCSA REVISTA & PUBLICACIONES SOCIEDAD ANONIMA", d("2026-02-02"), d("2026-02-02"), 2373, 0, "USD", "Pagado", "100001010000000202", "Febrero"]),
    renglon(
      14,
      ["FAC/2026/0206", "GLOBAL SUPPLY SOCIEDAD ANONIMA", d("2026-02-04"), d("2026-02-04"), 2109.71, 1050044.86, "USD", "Sin pagar", "100001010000000204", "Febrero", "Promesa de Pago esta semana tras presentación de prueba"],
      AMARILLO,
    ),
    renglon(15, [null, null]),
    renglon(114, ENCABEZADO_ODOO("Setiembre"), "FF4285F4"),
    renglon(116, ["FAC/2026/0336", "GRUPO ECOQUINTAS SOCIEDAD ANONIMA", d("2026-09-03"), d("2026-09-03"), 3593.4, 1623138.78, "USD", "Sin pagar", "100001010000000310", "Septiembre"], AMARILLO),
  ],
};

const OPERACION: HojaCruda = {
  nombre: "Asiento Contable - Operación Re",
  filas: [
    renglon(1, ["Nombre del Cliente a mostrar en la factura Enero", "Estado", "Monto ", "Moneda", "Número de Factura", "Fecha de Factura", "Fecha de la Factura Pagada", "Anotación"]),
    renglon(12, ["Visual Branding, S.A. de C.V", "Sin pagar", 1780, "USD", "INV-45", d("2026-09-02"), "nan"], VERDE),
    renglon(17, ["Total a Recaudar", "Total a Recaudar", { formula: "SUM(C2:C11)", result: 23293 }]),
  ],
};

const MERCURY: HojaCruda = {
  nombre: "Asientos Contables Mercury Bank",
  filas: [
    renglon(77, ["Nombre del cliente a mostrar en la factura Octubre", "Estado", "Monto ", "Moneda", "Número de Factura", "Fecha de Factura", "Fecha de la Factura Pagada", "Anotación"]),
    renglon(78, ["Real Shipping and Trade, SA DE CV", "Active", 1000, "USD", "INV-16", d("2026-10-01"), "nan"]),
  ],
};

const QBS: HojaCruda = {
  nombre: "Asiento contable de Recaudo QBs",
  filas: [
    renglon(1, ["Quickbooks", "Proyecto ", "Monto adeudado", "Monto Total", "Anotación "], "FF4285F4"),
    renglon(3, ["Sfera Legal ", "Implementación CRM", 3800, 3800, "Revisando en QBs aparecen pagas pero en la concialiaciones no se encuentran depositos"]),
    renglon(6, ["No Inscritos", "Proyecto", "Monto adeudado", "Monto", "Anotación"], "FF4285F4"),
    renglon(10, ["Bluesat", "Welcome Kit", { formula: "950*4", result: 3800 }, 5700, "A setiembre - Pero se mantiene en Octubre y Noviembre con cuotas de $950"]),
    /* exceljs repite el valor de la fusión en el renglón de abajo. */
    renglon(11, ["Bluesat", "SignNow", { formula: "950*4", result: 3800 }, 5700, "A setiembre"], null, [2, 3, 4]),
    renglon(14, ["Total  Adeudado ", null, 20933], "FFE0E0E0"),
    renglon(17, ["Planes de Pago"]),
    renglon(18, ["Kaizen Kapital", "Sitio Web", 2000, 18200, "Plan de Pagos"]),
    renglon(19, ["JCB", "Implementación", 7000, 7000, "Pago contra entrega"]),
  ],
};

const NO_INSCRITOS: HojaCruda = {
  nombre: "Asiento contable de Recaudo No",
  filas: [
    renglon(1, ["No Inscritos", "Proyecto", "Monto Pendiente de Pago", "Monto Total del Servicio", "Anotación"]),
    renglon(3, ["Areya", "Implementación Service Pro + Sales Ent", 0, 10900, "Facturación a Mes Vencido inicia en setiembre 15"]),
    renglon(8, ["Teamnet Web", "Web Propuesta", 1000, 4000, "Son 4 cobros e inician en Septiembre"]),
  ],
};

const COMPENDIO: HojaCruda = {
  nombre: "Compendio de Facturación Genera",
  filas: [
    renglon(1, ["Factura", "Cliente", "Origen", "Moneda", "Facturado", "Pagado", "Pendiente"]),
    renglon(80, ["FAC/2026/0300", "AMVAC DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", "Odoo - Principal", "USD", 2088.24, 0, 0]),
    renglon(168, ["TOTAL USD", "Sumatoria Dólares", null, "USD", 500112.68, 370848.82, 123434.98], AMARILLO),
  ],
};

const GENERALIDADES: HojaCruda = {
  nombre: "Generalidades",
  filas: [renglon(1, ["📊 1. Rendimiento de Cobranza en Dólares (USD)"], "FF073763"), renglon(3, ["Total Facturado (Real): $492,174.09"])],
};

describe("las pestañas de Odoo", () => {
  const filas = leerHoja(ODOO);

  it("una fila por factura, y el encabezado repetido por mes no es una factura", () => {
    expect(filas.map((f) => f.numero)).toEqual(["FAC/2026/0204", "FAC/2026/0206", "FAC/2026/0336"]);
    expect(filas.every((f) => f.seccion === "ODOO")).toBe(true);
  });

  it("⛔ usa «Total en moneda firmado»: el pendiente de Odoo viene en colones en una factura en dólares", () => {
    const gs = filas.find((f) => f.numero === "FAC/2026/0206");
    expect(gs).toMatchObject({ total: 2109.71, moneda: "USD", pendiente: null, estado: "SIN_PAGAR" });
  });

  it("el mes es el de Alex, con el año de la factura; la anotación y el color quedan", () => {
    expect(filas.find((f) => f.numero === "FAC/2026/0336")).toMatchObject({ periodo: "2026-09", color: "VENCIDA" });
    expect(filas.find((f) => f.numero === "FAC/2026/0206")?.anotacion).toMatch(/Promesa de Pago/);
  });
});

describe("las pestañas de Mercury", () => {
  it("«Operación Recaudo» dice «Enero» en el título de todo: manda la fecha de la factura", () => {
    const [f] = leerHoja(OPERACION);
    expect(f).toMatchObject({ numero: "INV-45", periodo: "2026-09", fechaPago: null, estado: "SIN_PAGAR", color: "EN_GRACIA" });
  });

  it("la fila de total del propio libro no es una factura", () => {
    expect(leerHoja(OPERACION)).toHaveLength(1);
  });

  it("«Active» es una factura con fecha futura, no un pago", () => {
    expect(leerHoja(MERCURY)[0]).toMatchObject({ numero: "INV-16", estado: "ACTIVA", periodo: "2026-10" });
  });

  it("⚠ el verde del libro es «en gracia», no «pagado»", () => {
    expect(colorDeFila(VERDE)).toBe("EN_GRACIA");
    expect(colorDeFila(AMARILLO)).toBe("VENCIDA");
    expect(colorDeFila("FFFFFFFF")).toBe("SIN_COLOR");
    expect(colorDeFila(null)).toBe("SIN_COLOR");
  });
});

describe("la pestaña de QuickBooks tiene dos secciones y un bloque sin encabezado", () => {
  const filas = leerHoja(QBS);

  it("Quickbooks, No Inscritos y Planes de Pago, cada fila en la suya", () => {
    expect(filas.map((f) => [f.cliente, f.seccion])).toEqual([
      ["Sfera Legal", "QUICKBOOKS"],
      ["Bluesat", "NO_INSCRITOS"],
      ["Kaizen Kapital", "PLAN_DE_PAGO"],
      ["JCB", "PLAN_DE_PAGO"],
    ]);
  });

  it("⚠ Bluesat ocupa dos renglones fusionados: es UNA fila con los dos servicios, no dos deudas", () => {
    const bluesat = filas.filter((f) => f.cliente === "Bluesat");
    expect(bluesat).toHaveLength(1);
    expect(bluesat[0]).toMatchObject({ proyecto: "Welcome Kit + SignNow", total: 5700, pendiente: 3800, moneda: "USD" });
  });

  it("sin número y en dólares, como las lista el Compendio", () => {
    expect(filas.every((f) => f.numero === null && f.moneda === "USD")).toBe(true);
  });
});

describe("el libro entero", () => {
  const libro = leerLibro([GENERALIDADES, MERCURY, OPERACION, NO_INSCRITOS, ODOO, QBS, COMPENDIO]);

  it("una pestaña sin encabezados conocidos se lista con cero filas", () => {
    expect(libro.hojas.find((h) => h.nombre === "Generalidades")).toEqual({ nombre: "Generalidades", filas: 0, secciones: [] });
  });

  it("el Compendio se lee con su origen, sin la fila de total", () => {
    const comp = libro.filas.filter((f) => f.seccion === "COMPENDIO");
    expect(comp).toHaveLength(1);
    expect(comp[0]).toMatchObject({ numero: "FAC/2026/0300", origen: "Odoo - Principal", total: 2088.24, pendiente: 0 });
  });

  it("No inscritos trae total y adeudado en la moneda de la fila", () => {
    expect(libro.filas.find((f) => f.cliente === "Teamnet Web")).toMatchObject({ seccion: "NO_INSCRITOS", total: 4000, pendiente: 1000 });
  });
});

describe("del .xlsx a celdas (exceljs)", () => {
  it("lee el color y marca la parte de abajo de una fusión", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Asiento contable de Recaudo QBs ");
    ws.addRow(["No Inscritos", "Proyecto", "Monto adeudado", "Monto", "Anotación"]);
    ws.addRow(["Bluesat", "Welcome Kit", 3800, 5700, "cuotas de $950"]);
    ws.addRow(["Bluesat", "SignNow"]);
    ws.mergeCells("C2:C3");
    ws.mergeCells("D2:D3");
    ws.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARILLO } };

    const hojas = await hojasDelXlsx(await wb.xlsx.writeBuffer());
    expect(hojas[0]?.nombre).toBe("Asiento contable de Recaudo QBs");
    const [, arriba, abajo] = hojas[0]?.filas ?? [];
    expect(arriba?.celdas[0]?.fillArgb).toBe(AMARILLO);
    expect(arriba?.celdas[3]?.fusionada).toBeUndefined();
    expect(abajo?.celdas[3]?.fusionada).toBe(true);

    const filas = leerLibro(hojas).filas;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ cliente: "Bluesat", proyecto: "Welcome Kit + SignNow", total: 5700, color: "VENCIDA" });
  });
});
