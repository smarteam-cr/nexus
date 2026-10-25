/**
 * lib/clients/tam-v1.test.ts — el TAM estimado v1 y lo que ya paga cada empresa (U27).
 */
import { describe, expect, it } from "vitest";
import { calcularTamV1, citaDelTam, edicionDelTam, hubsDelTam, PRECIOS_DE_LISTA, type EntradaDelTam } from "./tam-v1";
import { loQueLeFalta, loQueYaPaga } from "./lo-que-ya-paga";

const base: EntradaDelTam = {
  empleados: 310,
  estructura: "casa_matriz",
  filiales: 2,
  industriaSmarteam: "Retail Especializado",
  aQuienVende: "personas",
  perfilCierre: "mixta",
  perfilDespues: "recompra",
  baseConsentimiento: "10k_50k",
  calificaInsider: "casi_lista",
};

describe("calcularTamV1", () => {
  it("sin empleados no hay TAM: es lo mínimo para saber la edición", () => {
    const c = calcularTamV1({ ...base, empleados: null });
    expect(c.total).toBeNull();
    expect(c.porQue).toMatch(/empleados/);
  });

  it("suma las licencias a precio de lista por año, y dice cómo", () => {
    const c = calcularTamV1(base);
    expect(c.version).toBe("v1");
    expect(c.edicion).toBe("professional");
    expect(c.hubs).toEqual(["marketing", "sales", "service", "content"]);
    // Marketing Pro: 890 + 10 bloques de 5.000 contactos (50.000 − 2.000 incluidos) × 250 = 3.390 al mes.
    expect(c.lineas[0]).toMatchObject({ concepto: "Marketing Hub Professional", montoAnual: 3390 * 12 });
    // Sales: 5 % de 310 = 16 asientos × 90; Service: 3 % = 9 × 90; Content Pro 450.
    expect(c.lineas[1]).toMatchObject({ concepto: "Sales Hub Professional", montoAnual: 16 * 90 * 12, detalle: "16 asientos" });
    expect(c.lineas[2]).toMatchObject({ concepto: "Service Hub Professional", montoAnual: 9 * 90 * 12 });
    expect(c.lineas[3]).toMatchObject({ concepto: "Content Hub Professional", montoAnual: 450 * 12 });
    expect(c.total).toBe((3390 + 16 * 90 + 9 * 90 + 450) * 12);
    expect(c.preciosAl).toBe(PRECIOS_DE_LISTA.fecha);
    expect(c.porQue).toBe("Casa matriz con 2 filiales de 310 empleados que vende a personas con venta mixta: le corresponde la edición Professional.");
  });

  it("los servicios no suman: ninguna línea habla de implementación ni de horas", () => {
    expect(calcularTamV1(base).lineas.map((l) => l.concepto).join(" ")).not.toMatch(/implementaci|servicio de|hora/i);
  });

  it("Insider suma solo si califica «lista», con el precio provisional que dice que está por validar", () => {
    expect(calcularTamV1(base).lineas.at(-1)).toEqual({ concepto: "Insider", montoAnual: null, detalle: "no suma: califica «casi lista»" });
    const lista = calcularTamV1({ ...base, calificaInsider: "lista" });
    expect(lista.lineas.at(-1)).toEqual({ concepto: "Insider", montoAnual: 42_000, detalle: "califica · precio por validar" });
    expect(lista.total).toBe(calcularTamV1(base).total! + 42_000);
  });

  it("sin perfil supone Marketing, Sales y Service y lo anota", () => {
    const h = hubsDelTam({ ...base, aQuienVende: null, perfilCierre: null, perfilDespues: null, industriaSmarteam: "Software" });
    expect(h.hubs).toEqual(["marketing", "sales", "service"]);
    expect(h.supuestos).toHaveLength(2);
  });

  it("quien vende a personas y cierra sin vendedor no necesita Sales Hub", () => {
    expect(hubsDelTam({ ...base, perfilCierre: "transaccional" }).hubs).not.toContain("sales");
  });

  it("una sola compra no suma Service Hub", () => {
    expect(hubsDelTam({ ...base, perfilDespues: "única" }).hubs).not.toContain("service");
  });

  it("la edición sale del tamaño y de las filiales", () => {
    expect(edicionDelTam({ empleados: 8, estructura: null, filiales: null })).toBe("starter");
    expect(edicionDelTam({ empleados: 120, estructura: "independiente", filiales: null })).toBe("professional");
    expect(edicionDelTam({ empleados: 120, estructura: "casa_matriz", filiales: 3 })).toBe("enterprise");
    expect(edicionDelTam({ empleados: 1500, estructura: null, filiales: null })).toBe("enterprise");
  });

  it("los asientos tienen piso y techo", () => {
    const chica = calcularTamV1({ ...base, empleados: 20, estructura: "independiente" });
    expect(chica.lineas.find((l) => l.concepto.startsWith("Sales"))?.detalle).toBe("2 asientos");
    const enorme = calcularTamV1({ ...base, empleados: 900_000 });
    expect(enorme.lineas.find((l) => l.concepto.startsWith("Sales"))?.detalle).toBe("200 asientos");
    expect(enorme.total!).toBeLessThan(100_000_000);
  });

  it("la cita para la historia dice la versión y que los servicios no suman", () => {
    expect(citaDelTam(calcularTamV1(base))).toMatch(/^TAM estimado v1: .*Los servicios no suman\.$/);
  });
});

