import { describe, expect, it } from "vitest";
import { leerPartner } from "./lectura-partner";
import { estadoDeLaCuenta } from "./ficha-reglas";
import type { CuentaDeCartera } from "./cartera-reglas";

const HOY = "2026-10-04";

const cuenta = (o: Partial<CuentaDeCartera> = {}): CuentaDeCartera => ({
  clientId: "c",
  nombre: "Distribuidora Andina",
  partner: leerPartner({
    hs_is_active: "true",
    hs_is_managed: "true",
    hs_unified_usage_score: "31",
    hs_last_4_weeks_usage_score_trend: "-0.12",
    hs_has_sales_hub: "true",
    hs_sales_hub_renewal_date: "2026-11-14",
    hs_has_service_hub: "true",
    hs_is_service_hub_activated: "false",
    hs_next_renewal_date: "2026-11-14",
    hs_renewal_mrr_change: "-355",
    hs_managed_local_mrr_currency: "USD",
  }),
  proyectos: [
    {
      id: "p",
      nombre: "Implementación Sales Hub",
      etapa: null,
      cseNombre: "Andrea",
      cseEmail: null,
      activo: true,
      bloqueado: true,
      motivoBloqueo: "Cliente no responde",
      detalleBloqueo: null,
      atraso: null,
      cierre: { prometido: null, proyectado: null, corrimientoDias: null },
      avance: 0.4,
      salud: "EN_RIESGO",
      cerradoEn: null,
    },
  ],
  ultimoContacto: "2026-09-28T00:00:00Z",
  ticketsAbiertos: 1,
  alertas: [],
  facturacion: null,
  licenciasManuales: [],
  ...o,
});

describe("estado de la cuenta", () => {
  it("cuatro lecturas, cada una con palabra y porqué", () => {
    const [entrega, uso, relacion, renovacion] = estadoDeLaCuenta(cuenta(), HOY);
    expect(entrega).toMatchObject({ color: "rojo", palabra: "Bloqueada", porque: "«Implementación Sales Hub» está bloqueado: cliente no responde." });
    expect(uso).toMatchObject({ color: "ambar", palabra: "Cayendo", porque: "31 de 100, −12 % en 4 semanas. Service Hub sin activar." });
    expect(relacion).toMatchObject({ color: "verde", palabra: "Al día", porque: "Último contacto hace 6 días. 1 ticket abierto." });
    expect(renovacion).toMatchObject({ color: "ambar", palabra: "En 41 días", porque: "Sales Hub, 14 nov. HubSpot espera que baje US$355 al mes." });
  });

  it("sin datos se dice como sin datos, en gris, nunca como sano", () => {
    const [entrega, uso, relacion, renovacion] = estadoDeLaCuenta(cuenta({ partner: null, proyectos: [], ultimoContacto: null, ticketsAbiertos: null }), HOY);
    expect([entrega.color, uso.color, relacion.color, renovacion.color]).toEqual(["gris", "gris", "gris", "gris"]);
    expect(uso.porque).toBe("La cuenta no está vinculada a HubSpot Partner.");
  });

  it("una cancelación registrada manda sobre la fecha", () => {
    const c = cuenta({ partner: leerPartner({ hs_cancellation_products: "SERVICE", hs_next_cancellation_date: "2026-12-31" }) });
    expect(estadoDeLaCuenta(c, HOY)[3]).toMatchObject({ color: "rojo", palabra: "Cancelación registrada" });
  });
});
