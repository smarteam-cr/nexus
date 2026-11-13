/**
 * lib/finanzas/equilibrio-sin-salarios.test.ts — el punto de equilibrio para quien entra con «Caja y pagos» y no ve
 * salarios (revisión del 2026-11-13).
 *
 * Con un año sin tipo de cambio (2020), el reporte listaba cada costo sin convertir con su nombre y su monto: el salario
 * de cada persona. Para quien no ve salarios, nada de eso viaja: lo sin convertir va sumado por rubro, lo de planilla no
 * viaja, y los avisos van sin la lista de conceptos. Corre el motor de verdad con un año sin tasas.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { calcularEquilibrio, costosDelPiso, pisoVigente, type EgresoDeMes } from "./equilibrio";
import { sinSalariosPorPersona } from "./equilibrio-sin-salarios";
import { anioDelReportePermitido } from "@/lib/cobranza/schema";

const eg = (periodo: string, rubro: EgresoDeMes["rubro"], concepto: string, monto: number): EgresoDeMes => ({
  periodo,
  rubro,
  concepto,
  conceptoClave: concepto.toLowerCase(),
  monto,
  moneda: "CRC",
  calidad: "MEDIDO",
});

/** 2020: sin una sola tasa. Tres salarios con nombre, el aguinaldo de una persona y dos herramientas. */
function reporteDe2020() {
  const egresos = [
    eg("2020-03", "PLANILLA", "Salario Marco Pérez", 1_500_000),
    eg("2020-03", "PLANILLA", "Salario Ana Solís", 1_200_000),
    eg("2020-03", "PLANILLA", "Salario Luis Mora", 900_000),
    eg("2020-03", "RESERVA_AGUINALDO", "Aguinaldo Ana Solís", 100_000),
    eg("2020-12", "PLANILLA", "Aguinaldo Marco Pérez", 1_500_000),
    eg("2020-03", "HERRAMIENTA", "HubSpot", 300_000),
    eg("2020-03", "HERRAMIENTA", "Google Workspace", 50_000),
  ];
  const r = calcularEquilibrio(egresos, [], { anio: 2020, hoyISO: "2026-11-13", monedaPresentacion: "USD" });
  const piso = pisoVigente(
    costosDelPiso([
      { nombre: "Marco Pérez", categoria: "SALARIO", monto: 1_500_000, moneda: "CRC", frecuencia: "MENSUAL" },
      { nombre: "Ana Solís", categoria: "SALARIO", monto: 1_200_000, moneda: "CRC", frecuencia: "MENSUAL" },
      { nombre: "HubSpot", categoria: "HERRAMIENTA", monto: 300_000, moneda: "CRC", frecuencia: "MENSUAL" },
      { nombre: "Slack", categoria: "HERRAMIENTA", monto: 20_000, moneda: "CRC", frecuencia: "MENSUAL" },
    ]),
    { monedaPresentacion: "USD", tasa: null },
  );
  return { ...r, pisoVigente: piso };
}

const NOMBRES = ["Marco", "Ana", "Luis", "Pérez", "Solís", "Mora", "HubSpot", "Slack", "Google"];
const SALARIOS = [1_500_000, 1_200_000, 900_000, 100_000];

describe("sinSalariosPorPersona", () => {
  it("el reporte completo SÍ trae los salarios con nombre (lo que la guarda tiene que tapar)", () => {
    const json = JSON.stringify(reporteDe2020());
    expect(json).toContain("Marco Pérez");
    expect(json).toContain("1500000");
  });

  it("⭐ lo que viaja no trae ningún nombre de costo ni el monto de un salario", () => {
    const r = sinSalariosPorPersona(reporteDe2020());
    const json = JSON.stringify(r);
    for (const n of NOMBRES) expect(json, n).not.toContain(n);
    const montos = [...r.fx.montosNoConvertidos.map((m) => m.monto), ...r.pisoVigente!.noConvertidos.map((m) => m.monto)];
    for (const s of SALARIOS) expect(montos, String(s)).not.toContain(s);
  });

  it("lo que no es salario va sumado por rubro y moneda, con el nombre del rubro", () => {
    const r = sinSalariosPorPersona(reporteDe2020());
    expect(r.pisoVigente!.noConvertidos).toEqual([{ concepto: "Herramientas", moneda: "CRC", monto: 320_000, rubro: "HERRAMIENTA" }]);
    expect(r.fx.montosNoConvertidos).toEqual([{ periodo: "2020-03", moneda: "CRC", monto: 350_000, concepto: "Herramientas", rubro: "HERRAMIENTA" }]);
    expect(r.calidad.avisos.every((a) => a.conceptos.length === 0)).toBe(true);
  });

  it("no cambia ningún total: lo sin convertir ya está fuera", () => {
    const completo = reporteDe2020();
    const r = sinSalariosPorPersona(completo);
    expect(r.indicadores).toEqual(completo.indicadores);
    expect(r.meses).toEqual(completo.meses);
    expect(r.pisoVigente!.base).toBe(completo.pisoVigente.base);
  });
});

describe("el año que se puede pedir", () => {
  it("los dos anteriores al de hoy, el de hoy y el que viene; 2020 no", () => {
    expect(anioDelReportePermitido(2024, "2026-11-13")).toBe(true);
    expect(anioDelReportePermitido(2027, "2026-11-13")).toBe(true);
    expect(anioDelReportePermitido(2023, "2026-11-13")).toBe(false);
    expect(anioDelReportePermitido(2020, "2026-11-13")).toBe(false);
    expect(anioDelReportePermitido(2028, "2026-11-13")).toBe(false);
  });
});

describe("la ruta y la página lo aplican", () => {
  const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const leer = (rel: string) => sinComentarios(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

  it("la ruta: el año en rango y, sin la celda de planilla, el reporte sin salarios", () => {
    const src = leer("app/api/cobranza/costos/equilibrio/route.ts");
    expect(src).toMatch(/anioDelReportePermitido\(/);
    expect(src).toMatch(/section: "planilla", action: "read"/);
    expect(src).toMatch(/veSalarios \? reporte : sinSalariosPorPersona\(reporte\)/);
  });

  it("la página: lo mismo, y los botones de dirección solo para dirección", () => {
    const src = leer("app/(shell)/finanzas/equilibrio/page.tsx");
    expect(src).toMatch(/veSalarios \? completo : sinSalariosPorPersona\(completo\)/);
    expect(src).toMatch(/esDireccion=\{esDireccion\}/);
    expect(src).toMatch(/puedeEditar=\{esDireccion\}/);
  });
});
