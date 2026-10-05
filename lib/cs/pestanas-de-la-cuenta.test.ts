import { describe, expect, it } from "vitest";
import { leerPartner } from "./lectura-partner";
import type { CuentaDeCartera, ProyectoDeCuenta } from "./cartera-reglas";
import { PESTANA_DE_LA_LECTURA, PESTANAS_DE_LA_CUENTA, pestanaDeLaUrl } from "./pestanas-de-la-cuenta";
import { delContratoAlUso, licenciasDeLaCuenta, licenciasSinAsignar, lunesDeLaSemana, semanasBajoElUmbral, usoHaceSemanas, type SemanaDeUso } from "./adopcion";
import { listaParaRenovar } from "./lista-para-renovar";
import { loQueViene } from "./lo-que-viene";

/**
 * Las reglas de la ficha de la cuenta en pestañas (rediseño del 2026-10-05): las pestañas, la
 * adopción (del contrato al uso, licencias, historial), la lista para renovar y lo que viene.
 * Todo sale de datos que ya existen; lo que no hay se dice, nunca se aproxima.
 */

const HOY = "2026-10-05";

const PARTNER = {
  hs_is_active: "true",
  hs_is_managed: "true",
  hs_unified_usage_score: "31",
  hs_last_4_weeks_usage_score_trend: "-0.12",
  hs_has_marketing_hub: "true",
  hs_marketing_hub_edition: "professional",
  hs_marketing_hub_usage_score: "42",
  hs_is_marketing_hub_activated: "true",
  hs_marketing_hub_renewal_date: "2026-11-14",
  hs_marketing_hub_mrr: "1140",
  hs_has_sales_hub: "true",
  hs_sales_hub_edition: "professional",
  hs_sales_hub_usage_score: "28",
  hs_is_sales_hub_activated: "true",
  hs_sales_seats_assigned: "12",
  hs_sales_seats_limit: "15",
  hs_sales_hub_renewal_date: "2026-11-14",
  hs_sales_hub_mrr: "1200",
  hs_has_service_hub: "true",
  hs_service_hub_edition: "starter",
  hs_service_hub_usage_score: "9",
  hs_is_service_hub_activated: "false",
  hs_service_seats_assigned: "2",
  hs_service_seats_limit: "5",
  hs_service_hub_renewal_date: "2027-02-03",
  hs_has_cms_hub: "true",
  hs_is_cms_hub_activated: "true",
  hs_core_seats_assigned: "18",
  hs_core_seats_limit: "20",
  hs_next_renewal_date: "2026-11-14",
  hs_renewal_mrr_change: "-355",
  hs_managed_local_mrr_currency: "USD",
  hs_managed_relationship_estimated_expiration_date: "2026-10-18",
  hs_last_active_partner_employee_active_at: "2026-08-19T15:00:00Z",
};

const proyecto = (o: Partial<ProyectoDeCuenta> = {}): ProyectoDeCuenta => ({
  id: "p",
  nombre: "Implementación Sales Hub",
  etapa: null,
  cseNombre: "Andrea",
  cseEmail: null,
  activo: true,
  bloqueado: true,
  motivoBloqueo: "el cliente no responde",
  detalleBloqueo: null,
  atraso: null,
  cierre: { prometido: "2026-09-30", proyectado: "2026-11-04", corrimientoDias: 35 },
  avance: 0.4,
  salud: "EN_RIESGO",
  cerradoEn: null,
  ...o,
});

const cuenta = (o: Partial<CuentaDeCartera> = {}): CuentaDeCartera => ({
  clientId: "c",
  nombre: "Distribuidora Andina",
  partner: leerPartner(PARTNER),
  proyectos: [proyecto()],
  ultimoContacto: "2026-09-29T00:00:00Z",
  ticketsAbiertos: 1,
  alertas: [],
  facturacion: null,
  licenciasManuales: [],
  ...o,
});

describe("las pestañas", () => {
  it("la dirección elige la pestaña; lo desconocido abre en el estado de la cuenta", () => {
    expect(pestanaDeLaUrl("adopcion")).toBe("adopcion");
    expect(pestanaDeLaUrl(null)).toBe("estado");
    expect(pestanaDeLaUrl("toString")).toBe("estado");
    expect(PESTANAS_DE_LA_CUENTA[0]).toBe("estado");
  });

  it("cada lectura del estado lleva a una pestaña que existe", () => {
    for (const p of Object.values(PESTANA_DE_LA_LECTURA)) expect(PESTANAS_DE_LA_CUENTA).toContain(p);
  });
});

describe("del contrato al uso", () => {
  it("contratado → activado → con uso sano, y dice qué se quedó en cada paso", () => {
    const [contratado, activado, sano] = delContratoAlUso(leerPartner(PARTNER)!.hubs);
    expect(contratado).toMatchObject({ cifra: 4, de: null });
    expect(activado).toMatchObject({ cifra: 3, de: 4, atencion: true, detalle: "Falta activar Service." });
    expect(sano).toMatchObject({ cifra: 1, de: 4, atencion: true });
    expect(sano.detalle).toBe("Solo Marketing (42). Sales 28 y Service 9 están bajo 35. Content: HubSpot no lo mide.");
  });

  it("un hub que HubSpot no mide no cuenta como sano ni como bajo", () => {
    const [, , sano] = delContratoAlUso(leerPartner({ hs_has_cms_hub: "true", hs_is_cms_hub_activated: "true" })!.hubs);
    expect(sano).toMatchObject({ cifra: 0, atencion: false });
    expect(sano.detalle).toBe("Ninguno llega al umbral. Content: HubSpot no lo mide.");
  });
});

