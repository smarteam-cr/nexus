import { describe, expect, it } from "vitest";
import {
  leerPartner,
  licenciasSumadas,
  porcentajeDeTendencia,
  textoPlano,
  usoBajo,
  usoCayendo,
} from "./lectura-partner";

/** Un registro con la forma real del crudo (valores de la copia del 10 jul, anonimizados). */
const CRUDO = {
  hs_is_active: "true",
  hs_is_managed: "true",
  hs_is_sold: "true",
  hs_client_portal_purged: "false",
  hs_unified_usage_score: "31",
  hs_last_4_weeks_usage_score_trend: "-0.12",
  hs_platform_engagement_level: "medium",
  hs_has_marketing_hub: "true",
  hs_is_marketing_hub_activated: "true",
  hs_marketing_hub_edition: "professional",
  hs_marketing_hub_usage_score: "42",
  hs_marketing_hub_renewal_date: "2026-11-14",
  hs_marketing_hub_mrr: "1140.000000",
  hs_has_sales_hub: "true",
  hs_is_sales_hub_activated: "true",
  hs_sales_hub_edition: "professional",
  hs_sales_hub_usage_score: "28",
  hs_sales_hub_tools_to_activate: "Build Pipeline, Close Deals",
  hs_sales_seats_assigned: "12",
  hs_sales_seats_available: "3",
  hs_sales_seats_limit: "15",
  hs_sales_hub_renewal_date: "2026-11-14",
  hs_sales_hub_mrr: "1200.000000",
  hs_has_service_hub: "true",
  hs_is_service_hub_activated: "false",
  hs_service_hub_edition: "starter",
  hs_service_hub_tools_to_activate: "Scale Support",
  hs_service_seats_assigned: "2",
  hs_service_seats_available: "3",
  hs_service_seats_limit: "5",
  hs_has_operations_hub: "false",
  hs_operations_hub_edition: "none",
  hs_has_cms_hub: "true",
  hs_content_hub_edition: "starter",
  hs_content_hub_mrr: "15",
  hs_core_seats_assigned: "18",
  hs_core_seats_available: "2",
  hs_core_seats_limit: "20",
  hs_marketing_contacts_usage: "6100",
  hs_marketing_contacts_limit: "10000",
  hs_monthly_email_sends_usage: "",
  hs_monthly_email_sends_limit: "100000",
  hs_credits_usage: "3950",
  hs_included_hubspot_credits_monthly_limit: "5000",
  hs_additional_hubspot_credits_monthly_limit: "0",
  hs_credits_overage_setting: "DISABLED",
  hs_next_hubspot_credit_reset_date: "2026-10-10",
  hs_total_subscription_mrr: "2455.000000",
  hs_managed_mrr: "2455.00",
  hs_managed_local_mrr_currency: "USD",
  hs_renewal_mrr_change: "-355.500000",
  hs_next_renewal_date: "1794614400000",
  hs_cancellation_products: "",
  hs_managed_relationship_estimated_expiration_date: "2026-10-18T00:00:00Z",
  hs_last_active_partner_employee_active_at: "1755576000000",
  hs_number_of_managing_partners: "1",
  hs_revenue_signals: "Customer Agent;Predicted Cross-Sell",
  hs_revenue_signal_explanation: "<p>This company shows <b>similar usage</b>:</p><ul><li>AI usage: 50%+</li></ul>",
  hs_all_apps: "Gmail, WhatsApp Business, Zapier",
  hs_relationship_start_date: "2022-03-14T00:00:00Z",
  hs_country: "Costa Rica",
  hs_sold_tier_points: "186",
  hs_managed_tier_points: "62.00",
  hs_market_name: "growth_market",
  hs_market_multiplier: "2.0000",
  hs_tiering_properties_updated_at: "2025-11-26T07:22:19.774Z",
  hs_projected_commission: "420.000000",
};

