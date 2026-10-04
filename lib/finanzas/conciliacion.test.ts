/**
 * lib/finanzas/conciliacion.test.ts — lo que no cuadra con Odoo y Mercury en una sola lista (rediseño 2026-10-03).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import type { DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import { esDecision, filasPorQuien, filtrarDiferencias, fuenteDeLinea, juntarDiferencias } from "./conciliacion";

/** Una línea mínima: solo lo que la lista juntas mira. */
const linea = (codigo: string, p: { severidad?: string; donde?: string; filas?: number; monto?: number | null } = {}) =>
  ({
    codigo,
    severidad: p.severidad ?? "ALTA",
    donde: p.donde ?? "NEXUS",
    items: Array.from({ length: p.filas ?? 1 }, () => ({})),
    montoEnJuego: p.monto ?? null,
  }) as unknown as DiferenciaOdoo;

describe("fuenteDeLinea y esDecision", () => {
  it("las de Mercury se reconocen por el prefijo; el resto son de Odoo", () => {
    expect(fuenteDeLinea("MERCURY-SIN-CUENTA")).toBe("mercury");
    expect(fuenteDeLinea("ODOO-SIN-CUENTA")).toBe("odoo");
    expect(fuenteDeLinea("VENTA-CONTADA-DOS-VECES")).toBe("odoo");
  });
  it("una línea que falta un dato de negocio es una decisión", () => {
    expect(esDecision(linea("X", { donde: "PREGUNTANDO" }))).toBe(true);
    expect(esDecision(linea("X", { donde: "NEXUS" }))).toBe(false);
    expect(esDecision(linea("X", { donde: "ODOO" }))).toBe(false);
  });
});

describe("juntarDiferencias", () => {
  it("intercala por gravedad y plata, y deja al final las que no tienen filas pendientes", () => {
    const r = juntarDiferencias(
      [linea("ODOO-A", { severidad: "MEDIA", monto: 900 }), linea("ODOO-VACIA", { filas: 0, monto: 99999 })],
      [linea("MERCURY-B", { severidad: "ALTA", monto: 100 }), linea("MERCURY-C", { severidad: "MEDIA", monto: 5000 })],
    );
    expect(r.map((l) => l.codigo)).toEqual(["MERCURY-B", "MERCURY-C", "ODOO-A", "ODOO-VACIA"]);
  });
});

describe("filtrarDiferencias y filasPorQuien", () => {
  const todas = [
    linea("ODOO-A", { filas: 3 }),
    linea("ODOO-COBRADO-SIN-PAGAR", { donde: "PREGUNTANDO", filas: 2 }),
    linea("MERCURY-B", { filas: 4 }),
    linea("MERCURY-ENTRADA-SIN-FACTURA", { donde: "PREGUNTANDO", filas: 9 }),
  ];
  it("por origen", () => {
    expect(filtrarDiferencias(todas, { fuente: "mercury", quien: "todas" }).map((l) => l.codigo)).toEqual([
      "MERCURY-B",
      "MERCURY-ENTRADA-SIN-FACTURA",
    ]);
  });
  it("por quién: lo que se arregla registrando y lo que es decisión", () => {
    expect(filtrarDiferencias(todas, { fuente: "todas", quien: "mias" }).map((l) => l.codigo)).toEqual(["ODOO-A", "MERCURY-B"]);
    expect(filtrarDiferencias(todas, { fuente: "odoo", quien: "decisiones" }).map((l) => l.codigo)).toEqual([
      "ODOO-COBRADO-SIN-PAGAR",
    ]);
  });
  it("cuenta FILAS de cada lado, no líneas", () => {
    expect(filasPorQuien(todas)).toEqual({ mias: 7, decisiones: 11 });
  });
});
