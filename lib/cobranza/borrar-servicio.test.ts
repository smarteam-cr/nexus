import { describe, expect, it } from "vitest";
import { porQueNoSeBorraElServicio, type ServicioParaBorrar } from "./borrar-servicio";

const cobro = (estado: string, factura: { fechaEmision?: string; numeroFactura?: string } = {}) => ({
  estado,
  fechaEmision: factura.fechaEmision ?? null,
  numeroFactura: factura.numeroFactura ?? null,
});
const servicio = (cobros: ServicioParaBorrar["cobros"], extra: Partial<ServicioParaBorrar> = {}): ServicioParaBorrar => ({
  estado: "FINALIZADO",
  cobros,
  ...extra,
});

describe("cuándo se puede eliminar un servicio de Cobranza", () => {
  it("el finalizado sin cobros se elimina (los de Honda)", () => {
    expect(porQueNoSeBorraElServicio(servicio([]))).toBeNull();
  });

  it("un contrato vivo no se borra: primero se marca Finalizado", () => {
    expect(porQueNoSeBorraElServicio(servicio([], { estado: "ACTIVO" }))).toContain("márcalo Finalizado");
    expect(porQueNoSeBorraElServicio(servicio([], { estado: "PAUSADO" }))).toContain("márcalo Finalizado");
  });

  it("los cobros que nunca se facturaron no lo frenan", () => {
    expect(porQueNoSeBorraElServicio(servicio([cobro("PROGRAMADO"), cobro("POR_COBRAR"), cobro("SIN_DATO")]))).toBeNull();
  });

  it("un cobro cobrado es plata que entró: no se elimina", () => {
    expect(porQueNoSeBorraElServicio(servicio([cobro("PROGRAMADO"), cobro("COBRADO")]))).toContain("1 cobro ya cobrado");
    expect(porQueNoSeBorraElServicio(servicio([cobro("COBRADO"), cobro("COBRADO")]))).toContain("2 cobros ya cobrados");
  });

  it("una factura emitida lo frena, con la fecha o con el número, y no sugiere revertirla", () => {
    for (const c of [cobro("POR_COBRAR", { fechaEmision: "2026-10-01" }), cobro("POR_COBRAR", { numeroFactura: "FAC/2026/0349" })]) {
      const motivo = porQueNoSeBorraElServicio(servicio([c]));
      expect(motivo).toContain("quedaría suelta");
      expect(motivo).not.toContain("Revierte");
    }
  });

  it("lo que solo sabe el servidor también lo frena: empareje con Odoo y comisión", () => {
    expect(porQueNoSeBorraElServicio(servicio([cobro("POR_COBRAR")], { ligadoAlErp: true }))).toContain("quedaría suelta");
    expect(porQueNoSeBorraElServicio(servicio([], { conComision: true }))).toContain("Comisiones");
  });
});