describe("licencias", () => {
  it("una fila por tipo con límite, y la suma de las pagadas sin asignar", () => {
    const filas = licenciasDeLaCuenta(leerPartner(PARTNER)!);
    expect(filas.map((f) => [f.tipo, f.asignadas, f.total, f.libres])).toEqual([
      ["Principales", 18, 20, 2],
      ["Sales Hub", 12, 15, 3],
      ["Service Hub", 2, 5, 3],
    ]);
    expect(filas[2].nota).toBe("Starter · sin activar");
    expect(licenciasSinAsignar(filas)).toBe(8);
  });
});

describe("historial semanal de uso", () => {
  const semana = (s: string, uso: number | null, sales: number | null = null): SemanaDeUso => ({ semana: s, uso, porHub: { sales } });
  const historial = [semana("2026-W36", 39, 39), semana("2026-W37", 36), semana("2026-W38", 34), semana("2026-W39", 33), semana("2026-W40", 31, 28)];

  it("el lunes de cada semana ISO", () => {
    expect(lunesDeLaSemana("2026-W28")).toBe("2026-07-06");
    expect(lunesDeLaSemana("2026-W01")).toBe("2025-12-29");
    expect(lunesDeLaSemana("basura")).toBeNull();
  });

  it("el uso de hace 4 semanas sale de esa semana, nunca de otra", () => {
    expect(usoHaceSemanas(historial, null)).toBe(39);
    expect(usoHaceSemanas(historial, "sales")).toBe(39);
    expect(usoHaceSemanas(historial.slice(1), null)).toBeNull();
    expect(usoHaceSemanas([], null)).toBeNull();
  });

  it("cuenta las semanas seguidas bajo el umbral desde la más nueva", () => {
    expect(semanasBajoElUmbral(historial)).toBe(3);
    expect(semanasBajoElUmbral([semana("2026-W40", null)])).toBe(0);
  });
});

describe("lista para renovar", () => {
  it("seis puntos, cada uno con qué falta y dónde verlo", () => {
    const r = listaParaRenovar(cuenta(), [{ confirmado: true }, { confirmado: false }, { confirmado: false }], HOY);
    expect(r.puntos.map((p) => [p.clave, p.listo])).toEqual([
      ["uso", false],
      ["licencias", false],
      ["resultados", false],
      ["bloqueos", false],
      ["contacto", true],
      ["cancelacion", true],
    ]);
    expect(r.listos).toBe(2);
    expect(r.conDato).toBe(6);
    expect(r.puntos[0].detalle).toBe("Hoy 31 y bajando.");
    expect(r.puntos[1].detalle).toBe("8 sin asignar: 2 de Principales, 3 de Sales, 3 de Service.");
    expect(r.puntos[2].detalle).toBe("1 de 3 confirmado.");
    expect(r.puntos[3].detalle).toBe("«Implementación Sales Hub» está bloqueado: el cliente no responde.");
    expect(r.puntos[4].detalle).toBe("Último contacto hace 6 días.");
  });

  it("sin HubSpot Partner, uso, licencias y cancelación quedan sin dato: ni listos ni pendientes", () => {
    const r = listaParaRenovar(cuenta({ partner: null, proyectos: [] }), [], HOY);
    expect(r.puntos.filter((p) => p.listo === null).map((p) => p.clave)).toEqual(["uso", "licencias", "cancelacion"]);
    expect(r.conDato).toBe(3);
    expect(r.puntos.find((p) => p.clave === "resultados")).toMatchObject({ listo: false });
    expect(r.puntos.find((p) => p.clave === "bloqueos")).toMatchObject({ listo: true, detalle: "Sin proyectos activos." });
  });
});

describe("lo que viene", () => {
  it("las fechas de los próximos 90 días, en orden, con tono", () => {
    const eventos = loQueViene(cuenta(), HOY);
    expect(eventos.map((e) => [e.fecha, e.texto, e.tono])).toEqual([
      ["2026-10-18", "Vence la relación gestionada en HubSpot", "rojo"],
      ["2026-11-04", "Cierre de «Implementación Sales Hub»", "atencion"],
      ["2026-11-14", "Renueva Marketing Hub y Sales Hub", "atencion"],
    ]);
    expect(eventos[1].detalle).toBe("Era el 30 sep: se corrió 5 semanas");
    expect(eventos[2].detalle).toBe("US$2.340 al mes · HubSpot espera un cambio de −US$355");
  });

  it("lo que cae fuera de la ventana no aparece", () => {
    const eventos = loQueViene(cuenta(), HOY, 200);
    expect(eventos.map((e) => e.texto)).toContain("Renueva Service Hub");
  });
});
