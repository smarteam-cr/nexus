/**
 * lib/finanzas/comisiones-historial.test.ts — leer la «Tabla de Comisiones» de un vendedor (2026-10-06).
 *
 * El caso real es la tabla de Andrés Pinzón 2026, que Elías pegó el 2026-10-06.
 */
import { describe, expect, it } from "vitest";
import { leerTablaDeComisiones, porcentajeDe, tipoDeVenta, type CeldaLeida } from "./comisiones-historial";

const ENC = ["Cliente", "Nacionalidad", "Fecha de Ingreso", "Tiempo de Contrato", "Tipo de Venta", "Monto del Contrato", "Comisión", "Monto de Comisión", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const fila = (...celdas: string[]): CeldaLeida[] => celdas.map((texto) => ({ texto }));
const meses = (m: Record<number, string>) => Array.from({ length: 12 }, (_, i) => m[i] ?? "");

const GRILLA: CeldaLeida[][] = [
  fila("Tabla de Comisiones I Andrés Pinzón I 2026"),
  fila(...ENC),
  fila(),
  fila("Construtecho", "Guatemala", "", "3 meses", "Servicio Smarteam ", "$6,840.00", "5%", "$342.00", ...meses({ 0: "$114.00", 1: "$114.00", 2: "$114.00" })),
  fila("Alta Hoteles", "", "", "4 meses", "Servicio Smarteam", "$2,200.00", "5%", "$110.00", ...meses({ 2: "?$27.50", 3: "?$27.50", 4: "?$27.50", 5: "$27.50" })),
  fila("Multiquímica", "República Dominicana", "30/6/2026", "4 meses", "Servicio Smarteam", "$13,600.00", "5%", "$680.00", ...meses({ 6: "$170.00", 7: "$170.00", 8: "$170.00", 9: "$170.00" })),
  fila("Multiquímica", "República Dominicana", "08-09-2026", "3 meses", "Servicio Smarteam", "$4,880.00", "5%", "$244.00", ...meses({ 9: "$81.33", 10: "$81.33", 11: "$81.33" })),
  // «Total Finco» es un CLIENTE: la primera versión lo confundió con la fila de totales y se perdían sus $55.
  fila("Total Finco", "Costa Rica", "16-09-2026", "1 mes", "Servicio Smarteam", "$1,100.00", "5%", "$55.00", ...meses({ 9: "$55.00" })),
  fila("Spectrum - Licencias", "Guatemala", "30/5/2026", "3 meses", "Collab", "$2,415.00", "10%", "$241.50", ...meses({ 5: "$80.50", 6: "$80.50", 7: "$80.50" })),
  fila("Spectrum - Implementación", "Guatemala", "30/5/2026", "3 meses", "Servicio Smarteam", "$7,000.00", "5%", "$350.00", ...meses({ 5: "$116.67", 6: "$0.00", 7: "$0.00" })),
  fila("Teamnet - Licencias SAS", "México", "29-09-2026", "3 meses", "Collab", "$1,296.00", "10%", "$129.60", ...meses({})),
  fila("", "", "", "", "", "", "", "$0.00"),
  fila("Total a Pagar", "", "", "", "", "", "", "", ...meses({ 0: "$114.00", 1: "$114.00", 2: "$141.50", 9: "$251.33" })),
];

const leer = (o: Partial<{ pagadasHasta: string | null; usarColores: boolean }> = {}) =>
  leerTablaDeComisiones(GRILLA, { anio: 2026, pagadasHasta: "2026-08", usarColores: false, ...o });

describe("leer la tabla de comisiones", () => {
  it("una venta por fila, una cuota por celda con monto; las celdas en 0 y las filas sin cuotas no entran", () => {
    const t = leer();
    expect(t.ventas.map((v) => v.cliente)).toEqual([
      "Construtecho",
      "Alta Hoteles",
      "Multiquímica",
      "Multiquímica",
      "Total Finco",
      "Spectrum - Licencias",
      "Spectrum - Implementación",
    ]);
    expect(t.ventas.find((v) => v.cliente === "Spectrum - Implementación")!.cuotas).toHaveLength(1);
    expect(t.avisos).toContain("Fila 11 (Teamnet - Licencias SAS): todavía no tiene ninguna cuota; no se importa.");
  });

  it("servicio o licencia, el % en puntos y la fecha de ingreso en cualquiera de los dos formatos del Excel", () => {
    const [construtecho, , multi1, multi2, , licencias] = leer().ventas;
    expect(construtecho).toMatchObject({ tipoVenta: "SERVICIO", porcentaje: 5, montoContrato: 6840, montoComision: 342, fechaIngreso: null });
    expect(licencias).toMatchObject({ tipoVenta: "LICENCIA", porcentaje: 10 });
    expect(multi1!.fechaIngreso).toBe("2026-06-30");
    expect(multi2!.fechaIngreso).toBe("2026-09-08");
  });

  it("dos ventas al mismo cliente son dos ventas: la fecha de ingreso las separa en la clave", () => {
    const [, , multi1, multi2] = leer().ventas;
    expect(multi1!.ventaClave).not.toBe(multi2!.ventaClave);
    expect(multi1!.ventaClave).toBe("multiquimica|2026-06-30|SERVICIO");
  });

  it("sin colores: hasta «pagadas hasta» PAGADA, después POR_CONFIRMAR, y una celda con «?» siempre POR_CONFIRMAR", () => {
    const alta = leer().ventas.find((v) => v.cliente === "Alta Hoteles")!;
    expect(alta.cuotas.map((c) => [c.periodo, c.estado])).toEqual([
      ["2026-03", "POR_CONFIRMAR"],
      ["2026-04", "POR_CONFIRMAR"],
      ["2026-05", "POR_CONFIRMAR"],
      ["2026-06", "PAGADA"],
    ]);
    const multi = leer().ventas[2]!;
    expect(multi.cuotas.map((c) => c.estado)).toEqual(["PAGADA", "PAGADA", "POR_CONFIRMAR", "POR_CONFIRMAR"]);
  });

  it("con colores: verde PAGADA, lo demás POR_CONFIRMAR", () => {
    const grilla = GRILLA.map((f, r) =>
      r === 3 ? f.map((c, i) => (i === 8 ? { ...c, color: "VERDE" as const } : i === 9 ? { ...c, color: "AMARILLO" as const } : c)) : f,
    );
    const t = leerTablaDeComisiones(grilla, { anio: 2026, pagadasHasta: null, usarColores: true });
    expect(t.ventas[0]!.cuotas.map((c) => c.estado)).toEqual(["PAGADA", "POR_CONFIRMAR", "POR_CONFIRMAR"]);
  });

  it("revisa lo que no cuadra sin frenar: meses que no suman la comisión y meses contra «Total a Pagar»", () => {
    const t = leer();
    expect(t.avisos).toContain("Fila 10 (Spectrum - Implementación): los meses suman 116.67 y la comisión dice 350.00.");
    // Octubre: 170 + 81,33 + 55 = 306,33; el «Total a Pagar» de la grilla dice 251,33.
    expect(t.avisos).toContain("Octubre: las cuotas suman 306.33 y «Total a Pagar» dice 251.33.");
    expect(t.avisos.some((a) => a.startsWith("Enero"))).toBe(false);
  });

  it("sin las columnas obligatorias, no adivina", () => {
    expect(() => leerTablaDeComisiones([fila("Cliente", "Enero")], { anio: 2026, pagadasHasta: null, usarColores: false })).toThrow(/Faltan columnas/);
    expect(() => leerTablaDeComisiones([fila("Nombre", "Monto")], { anio: 2026, pagadasHasta: null, usarColores: false })).toThrow(/encabezados/);
  });
});

describe("piezas", () => {
  it("tipo de venta y porcentaje", () => {
    expect(tipoDeVenta("Servicio Smarteam ")).toBe("SERVICIO");
    expect(tipoDeVenta("Collab")).toBe("LICENCIA");
    expect(tipoDeVenta("Otro")).toBeNull();
    expect(porcentajeDe("2.50%")).toBe(2.5);
    expect(porcentajeDe("0.05")).toBe(5);
    expect(porcentajeDe("10")).toBe(10);
  });
});
