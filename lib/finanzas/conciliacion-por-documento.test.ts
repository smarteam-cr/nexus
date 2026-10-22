/**
 * lib/finanzas/conciliacion-por-documento.test.ts — «Lo que no cuadra» contado por documento (2026-10-22).
 */
import { describe, it, expect } from "vitest";
import type { DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import { DE_LA_LINEA, porDocumento, textoCorto } from "./conciliacion-por-documento";

const fila = (clave: string, docs: string[], texto = clave) => ({
  texto,
  fila: { clave, documentos: docs.map((d) => ({ clave: d, huella: "h" })), huella: "h" },
});
const linea = (codigo: string, items: ReturnType<typeof fila>[], o: Partial<DiferenciaOdoo> = {}) =>
  ({ codigo, titulo: `${items.length} cosas raras`, queHacer: "Hacer algo", donde: "NEXUS", items, montos: [], plata: [], marcadas: [], volvieron: [], ...o }) as unknown as DiferenciaOdoo;

describe("porDocumento", () => {
  it("cuenta facturas, no filas: un cliente de Odoo con dos facturas son dos facturas", () => {
    const r = porDocumento([linea("ODOO-SIN-CUENTA", [fila("cliente:1|USD", ["f:a", "f:b"]), fila("cliente:2|USD", ["f:c"])])]);
    expect(r.secciones.map((s) => [s.seccion, s.documentos])).toEqual([["ODOO", 3]]);
    expect(r.secciones[0]!.razones[0]).toMatchObject({ documentos: 3, razon: "El cliente de Odoo no está en ninguna cuenta de Nexus" });
  });

  it("cada documento cuenta una vez en su sección, aunque esté en dos razones", () => {
    const r = porDocumento([linea("ODOO-MONTO", [fila("f:a", ["f:a", "c:1"])]), linea("ODOO-FACTURA-SIN-COBRO", [fila("f:a", ["f:a"]), fila("f:b", ["f:b"])])]);
    const odoo = r.secciones.find((s) => s.seccion === "ODOO")!;
    expect(odoo.documentos).toBe(2);
    expect(odoo.razones.map((x) => x.documentos)).toEqual([2, 1]);
  });

  it("las cuotas van a Nexus, los depósitos aparte, y lo que cambia lo cobrado primero", () => {
    const r = porDocumento([
      linea("MERCURY-COBRO-SIN-FACTURA", [fila("c:1", ["c:1"]), fila("c:2", ["c:2"])]),
      linea("MERCURY-ENTRADA-SIN-FACTURA", [fila("mov:1", ["mov:1"])]),
      linea("MERCURY-FACTURA-SIN-COBRO", [fila("fm:1", ["fm:1"]), fila("fm:2", ["fm:2"])]),
      linea("MERCURY-PAGADA-SIN-COBRAR", [fila("fm:9", ["fm:9", "c:9"])]),
    ]);
    expect(r.secciones.map((s) => [s.seccion, s.documentos])).toEqual([
      ["MERCURY", 3],
      ["NEXUS", 2],
      ["DEPOSITOS", 1],
    ]);
    expect(r.secciones[0]!.razones[0]!.codigo).toBe("MERCURY-PAGADA-SIN-COBRAR");
    expect(r.cambianLoCobrado).toBe(1);
    expect(r.porResolver).toBe(6);
  });

  it("lo de contabilidad no suma a lo que hay que resolver, y las preguntas cuentan sus filas", () => {
    const r = porDocumento([
      linea("ODOO-IN-PAYMENT", [fila("cliente:1|USD", ["f:a", "f:b"])]),
      linea("VENTA-CONTADA-DOS-VECES", [fila("venta:1", ["venta:1", "c:1"]), fila("venta:2", ["venta:2"])]),
    ]);
    expect(r.secciones.map((s) => [s.seccion, s.documentos])).toEqual([
      ["PREGUNTAS", 2],
      ["CONTABILIDAD", 2],
    ]);
    expect(r.porResolver).toBe(2);
  });

  it("una línea que no está en la tabla va por sus documentos, con su título sin el número", () => {
    const r = porDocumento([linea("ODOO-NUEVA", [fila("f:a", ["f:a"])], { titulo: "1 factura con algo nuevo" })]);
    expect(r.secciones[0]).toMatchObject({ seccion: "ODOO", documentos: 1 });
    expect(r.secciones[0]!.razones[0]!.razon).toBe("factura con algo nuevo");
  });

  it("una moneda corregida cuenta el caso, no sus cuatro documentos", () => {
    const r = porDocumento([linea("ODOO-MONEDA-CORREGIDA", [fila("cliente:1|1", ["f:mala", "f:reverso", "f:buena1", "f:buena2"])])]);
    expect(r.secciones[0]!.razones[0]!.documentos).toBe(1);
  });

  it("las líneas sin filas pendientes no aparecen", () => {
    expect(porDocumento([linea("ODOO-MONTO", [])]).secciones).toEqual([]);
  });

  it("muestra hasta 8 documentos y dice cuántos más hay", () => {
    const muchas = Array.from({ length: 11 }, (_, i) => fila(`f:${i}`, [`f:${i}`]));
    const r = porDocumento([linea("ODOO-FACTURA-SIN-COBRO", muchas)]).secciones[0]!.razones[0]!;
    expect(r.ejemplos).toHaveLength(8);
    expect(r.mas).toBe(3);
  });

  it("textoCorto: hasta el segundo «·», sin la forma jurídica", () => {
    expect(textoCorto("INV-60 · Javier Noel López Pravia · US$289 · pagada · del 2026-10-15")).toBe("INV-60 · Javier Noel López Pravia");
    expect(textoCorto("PUBLIMARK SOCIEDAD ANONIMA — US$13.475")).toBe("PUBLIMARK — US$13.475");
  });

  it("toda razón de la tabla dice qué hacer", () => {
    for (const [codigo, d] of Object.entries(DE_LA_LINEA)) expect(d.queHacer.length, codigo).toBeGreaterThan(3);
  });
});
