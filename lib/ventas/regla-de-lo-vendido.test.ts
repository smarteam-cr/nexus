/**
 * lib/ventas/regla-de-lo-vendido.test.ts — una sola regla de lo vendido (2026-11-13).
 *
 * Revisión del 13 de noviembre: el punto de equilibrio sumaba los ganados de todos los pipelines, y «Ventas ganadas sin
 * cobro», el bono de las metas de gerencia y lo vendido de las propuestas miraban tres pipelines fijos. Esta prueba
 * vigila que cada lector de lo vendido use la regla de lib/ventas/regla-de-lo-vendido.ts y que ninguno vuelva a filtrar
 * por la lista de pipelines.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { VENTA_QUE_CUENTA, cuentaComoVendida } from "./regla-de-lo-vendido";

const raiz = process.cwd();
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Los que leen lo vendido. Uno nuevo se suma acá. */
const LECTORES = [
  "lib/cobranza/queries.ts",
  "lib/cobranza/seguimiento-server.ts",
  "lib/cobranza/odoo/facturacion-por-cliente.ts",
  "lib/finanzas/metas-de-gerencia-server.ts",
  "lib/finanzas/lo-vendido-server.ts",
  "lib/ventas/metas.ts",
  "lib/finanzas/modelo-comisiones/cargar.ts",
  "lib/para-ti/fuentes/cobranza.ts",
];

describe("la regla", () => {
  it("ganada y no excluida, de cualquier pipeline", () => {
    expect(VENTA_QUE_CUENTA).toEqual({ estado: "GANADA", excluida: false });
    expect(cuentaComoVendida({ estado: "GANADA", excluida: false })).toBe(true);
    expect(cuentaComoVendida({ estado: "GANADA", excluida: true })).toBe(false);
    expect(cuentaComoVendida({ estado: "PERDIDA", excluida: false })).toBe(false);
  });
});

describe("cada lector de lo vendido usa la regla única", () => {
  for (const rel of LECTORES) {
    it(`${rel}: usa la regla y no filtra por la lista de pipelines`, () => {
      const src = sinComentarios(fs.readFileSync(path.join(raiz, rel), "utf8"));
      expect(src).toMatch(/from "(@\/lib\/ventas|\.)\/regla-de-lo-vendido"/);
      // Ningún `where` propio de «no excluida»: la regla entra esparcida (VENTA_QUE_CUENTA o VENTA_NO_EXCLUIDA).
      expect(src).not.toMatch(/excluida:\s*false/);
      expect(src).not.toMatch(/PIPELINES_VENTA_PROPIA/);
      expect(src).not.toMatch(/pipelinesQueCuentan\s*:/);
    });
  }

  it("la lista de ventas sin cobro no filtra por pipeline", () => {
    const src = sinComentarios(fs.readFileSync(path.join(raiz, "lib/ventas/ventas-sin-cobro.ts"), "utf8"));
    expect(src).not.toMatch(/pipelinesQueCuentan/);
  });
});
