import { describe, expect, it } from "vitest";
import { deResponsable, ventasSinCobro, type CobroParaRespaldo, type VentaParaRevisar } from "./ventas-sin-cobro";
import { PIPELINES_VENTA_PROPIA } from "./pipelines";

const PIPE = PIPELINES_VENTA_PROPIA[0];
const HOY = "2026-11-13";

const venta = (id: string, p: Partial<VentaParaRevisar> = {}): VentaParaRevisar => ({
  id,
  hubspotDealId: `deal-${id}`,
  nombre: `Venta ${id}`,
  fechaCierre: "2026-09-01",
  monto: 5000,
  moneda: "USD",
  montoConvertidoHubspot: null,
  pipelineId: PIPE,
  clientId: `c-${id}`,
  clienteNombre: `Cliente ${id}`,
  excluida: false,
  responsableCobroEmail: null,
  ...p,
});

const cobro = (clientId: string, p: Partial<CobroParaRespaldo> = {}): CobroParaRespaldo => ({
  clientId,
  estado: "POR_COBRAR",
  periodo: "2026-09",
  fechaProgramada: "2026-09-15",
  fechaEmision: "2026-09-15",
  fechaCobro: null,
  monto: 5000,
  moneda: "USD",
  ...p,
});

const medir = (ventas: VentaParaRevisar[], cobros: CobroParaRespaldo[] = []) =>
  ventasSinCobro({ anio: 2026, hoyISO: HOY, monedaPresentacion: "USD", tasas: [], pipelinesQueCuentan: [...PIPELINES_VENTA_PROPIA], ventas, cobros });

describe("los negocios ganados sin cobro (punto 11, 2026-11-13)", () => {
  it("una venta sin nada cargado es pendiente de quien cobra por defecto", () => {
    const [v] = medir([venta("a")]);
    expect(v).toMatchObject({ id: "a", clase: "SIN_COBRANZA", descubierto: 5000, responsable: "mzamora@smarteamcr.com", reasignada: false });
  });

  it("sale sola de la lista cuando lo facturado del cliente la cubre", () => {
    expect(medir([venta("a")], [cobro("c-a")])).toEqual([]);
  });

  it("⭐ las cuotas cargadas sin facturar también la cubren: está en cobranza, la persigue la cola", () => {
    expect(medir([venta("a")], [cobro("c-a", { estado: "PROGRAMADO", fechaEmision: null, periodo: "2026-12", fechaProgramada: "2026-12-15" })])).toEqual([]);
  });

  it("cargado de menos: queda lo que falta, como PARCIAL", () => {
    const [v] = medir([venta("a")], [cobro("c-a", { monto: 1500 })]);
    expect(v).toMatchObject({ clase: "PARCIAL", descubierto: 3500 });
  });

  it("descartada con una razón, o de un pipeline que no cuenta, no es pendiente", () => {
    expect(medir([venta("a", { excluida: true }), venta("b", { pipelineId: "otro-pipeline" })])).toEqual([]);
  });

  it("solo el año de hoy: una venta del año pasado no entra", () => {
    expect(medir([venta("a", { fechaCierre: "2025-12-20" })])).toEqual([]);
  });

  it("la empresa que no está en Nexus también se persigue (SIN_CLIENTE)", () => {
    const [v] = medir([venta("a", { clientId: null, clienteNombre: null })]);
    expect(v.clase).toBe("SIN_CLIENTE");
  });

  it("reasignada: le toca a esa persona y a nadie más", () => {
    const xs = medir([venta("a", { responsableCobroEmail: "avanegas@smarteamcr.com" }), venta("b")]);
    expect(deResponsable(xs, "AVanegas@smarteamcr.com").map((v) => v.id)).toEqual(["a"]);
    expect(deResponsable(xs, "mzamora@smarteamcr.com").map((v) => v.id)).toEqual(["b"]);
    expect(xs.find((v) => v.id === "a")?.reasignada).toBe(true);
  });

  it("manda el monto convertido de HubSpot, como en el reporte", () => {
    const [v] = medir([venta("a", { monto: 3_000_000, moneda: "CRC", montoConvertidoHubspot: 6000 })]);
    expect(v.monto).toBe(6000);
  });
});