describe("leerPartner", () => {
  const l = leerPartner(CRUDO)!;

  it("sin crudo no inventa una lectura", () => {
    expect(leerPartner(null)).toBeNull();
    expect(leerPartner("x")).toBeNull();
  });

  it("lee el uso, la tendencia y el nivel", () => {
    expect(l.uso).toBe(31);
    expect(l.tendencia).toBe(-0.12);
    expect(l.nivelDeUso).toBe("medio");
    expect(usoBajo(l)).toBe(true);
    expect(usoCayendo(l)).toBe(true);
  });

  it("solo trae los hubs que la cuenta tiene", () => {
    expect(l.hubs.map((h) => h.hub)).toEqual(["marketing", "sales", "service", "content"]);
  });

  it("cada hub con plan, uso, licencias, activación, lo que falta y su monto", () => {
    const sales = l.hubs.find((h) => h.hub === "sales")!;
    expect(sales.plan).toBe("Professional");
    expect(sales.uso).toBe(28);
    expect(sales.licencias).toEqual({ asignadas: 12, libres: 3, limite: 15 });
    expect(sales.porActivar).toEqual(["Build Pipeline", "Close Deals"]);
    expect(sales.renovacion).toBe("2026-11-14");
    expect(sales.montoMensual).toBe(1200);
    const service = l.hubs.find((h) => h.hub === "service")!;
    expect(service.activado).toBe(false);
    expect(service.porActivar).toEqual(["Scale Support"]);
  });

  it("un cupo sin uso es «sin dato», no cero", () => {
    expect(l.correosDelMes).toBeNull();
    expect(l.contactosDeMarketing).toEqual({ usados: 6100, limite: 10000 });
  });

  it("los créditos usan el límite incluido más el adicional, y dicen si hay compra automática", () => {
    expect(l.creditos).toEqual({ usados: 3950, limite: 5000, reinicio: "2026-10-10", compraAutomatica: false });
  });

  it("las fechas en epoch se leen como día", () => {
    expect(l.proximaRenovacion).toBe("2026-11-14");
    expect(l.relacionGestionadaVence).toBe("2026-10-18");
    expect(l.ultimaActividadDeSmarteam?.slice(0, 10)).toBe("2025-08-19");
  });

  it("una cancelación vacía no es una cancelación", () => {
    expect(l.cancelacion).toBeNull();
    expect(leerPartner({ hs_cancellation_products: "SALES;SERVICE" })!.cancelacion).toEqual({ hubs: ["SALES", "SERVICE"], fecha: null });
  });

  it("las señales se traducen y la de renovación se marca aparte", () => {
    expect(l.senales).toEqual([
      { tipo: "Customer Agent", etiqueta: "agente de clientes", esRenovacion: false },
      { tipo: "Predicted Cross-Sell", etiqueta: "venta cruzada", esRenovacion: false },
    ]);
    expect(leerPartner({ hs_revenue_signals: "Upcoming HubSpot Renewal" })!.senales[0].esRenovacion).toBe(true);
  });

  it("la explicación de HubSpot llega como texto plano", () => {
    expect(l.senalExplicacion).toBe("This company shows similar usage: AI usage: 50%+");
  });

  it("los puntos de nivel viajan con su fecha", () => {
    expect(l.nivel).toMatchObject({ vendidos: 186, gestionados: 62, mercado: "growth_market", multiplicador: 2, comision: 420 });
    expect(l.nivel.actualizadoEn?.slice(0, 10)).toBe("2025-11-26");
  });

  it("las licencias se suman entre tipos", () => {
    expect(licenciasSumadas(l)).toEqual({ asignadas: 32, libres: 8, limite: 40 });
  });
});

describe("textos", () => {
  it("la tendencia se dice como porcentaje con signo tipográfico", () => {
    expect(porcentajeDeTendencia(-0.12)).toBe("−12 %");
    expect(porcentajeDeTendencia(0.03)).toBe("+3 %");
    expect(porcentajeDeTendencia(0.001)).toBe("0 %");
  });

  it("textoPlano recorta y no deja HTML", () => {
    expect(textoPlano("<b>Hola</b>&nbsp;mundo")).toBe("Hola mundo");
    expect(textoPlano(null)).toBeNull();
    expect(textoPlano("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
