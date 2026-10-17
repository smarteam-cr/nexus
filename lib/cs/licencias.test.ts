/**
 * lib/cs/licencias.test.ts — las licencias de HubSpot y sus renovaciones (2026-10-02).
 *
 * El caso de kölbi es el real, medido en producción. Correr:
 * `npx vitest run lib/cs/licencias.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  avisoDeRenovacion,
  avisosDelCliente,
  combinarLicencias,
  fechaDeHubspot,
  licenciasDesdePartner,
  lineaDelAvisoDeLaFecha,
  severidadDelAviso,
  type LicenciaDeHub,
} from "./licencias";

const KOLBI = {
  hs_marketing_hub_edition: "enterprise",
  hs_marketing_hub_renewal_date: String(Date.parse("2027-02-27T00:00:00Z")),
  hs_marketing_hub_mrr: "6835.5",
  hs_sales_hub_edition: "professional",
  hs_sales_hub_renewal_date: "2027-02-27",
  hs_sales_hub_mrr: "6520",
  hs_service_hub_edition: "none",
  hs_managed_local_mrr_currency: "USD",
};

describe("lo que ya trae HubSpot", () => {
  it("caso kölbi: plan, renovación y monto mensual por hub", () => {
    const l = licenciasDesdePartner(KOLBI);
    expect(l.map((x) => x.hub)).toEqual(["marketing", "sales"]);
    expect(l[0]).toMatchObject({ plan: "Enterprise", renovacion: "2027-02-27", montoMensual: 6835.5, moneda: "USD", fuenteRenovacion: "hubspot" });
  });

  it("un hub «none» sin renovación ni monto no es una licencia", () => {
    expect(licenciasDesdePartner(KOLBI).some((x) => x.hub === "service")).toBe(false);
  });

  it("la fecha llega como epoch en texto o como ISO", () => {
    expect(fechaDeHubspot("1803945600000")).toBe("2027-03-02");
    expect(fechaDeHubspot("2027-02-27")).toBe("2027-02-27");
    expect(fechaDeHubspot("")).toBeNull();
  });
});

describe("lo cargado a mano", () => {
  it("la fecha de compra siempre es manual, y HubSpot sigue mandando en lo que trae", () => {
    const l = combinarLicencias(licenciasDesdePartner(KOLBI), [
      { hub: "sales", plan: "Starter", fechaCompra: "2025-09-30", fechaRenovacion: "2026-12-01", montoMensual: 1, moneda: "CRC", nota: null },
    ]);
    const sales = l.find((x) => x.hub === "sales")!;
    expect(sales).toMatchObject({ plan: "Professional", renovacion: "2027-02-27", montoMensual: 6520, fechaCompra: "2025-09-30", fuenteRenovacion: "hubspot" });
  });

  it("sin datos de HubSpot (cuenta no administrada), lo manual alcanza", () => {
    const [l] = combinarLicencias([], [{ hub: "marketing", plan: "Professional", fechaCompra: null, fechaRenovacion: "2026-11-15", montoMensual: 800, moneda: "USD", nota: null }]);
    expect(l).toMatchObject({ hub: "marketing", renovacion: "2026-11-15", fuenteRenovacion: "manual", montoMensual: 800 });
  });
});

describe("el aviso con anticipación", () => {
  it("avisa a 90, 60 y 30 días, cada vez más fuerte", () => {
    expect(avisoDeRenovacion("2027-02-27", "2026-12-10")).toEqual({ dias: 79, umbral: 90 });
    expect(avisoDeRenovacion("2027-02-27", "2027-01-10")).toEqual({ dias: 48, umbral: 60 });
    expect(avisoDeRenovacion("2027-02-27", "2027-02-10")).toEqual({ dias: 17, umbral: 30 });
    expect(severidadDelAviso(30)).toBe("HIGH");
  });

  it("más de 90 días o ya vencida: no avisa", () => {
    expect(avisoDeRenovacion("2027-02-27", "2026-10-02")).toBeNull();
    expect(avisoDeRenovacion("2026-09-30", "2026-10-02")).toBeNull();
  });

  it("el job de avisos usa el umbral en la llave: cada umbral avisa una vez, sin duplicar", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/cs/avisos-de-renovacion.ts"), "utf8");
    expect(src).toContain("llaveDelAviso(cliente.id, aviso.renovacion, aviso.umbral)");
  });
});

describe("⭐ un aviso por fecha de renovación, con todos sus hubs (2026-10-16)", () => {
  const l = (hub: LicenciaDeHub["hub"], renovacion: string | null, monto: number | null = null, moneda: string | null = "USD"): LicenciaDeHub => ({
    hub,
    plan: "Professional",
    renovacion,
    montoMensual: monto,
    moneda,
    fechaCompra: null,
    nota: null,
    fuenteRenovacion: "hubspot",
  });
  const hoy = "2026-10-16";
  it("los hubs que renuevan el mismo día van juntos; otro día, otro aviso; el más cercano primero", () => {
    const avisos = avisosDelCliente([l("service", "2026-12-20"), l("sales", "2026-11-30"), l("marketing", "2026-11-30"), l("content", "2027-06-01")], hoy);
    expect(avisos.map((a) => [a.renovacion, a.licencias.map((x) => x.hub)])).toEqual([
      ["2026-11-30", ["sales", "marketing"]],
      ["2026-12-20", ["service"]],
    ]);
  });
  it("la línea con un hub es la de siempre; con varios, los nombra y suma el monto si es la misma moneda", () => {
    const [uno] = avisosDelCliente([l("sales", "2026-11-30", 500)], hoy);
    expect(lineaDelAvisoDeLaFecha(uno)).toMatch(/^Sales Hub Professional renueva el 2026-11-30 \(en 45 días\) · 500 USD al mes$/);
    const [dos] = avisosDelCliente([l("sales", "2026-11-30", 500), l("service", "2026-11-30", 250)], hoy);
    expect(lineaDelAvisoDeLaFecha(dos)).toMatch(/renuevan el 2026-11-30 \(en 45 días\) · 750 USD al mes$/);
    const [mezcla] = avisosDelCliente([l("sales", "2026-11-30", 500), l("service", "2026-11-30", 250, "CRC")], hoy);
    expect(lineaDelAvisoDeLaFecha(mezcla), "colones y dólares no se suman").not.toMatch(/al mes/);
  });
});
