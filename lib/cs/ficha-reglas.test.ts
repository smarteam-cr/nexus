import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leerPartner } from "./lectura-partner";
import { estadoDeLaCuenta, renovacionDeLaFicha } from "./ficha-reglas";
import { alertaDeLaCuenta, motivosDeLaCuenta, proximaRenovacion, type CuentaDeCartera } from "./cartera-reglas";

const HOY = "2026-10-04";
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

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

describe("⭐ la próxima renovación es UNA en toda la ficha", () => {
  const manual = { hub: "service", plan: "Professional", fechaRenovacion: "2026-11-01", montoMensual: 800, moneda: "usd" };

  it("sin HubSpot Partner y con la licencia cargada a mano: la misma fecha en el estado, la pestaña y su rótulo", () => {
    const c = cuenta({ partner: null, licenciasManuales: [manual] });
    // El rótulo de la pestaña (AccountView) usa `proximaRenovacion` tal cual.
    expect(proximaRenovacion(c, HOY)).toBe("2026-11-01");
    const pestana = renovacionDeLaFicha(c, HOY);
    expect(pestana.proxima).toBe("2026-11-01");
    expect(pestana.queRenueva.map((h) => [h.nombre, h.plan, h.fuente])).toEqual([["Service Hub", "Professional", "manual"]]);
    expect(pestana.montos).toEqual([{ moneda: "USD", monto: 800 }]);
    expect(estadoDeLaCuenta(c, HOY)[3]).toMatchObject({
      color: "ambar",
      palabra: "En 28 días",
      porque: "Service Hub, 1 nov.",
      fuente: "Información del cliente",
    });
  });

  it("con HubSpot, la fecha cargada a mano para un hub que HubSpot ya fecha no cuenta (HubSpot manda)", () => {
    const c = cuenta({ licenciasManuales: [{ ...manual, hub: "sales", fechaRenovacion: "2026-10-20" }] });
    expect(proximaRenovacion(c, HOY)).toBe("2026-11-14");
    expect(renovacionDeLaFicha(c, HOY).proxima).toBe("2026-11-14");
    expect(estadoDeLaCuenta(c, HOY)[3].palabra).toBe("En 41 días");
  });

  it("los montos de lo que renueva no mezclan monedas", () => {
    const c = cuenta({
      partner: null,
      licenciasManuales: [manual, { ...manual, hub: "marketing", montoMensual: 450000, moneda: "CRC" }],
    });
    expect(renovacionDeLaFicha(c, HOY).montos).toEqual([
      { moneda: "USD", monto: 800 },
      { moneda: "CRC", monto: 450000 },
    ]);
  });

  it("el rótulo y la pestaña leen esta regla, no solo HubSpot", () => {
    const vista = leer("components/cs/account/AccountView.tsx");
    expect(vista).toContain("proximaRenovacion(cuenta, hoy)");
    expect(vista, "el rótulo volvió a mirar solo HubSpot").not.toMatch(/p\.proximaRenovacion/);
    const pestana = leer("components/cs/account/pestanas/PestanaRenovacion.tsx");
    expect(pestana).toContain("renovacionDeLaFicha(data.cuenta, hoy)");
    expect(pestana, "la pestaña volvió a mirar solo HubSpot").not.toMatch(/p\.proximaRenovacion|p\.hubs\.(filter|map)/);
  });
});

describe("⭐ la cuenta de respaldo de la ficha lleva sus alertas", () => {
  it("una alerta del agente se lee igual que en el índice y es motivo para llamar", () => {
    const a = alertaDeLaCuenta({
      id: "x",
      severity: "HIGH",
      category: "CHURN_RISK",
      title: "Dice estar conforme, pero el uso cae",
      reason: "El uso cayó 12 %",
      suggestedAction: null,
      status: "SEEN",
      agentRunId: "run-1",
      lastDetectedAt: new Date("2026-10-03T12:00:00Z"),
      project: { name: "Implementación Sales Hub" },
    });
    expect(a).toMatchObject({ severidad: "HIGH", estado: "SEEN", delAgente: true, proyecto: "Implementación Sales Hub", detectadaEn: "2026-10-03T12:00:00.000Z" });
    expect(motivosDeLaCuenta(cuenta({ alertas: [a] }), HOY).map((m) => m.clave)).toContain("alertaDelAgente");
  });

  it("load-account arma la cuenta de respaldo con las alertas que ya cargó, no con una lista vacía", () => {
    /* Una cuenta que no entra a la cartera (sin proyecto activo ni suscripción activa) se arma de
       respaldo. Con `alertas: []`, la ficha decía «Ninguna alerta abierta» con alertas abiertas. */
    const src = leer("lib/cs/load-account.ts");
    expect(src).toContain("alertas: alerts.map(alertaDeLaCuenta)");
    expect(src).not.toMatch(/alertas:\s*\[\]/);
    expect(leer("lib/cs/cartera.ts"), "el índice tiene que leerlas con la misma regla").toContain(".map(alertaDeLaCuenta)");
  });
});