describe("loQueYaPaga", () => {
  it("de una cuenta gestionada: el plan y el MRR de cada hub", () => {
    const y = loQueYaPaga({
      properties: { hs_marketing_hub_edition: "professional", hs_marketing_hub_mrr: "973.00", hs_sales_hub_edition: "enterprise", hs_sales_hub_mrr: "1820.55", hs_service_hub_edition: "none" },
      fetchedAt: "2026-10-23T10:00:00Z",
    });
    expect(y).toMatchObject({ fuente: "gestionada", totalMensual: 2793.55, copiadaAt: "2026-10-23" });
    expect(y!.hubs.map((h) => `${h.hub}:${h.plan}`)).toEqual(["marketing:Professional", "sales:Enterprise"]);
  });

  it("de una no gestionada: lo vendido, con «cms» como Content Hub y sin los asientos", () => {
    const y = loQueYaPaga({ properties: { hs_sold_product_lines: "cms;marketing_hub;core_seats", hs_sold_mrr: "1701.300000" } });
    expect(y).toMatchObject({ fuente: "vendida", totalMensual: 1701.3 });
    expect(y!.hubs.map((h) => h.hub)).toEqual(["content", "marketing"]);
  });

  it("suma lo cargado a mano en Licencias, con la misma regla que esa pestaña", () => {
    const manual = { hub: "sales", plan: "Professional", fechaCompra: null, fechaRenovacion: null, montoMensual: 450, moneda: "USD", nota: null };
    const soloAMano = loQueYaPaga(null, [manual]);
    expect(soloAMano).toMatchObject({ fuente: "a_mano", totalMensual: 450 });
    const conPartner = loQueYaPaga({ properties: { hs_marketing_hub_edition: "professional", hs_marketing_hub_mrr: "900" } }, [manual]);
    expect(conPartner!.hubs.map((h) => h.hub)).toEqual(["marketing", "sales"]);
    // Y lo que le falta ya no ofrece lo que paga a mano.
    expect(loQueLeFalta({ hubs: ["sales"], edicion: "professional" }, soloAMano)).toEqual([]);
  });

  it("no mezcla monedas: cada hub dice la suya y sin una sola moneda no hay total", () => {
    const enColones = { hub: "sales", plan: "Professional", fechaCompra: null, fechaRenovacion: null, montoMensual: 450000, moneda: "CRC", nota: null };
    const y = loQueYaPaga({ properties: { hs_marketing_hub_edition: "professional", hs_marketing_hub_mrr: "900" } }, [enColones]);
    expect(y!.hubs.map((h) => `${h.hub}:${h.moneda}:${h.origen}`)).toEqual(["marketing:USD:partner", "sales:CRC:a_mano"]);
    expect(y!.totalMensual).toBeNull();
    expect(y!.moneda).toBeNull();
  });

  it("lo cargado a mano no tapa lo vendido: los hubs vendidos siguen contando", () => {
    const service = { hub: "service", plan: "Starter", fechaCompra: null, fechaRenovacion: null, montoMensual: null, moneda: null, nota: null };
    const y = loQueYaPaga({ properties: { hs_sold_product_lines: "marketing_hub;sales_hub" } }, [service]);
    expect(y!.hubs.map((h) => `${h.hub}:${h.origen}`)).toEqual(["service:a_mano", "marketing:vendida", "sales:vendida"]);
    expect(loQueLeFalta({ hubs: ["marketing", "sales"], edicion: "starter" }, y)).toEqual([]);
  });

  it("la fecha de la copia es el día de Costa Rica (una copia de las 7 p. m. no es del día siguiente)", () => {
    const y = loQueYaPaga({ properties: { hs_sold_product_lines: "marketing_hub" }, fetchedAt: "2026-10-25T01:30:00Z" });
    expect(y!.copiadaAt).toBe("2026-10-24");
  });

  it("sin registro, o con un registro vacío, no dice nada", () => {
    expect(loQueYaPaga(null)).toBeNull();
    expect(loQueYaPaga({ properties: { hs_sold_product_lines: "", hs_sold_mrr: "0.00" } })).toBeNull();
  });
});

describe("loQueLeFalta", () => {
  it("lo que el TAM le asigna y no tiene, o tiene más chico", () => {
    const ya = loQueYaPaga({ properties: { hs_marketing_hub_edition: "professional", hs_marketing_hub_mrr: "900", hs_sales_hub_edition: "starter", hs_sales_hub_mrr: "90" } });
    const falta = loQueLeFalta({ hubs: ["marketing", "sales", "service"], edicion: "professional" }, ya);
    expect(falta).toEqual([
      { hub: "sales", nombre: "Sales Hub Professional", motivo: "Tiene Starter; le corresponde Professional" },
      { hub: "service", nombre: "Service Hub", motivo: "No lo tiene" },
    ]);
  });

  it("sin nada pagado le falta todo; sin TAM no se dice nada", () => {
    expect(loQueLeFalta({ hubs: ["marketing"], edicion: "starter" }, null)).toHaveLength(1);
    expect(loQueLeFalta({ hubs: [], edicion: null }, null)).toEqual([]);
  });
});
