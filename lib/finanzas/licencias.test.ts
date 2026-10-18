/**
 * lib/finanzas/licencias.test.ts — las licencias revendidas por contrato (2026-10-17).
 *
 * Correr: `npx vitest run lib/finanzas/licencias.test.ts --project unit`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  costoMensual,
  egresosDeLicencias,
  MODO_LICENCIAS_POR_DEFECTO,
  parteDeServicio,
  parteDeServicioDe,
  problemasDeLicencia,
  resumenDeLicencias,
  rigeEn,
  type DatosDeLicencia,
  type LicenciaDeContrato,
} from "./licencias";

const KOLBI = "cmv665y0n0000f4ijbo262y3q";

const lic = (p: Partial<LicenciaDeContrato>): LicenciaDeContrato => ({
  id: "l1",
  cuentaId: KOLBI,
  cuentaNombre: "kölbi",
  moneda: "USD",
  montoContrato: 161_700,
  montoServicio: 26_700,
  proveedor: "HubSpot",
  costoMonto: null,
  costoMoneda: null,
  costoCadaMeses: null,
  desde: null,
  hasta: null,
  fuente: "Anexo 1.0",
  notas: null,
  ...p,
});

describe("la parte de servicio de un contrato", () => {
  it("kölbi, como los anexos: cada factura de US$13.475 trae US$2.225 de servicio y cada una de ₡11.541.250, ₡4.000.000", () => {
    const usd = lic({});
    const crc = lic({ id: "l2", moneda: "CRC", montoContrato: 138_495_000, montoServicio: 48_000_000 });
    expect(Math.round(13_475 * parteDeServicio([usd, crc], KOLBI, "USD", "2026-09"))).toBe(2_225);
    expect(Math.round(11_541_250 * parteDeServicio([usd, crc], KOLBI, "CRC", "2026-09"))).toBe(4_000_000);
  });

  it("una cuenta sin contrato con licencias cuenta todo como servicio", () => {
    expect(parteDeServicio([lic({})], "otra", "USD", "2026-09")).toBe(1);
    expect(parteDeServicio([lic({})], KOLBI, "CRC", "2026-09")).toBe(1);
  });

  it("fuera de su vigencia no aplica", () => {
    const l = lic({ desde: "2026-03-01", hasta: "2026-12-31" });
    expect(rigeEn(l, "2026-02")).toBe(false);
    expect(rigeEn(l, "2026-03")).toBe(true);
    expect(rigeEn(l, "2026-12")).toBe(true);
    expect(parteDeServicio([l], KOLBI, "USD", "2027-01")).toBe(1);
  });

  it("nunca sale de 0 a 1", () => {
    expect(parteDeServicioDe({ montoContrato: 0, montoServicio: 5 })).toBe(1);
    expect(parteDeServicioDe({ montoContrato: 100, montoServicio: 150 })).toBe(1);
    expect(parteDeServicioDe({ montoContrato: 100, montoServicio: 0 })).toBe(0);
  });
});

describe("el costo de la licencia, como gasto (con INGRESO_Y_COSTO)", () => {
  it("un pago trimestral se reparte en tres meses", () => {
    expect(costoMensual({ costoMonto: 70_000, costoCadaMeses: 3 })).toBe(23_333.33);
    expect(costoMensual({ costoMonto: null, costoCadaMeses: 3 })).toBeNull();
  });

  it("da una línea por mes de vigencia y ninguna sin costo cargado", () => {
    const con = lic({ costoMonto: 6000, costoMoneda: "USD", costoCadaMeses: 3, desde: "2026-10-01" });
    const sin = lic({ id: "l2", moneda: "CRC" });
    const e = egresosDeLicencias([con, sin], ["2026-09", "2026-10", "2026-11"]);
    expect(e).toEqual([
      { periodo: "2026-10", concepto: "Licencias HubSpot · kölbi", conceptoClave: "licencia-l1", monto: 2000, moneda: "USD" },
      { periodo: "2026-11", concepto: "Licencias HubSpot · kölbi", conceptoClave: "licencia-l1", monto: 2000, moneda: "USD" },
    ]);
  });

  it("si dos contratos rigen el mismo mes para la misma cuenta y moneda, el costo lo pone el primero (no se cuenta dos veces)", () => {
    const propuesta = lic({ id: "propuesta:bc1", costoMonto: 1200, costoMoneda: "USD", costoCadaMeses: 12, desde: "2026-10-01", hasta: "2027-09-30" });
    const aMano = lic({ costoMonto: 6000, costoMoneda: "USD", costoCadaMeses: 3, desde: "2026-08-01" });
    const e = egresosDeLicencias([propuesta, aMano], ["2026-09", "2026-10"]);
    expect(e.map((x) => [x.periodo, x.conceptoClave, x.monto])).toEqual([
      ["2026-10", "licencia-propuesta:bc1", 100],
      ["2026-09", "licencia-l1", 2000],
    ]);
  });

  it("el resumen dice el porcentaje de servicio con un decimal", () => {
    expect(resumenDeLicencias([lic({})])[0]!.pctServicio).toBe(16.5);
  });
});

describe("lo que se puede guardar", () => {
  const base: DatosDeLicencia = {
    cuentaId: KOLBI, moneda: "USD", montoContrato: 100, montoServicio: 20, proveedor: "HubSpot", costoMonto: null, costoMoneda: null,
    costoCadaMeses: null, desde: null, hasta: null, fuente: "Anexo", notas: null,
  };
  it("un contrato bien cargado no tiene problemas", () => expect(problemasDeLicencia(base)).toEqual([]));
  it("el servicio no puede pasar del contrato, el costo va completo y la fuente es obligatoria", () => {
    expect(problemasDeLicencia({ ...base, montoServicio: 200 })).toHaveLength(1);
    expect(problemasDeLicencia({ ...base, costoMonto: 50 })).toEqual(["El costo va completo: cuánto, en qué moneda y cada cuántos meses."]);
    expect(problemasDeLicencia({ ...base, fuente: "  " })).toHaveLength(1);
    // Un texto que no es número llega como NaN desde el formulario: se dice, no se guarda un null.
    expect(problemasDeLicencia({ ...base, montoServicio: Number.NaN })).toEqual(["La parte de servicio no es un número."]);
    expect(problemasDeLicencia({ ...base, desde: "2026-12-01", hasta: "2026-01-01" })).toHaveLength(1);
  });
});

describe("lo que no cambia el día del deploy", () => {
  it("el modo por defecto es contar solo el servicio, como estaba con kölbi", () => {
    expect(MODO_LICENCIAS_POR_DEFECTO).toBe("SOLO_SERVICIO");
  });

  it("el SQL siembra los dos contratos de kölbi con los números de sus anexos", () => {
    const sql = readFileSync(join(__dirname, "..", "..", "scripts", "sql", "2026-10-17-ficha-f-libro-financiero.sql"), "utf8");
    expect(sql).toMatch(new RegExp(`'licencia-kolbi-usd', '${KOLBI}', 'USD', 161700, 26700`));
    expect(sql).toMatch(new RegExp(`'licencia-kolbi-crc', '${KOLBI}', 'CRC', 138495000, 48000000`));
    expect(sql).toMatch(/ON CONFLICT \("id"\) DO NOTHING/);
  });
});
