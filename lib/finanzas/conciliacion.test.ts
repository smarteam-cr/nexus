/**
 * lib/finanzas/conciliacion.test.ts — lo que no cuadra con Odoo y Mercury en una sola lista (rediseño 2026-10-03).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import type { DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import { agruparDiferencias, esDecision, filasPorQuien, filtrarDiferencias, fuenteDeLinea, grupoDeLaLinea, juntarDiferencias } from "./conciliacion";

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

/** Una fila con sus documentos. */
const fila = (clave: string, docs: string[], o: Record<string, unknown> = {}) => ({
  texto: clave,
  fila: { clave, documentos: docs.map((d) => ({ clave: d, huella: "h" })), huella: "h" },
  ...o,
});
const conFilas = (codigo: string, items: ReturnType<typeof fila>[], plata: Array<{ clave: string; moneda: string; monto: number }> = [], donde = "NEXUS") =>
  ({ codigo, donde, severidad: "MEDIA", items, plata, montos: [], marcadas: [], volvieron: [] }) as unknown as DiferenciaOdoo;

describe("agruparDiferencias (rediseño 2026-10-22)", () => {
  it("cada línea va a su grupo; una que no está en la tabla cae por su donde", () => {
    expect(grupoDeLaLinea({ codigo: "ODOO-POR-COBRAR-PAGADA", donde: "ODOO" })).toBe("COBRADO");
    expect(grupoDeLaLinea({ codigo: "ODOO-IN-PAYMENT", donde: "ODOO" })).toBe("HISTORIA");
    expect(grupoDeLaLinea({ codigo: "NUEVA", donde: "PREGUNTANDO" })).toBe("PREGUNTAR");
    expect(grupoDeLaLinea({ codigo: "NUEVA", donde: "NEXUS" })).toBe("PAPELES");
  });

  it("las filas que nombran los documentos de una pagada se van con ella (Fundauna: 4 filas, 1 cosa)", () => {
    const g = agruparDiferencias([
      conFilas("ODOO-POR-COBRAR-PAGADA", [fila("c:a", ["c:a", "c:b", "f:359"])], [{ clave: "f:359", moneda: "CRC", monto: 2302601 }]),
      conFilas("ODOO-NUMERO-SIN-DOCUMENTO", [fila("c:a", ["c:a"]), fila("c:z", ["c:z"])], [
        { clave: "c:a", moneda: "CRC", monto: 1037001 },
        { clave: "c:z", moneda: "USD", monto: 50 },
      ]),
    ]);
    const cobrado = g.find((x) => x.grupo === "COBRADO")!;
    expect(cobrado.filas).toBe(2);
    expect(cobrado.lineas.map((l) => l.codigo)).toEqual(["ODOO-POR-COBRAR-PAGADA", "ODOO-NUMERO-SIN-DOCUMENTO"]);
    const papeles = g.find((x) => x.grupo === "PAPELES")!;
    expect(papeles.filas).toBe(1);
    expect(papeles.lineas[0]!.plata.map((p) => p.clave)).toEqual(["c:z"]);
    expect(papeles.plata).toEqual([{ moneda: "USD", monto: 50 }]);
  });

  it("una factura de antes de la cuenta va a la historia", () => {
    const g = agruparDiferencias([conFilas("ODOO-FACTURA-SIN-COBRO", [fila("f:1", ["f:1"], { antesDeLaCuenta: true }), fila("f:2", ["f:2"])])]);
    expect(g.find((x) => x.grupo === "HISTORIA")!.filas).toBe(1);
    expect(g.find((x) => x.grupo === "NO_VE")!.filas).toBe(1);
  });

  it("siempre devuelve los cinco grupos, en orden", () => {
    expect(agruparDiferencias([]).map((x) => x.grupo)).toEqual(["COBRADO", "NO_VE", "PREGUNTAR", "PAPELES", "HISTORIA"]);
  });
});
