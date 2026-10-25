/**
 * lib/cs/partner-columnas.test.ts — lo que la copia de Partner pasa del crudo a columnas (U29).
 *
 * Correr: `npx vitest run lib/cs/partner-columnas.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { columnasDePartner, HISTORIAL_CONTINUO_DESDE, semanaIso, semanasConHueco } from "./partner-columnas";

describe("columnasDePartner", () => {
  it("lee lo vendido, las fechas, la comisión y el MRR por hub con los nombres de HubSpot", () => {
    const c = columnasDePartner({
      hs_is_managed: "true",
      hs_is_sold: "false",
      hs_sold_mrr: "23507.999990",
      hs_sold_product_lines: "service_hub;sales_hub",
      hs_sold_relationship_start_date: "2025-09-30T00:00:00Z",
      hs_relationship_end_date: "1792517519912",
      hs_projected_commission: "4701.599998",
      hs_projected_commission_currency_code: "USD",
      hs_projected_commission_calculated_at: "2026-09-04T10:08:15.019Z",
      hs_sales_hub_mrr: "977.66",
      hs_marketing_hub_mrr: "",
      hs_add_ons_mrr: "0",
    });
    expect(c).toMatchObject({
      isManaged: true,
      isSold: false,
      soldMrr: 23507.99999,
      soldProductLines: "service_hub;sales_hub",
      projectedCommission: 4701.599998,
      projectedCommissionCurrency: "USD",
      mrrByHub: { sales: 977.66, addOns: 0 },
      soldRelationshipEndAt: null,
    });
    expect(c.soldRelationshipStartAt?.toISOString()).toBe("2025-09-30T00:00:00.000Z");
    expect(c.relationshipEndAt?.getTime()).toBe(1792517519912);
    expect(c.projectedCommissionAt?.toISOString()).toBe("2026-09-04T10:08:15.019Z");
  });

  it("sin dato es null, nunca cero ni false", () => {
    const c = columnasDePartner({ hs_is_managed: "", hs_sold_mrr: "abc" });
    expect(c.isManaged).toBeNull();
    expect(c.soldMrr).toBeNull();
    expect(c.mrrByHub).toBeNull();
  });
});

describe("el historial semanal", () => {
  it("semanaIso: el 23 oct 2026 es la 43; el 1 ene 2027 cae en la 53 de 2026", () => {
    expect(semanaIso(new Date("2026-10-23T12:00:00Z"))).toBe("2026-W43");
    expect(semanaIso(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(semanaIso(HISTORIAL_CONTINUO_DESDE)).toBe("2026-W41");
  });

  it("semanasConHueco mira las semanas completas desde la 41; la en curso no cuenta", () => {
    const filas = new Map([["2026-W41", 161], ["2026-W42", 168], ["2026-W43", 168]]);
    // Sábado 24 oct: la 43 todavía está en curso.
    expect(semanasConHueco(filas, HISTORIAL_CONTINUO_DESDE, new Date("2026-10-24T18:00:00Z"), 84)).toEqual([]);
    // Martes 10 nov: faltan la 44 (sin filas) y la 45 está en curso.
    const conHueco = new Map([...filas, ["2026-W44", 10]]);
    expect(semanasConHueco(conHueco, HISTORIAL_CONTINUO_DESDE, new Date("2026-11-03T18:00:00Z"), 84)).toEqual(["2026-W44"]);
    expect(semanasConHueco(filas, HISTORIAL_CONTINUO_DESDE, new Date("2026-11-10T18:00:00Z"), 84)).toEqual(["2026-W44", "2026-W45"]);
  });
});
