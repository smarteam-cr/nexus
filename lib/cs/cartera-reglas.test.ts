import { describe, expect, it } from "vitest";
import { leerPartner } from "./lectura-partner";
import {
  adopcionPorHub,
  carteraEnUnaLinea,
  consumoDeLaCartera,
  cuentasParaBuscar,
  cseVigente,
  entregaDeProyectos,
  equipo,
  listaParaLlamar,
  motivosDeLaCuenta,
  nivelDePartner,
  oportunidades,
  primeros90Dias,
  renovacionesProximas,
  saludDeLaCuenta,
  type CuentaDeCartera,
  type ProyectoDeCuenta,
} from "./cartera-reglas";

const HOY = "2026-10-04";

const proyecto = (o: Partial<ProyectoDeCuenta> = {}): ProyectoDeCuenta => ({
  id: "p1",
  nombre: "Implementación Sales Hub",
  etapa: "Configuración técnica",
  cseNombre: "Andrea Solís",
  cseEmail: "andrea@smarteamcr.com",
  activo: true,
  bloqueado: false,
  motivoBloqueo: null,
  detalleBloqueo: null,
  atraso: null,
  cierre: { prometido: null, proyectado: null, corrimientoDias: null },
  avance: 0.5,
  salud: "SALUDABLE",
  cerradoEn: null,
  ...o,
});

/** Un crudo de Partner Clients sano: gestionada, uso 60, renueva lejos. */
const CRUDO_SANO = {
  hs_is_active: "true",
  hs_is_managed: "true",
  hs_unified_usage_score: "60",
  hs_last_4_weeks_usage_score_trend: "0.01",
  hs_has_sales_hub: "true",
  hs_is_sales_hub_activated: "true",
  hs_sales_hub_edition: "professional",
  hs_sales_hub_usage_score: "60",
  hs_sales_hub_renewal_date: "2027-06-01",
  hs_sales_hub_mrr: "1000",
  hs_total_subscription_mrr: "1000",
  hs_managed_mrr: "1000",
  hs_managed_local_mrr_currency: "USD",
};

const cuenta = (id: string, o: Partial<CuentaDeCartera> & { crudo?: Record<string, string> | null } = {}): CuentaDeCartera => {
  const { crudo, ...resto } = o;
  return {
    clientId: id,
    nombre: id,
    partner: crudo === null ? null : leerPartner({ ...CRUDO_SANO, ...(crudo ?? {}) }),
    proyectos: [proyecto()],
    ultimoContacto: "2026-10-01T15:00:00Z",
    ticketsAbiertos: 0,
    alertas: [],
    facturacion: null,
    licenciasManuales: [],
    ...resto,
  };
};

describe("motivos de una cuenta", () => {
  it("una cuenta sana no tiene motivos", () => {
    const m = motivosDeLaCuenta(cuenta("sana"), HOY);
    expect(m).toEqual([]);
    expect(saludDeLaCuenta(m)).toBe("saludable");
  });

  it("⭐ riesgo doble: proyecto bloqueado y renovación en 90 días, marcado como cruce", () => {
    const c = cuenta("andina", {
      crudo: { hs_sales_hub_renewal_date: "2026-11-14" },
      proyectos: [proyecto({ bloqueado: true, motivoBloqueo: "Cliente no responde" })],
    });
    const [principal] = motivosDeLaCuenta(c, HOY);
    expect(principal.clave).toBe("riesgoDoble");
    expect(principal.cruce).toBe(true);
    expect(principal.texto).toBe("«Implementación Sales Hub» está bloqueado y la cuenta renueva en 41 días");
  });

  it("⭐ el uso cae desde que se cerró la implementación (cruce)", () => {
    const c = cuenta("ferretero", {
      crudo: { hs_last_4_weeks_usage_score_trend: "-0.15" },
      proyectos: [proyecto({ activo: false, cerradoEn: "2026-08-08" })],
    });
    const m = motivosDeLaCuenta(c, HOY).find((x) => x.clave === "usoTrasCierre")!;
    expect(m.cruce).toBe(true);
    expect(m.texto).toContain("se cerró «Implementación Sales Hub» (8 ago): −15 %");
  });

  it("las alertas del agente vigía entran con su marca de IA; los avisos automáticos no", () => {
    const c = cuenta("clinica", {
      alertas: [
        { id: "a1", severidad: "HIGH", categoria: "CHURN_RISK", titulo: "Dice estar conforme, pero el uso cae", razon: "", accion: null, proyecto: null, estado: "OPEN", delAgente: true, detectadaEn: HOY },
        { id: "a2", severidad: "HIGH", categoria: "RENEWAL_RISK", titulo: "Renovación en 41 días", razon: "", accion: null, proyecto: null, estado: "OPEN", delAgente: false, detectadaEn: HOY },
      ],
    });
    const m = motivosDeLaCuenta(c, HOY);
    expect(m.map((x) => x.texto)).toEqual(["Dice estar conforme, pero el uso cae"]);
    expect(m[0].ia).toBe(true);
  });

  it("la facturación vencida es motivo, con las reglas de Cobranza", () => {
    const c = cuenta("coop", {
      facturacion: { vencidas: { cantidad: 2, montos: { USD: 4200 }, diasMax: 38 }, sinFacturarAtrasadas: { cantidad: 0, diasMax: 0 }, promesasIncumplidas: 0, ultimoPago: null },
    });
    const m = motivosDeLaCuenta(c, HOY)[0];
    expect(m.clave).toBe("facturasVencidas");
    expect(m.prioridad).toBe("alta");
    expect(m.texto).toBe("2 facturas vencidas por US$4.200 (la más vieja, hace 38 días)");
  });

  it("la relación gestionada por vencer dice desde cuándo nadie trabaja en el portal", () => {
    const c = cuenta("logistica", {
      crudo: { hs_managed_relationship_estimated_expiration_date: "2026-10-13", hs_last_active_partner_employee_active_at: "2026-07-28T00:00:00Z" },
    });
    const m = motivosDeLaCuenta(c, HOY)[0];
    expect(m.clave).toBe("relacionPorVencer");
    expect(m.prioridad).toBe("alta");
    expect(m.texto).toBe("La relación gestionada vence en 9 días: nadie de Smarteam trabaja en el portal desde el 28 jul");
  });

  it("sin contacto en más de 21 días", () => {
    const c = cuenta("altos", { ultimoContacto: "2026-08-31T00:00:00Z", ticketsAbiertos: 3 });
    expect(motivosDeLaCuenta(c, HOY)[0].texto).toBe("34 días sin reunión ni contacto y 3 tickets abiertos");
  });
});

describe("⭐ la lista de la semana, en el orden de Elías", () => {
  const cuentas = [
    cuenta("media-atrasada", { proyectos: [proyecto({ atraso: { dias: 9, fase: "Integración" } })] }),
    cuenta("sin-datos", { crudo: null }),
    cuenta("alta-bloqueada", { proyectos: [proyecto({ bloqueado: true })] }),
    cuenta("cancelada", { crudo: { hs_cancellation_products: "SERVICE", hs_next_cancellation_date: "2026-12-31" } }),
    cuenta("sana"),
  ];
  const lista = listaParaLlamar(cuentas, HOY);

  it("la cancelación va primera, después lo alto, después lo que no tiene datos, después lo medio", () => {
    expect(lista.map((f) => f.clientId)).toEqual(["cancelada", "alta-bloqueada", "sin-datos", "media-atrasada"]);
  });

  it("una cuenta sin motivos no está en la lista", () => {
    expect(lista.some((f) => f.clientId === "sana")).toBe(false);
  });

  it("la cancelación se dice con el nombre del hub y la fecha", () => {
    expect(lista[0].principal.texto).toBe("HubSpot registró la cancelación de Service Hub para el 31 dic");
  });

  it("el CSE de la cuenta es quien lleva más proyectos activos", () => {
    const c = cuenta("x", {
      proyectos: [
        proyecto({ id: "1", cseNombre: "Diego Rojas", cseEmail: "d@x", bloqueado: true }),
        proyecto({ id: "2", cseNombre: "Paula Vargas", cseEmail: "p@x" }),
        proyecto({ id: "3", cseNombre: "Paula Vargas", cseEmail: "p@x" }),
      ],
    });
    expect(listaParaLlamar([c], HOY)[0].cse?.nombre).toBe("Paula Vargas");
  });
});

describe("renovaciones", () => {
  it("una fila por cuenta y fecha, sumando lo que paga cada hub", () => {
    const c = cuenta("andina", {
      crudo: {
        hs_has_marketing_hub: "true",
        hs_marketing_hub_edition: "professional",
        hs_marketing_hub_renewal_date: "2026-11-14",
        hs_marketing_hub_mrr: "1140",
        hs_sales_hub_renewal_date: "2026-11-14",
        hs_sales_hub_mrr: "1200",
        hs_next_renewal_date: "2026-11-14",
        hs_renewal_mrr_change: "-355",
      },
    });
    const [f] = renovacionesProximas([c], HOY, 90);
    expect(f.fecha).toBe("2026-11-14");
    expect(f.dias).toBe(41);
    expect(f.hubs.map((h) => h.nombre)).toEqual(["Marketing Hub", "Sales Hub"]);
    expect(f.montoMensual).toBe(2340);
    expect(f.cambioEsperado).toBe(-355);
    expect(f.conversacion).toBe("Entender por qué baja de plan");
  });

  it("si renueva hubs en fechas distintas, sale dos veces", () => {
    const c = cuenta("x", {
      crudo: { hs_has_marketing_hub: "true", hs_marketing_hub_renewal_date: "2026-10-20", hs_sales_hub_renewal_date: "2026-12-20" },
    });
    expect(renovacionesProximas([c], HOY, 90).map((f) => f.fecha)).toEqual(["2026-10-20", "2026-12-20"]);
  });

  it("lo cargado a mano completa lo que HubSpot no trae", () => {
    const c = cuenta("x", {
      crudo: null,
      licenciasManuales: [{ hub: "service", plan: "Pro", fechaRenovacion: "2026-11-01", montoMensual: 500, moneda: "USD" }],
    });
    const [f] = renovacionesProximas([c], HOY, 90);
    expect(f.hubs[0]).toMatchObject({ nombre: "Service Hub", plan: "Pro", monto: 500 });
  });

  it("fuera de la ventana no entra", () => {
    expect(renovacionesProximas([cuenta("sana")], HOY, 90)).toEqual([]);
  });
});

describe("uso y licencias", () => {
  const sinActivar = (id: string) =>
    cuenta(id, { crudo: { hs_has_service_hub: "true", hs_is_service_hub_activated: "false", hs_service_hub_tools_to_activate: "Scale Support" } });

  it("suma lo que falta activar en toda la cartera y propone el taller desde 5 cuentas", () => {
    const service = adopcionPorHub(["a", "b", "c", "d", "e"].map(sinActivar)).find((h) => h.hub === "service")!;
    expect(service.sinActivar).toHaveLength(5);
    expect(service.porActivar[0]).toMatchObject({ frase: "Scale Support" });
    expect(service.porActivar[0].cuentas).toHaveLength(5);
    expect(service.tallerGrupal).toBe(true);
  });

  it("primeros 90 días: cuenta las nuevas y lista las que no activaron algo", () => {
    const nueva = cuenta("nueva", { crudo: { hs_relationship_start_date: "2026-08-24T00:00:00Z", hs_has_service_hub: "true", hs_is_service_hub_activated: "false" } });
    const vieja = cuenta("vieja", { crudo: { hs_relationship_start_date: "2022-01-01T00:00:00Z" } });
    const r = primeros90Dias([nueva, vieja], HOY);
    expect(r.nuevas).toBe(1);
    expect(r.pendientes[0]).toMatchObject({ clientId: "nueva", dias: 41, pendiente: "Service Hub sin activar" });
  });

  it("se lee en dos sentidos: paga y no usa, o está al límite", () => {
    const desperdicia = cuenta("desperdicia", { crudo: { hs_sales_seats_assigned: "4", hs_sales_seats_available: "6", hs_sales_seats_limit: "10" } });
    const llena = cuenta("llena", {
      crudo: { hs_sales_seats_assigned: "45", hs_sales_seats_available: "0", hs_sales_seats_limit: "45", hs_marketing_contacts_usage: "9200", hs_marketing_contacts_limit: "10000" },
    });
    const r = consumoDeLaCartera([desperdicia, llena]);
    expect(r.paganYNoUsan.map((i) => i.que)).toEqual(["6 de 10 licencias sin asignar"]);
    expect(r.alLimite.map((i) => i.que)).toEqual(["45 de 45 licencias de Sales Hub", "9.200 de 10.000 contactos de marketing"]);
  });
});

describe("crecimiento", () => {
  it("las señales de HubSpot, sin la de renovación, con su explicación una sola vez", () => {
    const c = cuenta("banco", { crudo: { hs_revenue_signals: "Customer Agent;Upcoming HubSpot Renewal", hs_revenue_signal_explanation: "<p>AI usage 50%+</p>" } });
    const o = oportunidades([c]);
    expect(o.filter((x) => x.tipo === "senal").map((x) => x.titulo)).toEqual(["Agente de clientes"]);
    expect(o[0].detalle).toBe("AI usage 50%+");
  });

  it("si usa bien un hub y le falta uno principal, es una conversación natural", () => {
    const c = cuenta("seguros", { crudo: { hs_has_sales_hub: "false", hs_has_service_hub: "true", hs_service_hub_usage_score: "63" } });
    const o = oportunidades([c]).find((x) => x.tipo === "hubQueNoTiene")!;
    expect(o.titulo).toBe("Usa bien Service Hub (63) y no tiene Marketing Hub");
  });

  it("una cuenta con cancelación no se ofrece para crecer", () => {
    const c = cuenta("x", { crudo: { hs_cancellation_products: "SALES", hs_revenue_signals: "Predicted Upsell" } });
    expect(oportunidades([c])).toEqual([]);
  });
});

describe("equipo y nivel de partner", () => {
  it("cada CSE con sus cuentas, su plata y sus proyectos; los proyectos sin CSE aparte", () => {
    const r = equipo(
      [
        cuenta("a", { proyectos: [proyecto({ atraso: { dias: 5, fase: null } })] }),
        cuenta("b", { proyectos: [proyecto({ cseNombre: null, cseEmail: null })] }),
      ],
      HOY,
    );
    expect(r.proyectosSinCse).toBe(1);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ nombre: "Andrea Solís", cuentas: 1, mrr: 1000, atrasados: 1, usoPromedio: 60 });
  });

  it("los puntos en juego son los gestionados de las relaciones que vencen en 60 días", () => {
    const vence = cuenta("vence", {
      crudo: { hs_managed_relationship_estimated_expiration_date: "2026-10-30", hs_managed_tier_points: "48", hs_sold_tier_points: "640" },
    });
    const compartida = cuenta("compartida", { crudo: { hs_number_of_managing_partners: "2", hs_sold_tier_points: "310" } });
    const r = nivelDePartner([vence, compartida], HOY);
    expect(r.totales).toMatchObject({ porVencer: 1, puntosEnJuego: 48, compartidas: 1, vendidos: 950 });
  });
});

describe("la cartera en una línea", () => {
  it("suma el MRR gestionado y separa lo que renueva en riesgo", () => {
    const enRiesgo = cuenta("riesgo", {
      crudo: { hs_sales_hub_renewal_date: "2026-10-31", hs_unified_usage_score: "29", hs_last_4_weeks_usage_score_trend: "-0.15" },
    });
    const r = carteraEnUnaLinea([enRiesgo, cuenta("sana")], HOY);
    expect(r.mrrGestionado).toBe(2000);
    expect(r.cuentasGestionadas).toBe(2);
    expect(r.renuevan90).toEqual({ monto: 1000, cuentas: 1 });
    expect(r.enRiesgo90).toEqual({ monto: 1000, cuentas: 1 });
    expect(r.uso).toEqual({ promedio: 45, conPuntaje: 2, cayendo: 1 });
  });

  it("la entrega de proyectos cuenta bloqueados, atrasados y sin CSE", () => {
    const r = entregaDeProyectos([cuenta("a", { proyectos: [proyecto({ bloqueado: true }), proyecto({ atraso: { dias: 3, fase: null }, cseNombre: null })] })]);
    expect(r).toEqual({ bloqueados: 1, atrasados: 1, alertasAltas: 0, sinCse: 1 });
  });
});

describe("buscar una cuenta", () => {
  it("⭐ trae TODAS las cuentas, también las sanas que no aparecen en ninguna pestaña, por nombre", () => {
    const filas = cuentasParaBuscar(
      [
        cuenta("Zeta", { proyectos: [proyecto({ bloqueado: true }), proyecto({ id: "p2", activo: false })] }),
        cuenta("Ábaco"),
        cuenta("Mora", { crudo: null, proyectos: [] }),
      ],
      HOY,
    );
    expect(filas.map((f) => f.nombre)).toEqual(["Ábaco", "Mora", "Zeta"]);
    const [abaco, mora, zeta] = filas;
    expect(abaco).toMatchObject({ salud: "saludable", principal: null, otros: 0, uso: 60, cse: "Andrea Solís", proyectosActivos: 1 });
    expect(abaco.renueva).toBe("2027-06-01");
    expect(mora).toMatchObject({ uso: null, renueva: null, cse: null, proyectosActivos: 0 });
    expect(zeta).toMatchObject({ salud: "en-riesgo", principal: "Proyecto bloqueado", proyectosActivos: 1 });
  });
});

describe("CSE dado de baja", () => {
  const deBaja = new Map([["losorio@smarteamcr.com", "Lorena Osorio"]]);

  it("⭐ quien está de baja en Nexus no cuenta como CSE aunque HubSpot lo siga teniendo de dueño", () => {
    expect(cseVigente("Lorena Osorio", "LOsorio@smarteamcr.com", deBaja)).toEqual({ cseNombre: null, cseEmail: null, cseDeBaja: "Lorena Osorio" });
    expect(cseVigente("Heiver Gómez", "hgomez@smarteamcr.com", deBaja)).toEqual({ cseNombre: "Heiver Gómez", cseEmail: "hgomez@smarteamcr.com", cseDeBaja: null });
  });

  it("sus proyectos cuentan como sin CSE, y Equipo dice de quién eran", () => {
    const r = equipo(
      [cuenta("a", { proyectos: [proyecto({ cseNombre: null, cseEmail: null, cseDeBaja: "Lorena Osorio" }), proyecto({ id: "p2" })] })],
      HOY,
    );
    expect(r.proyectosSinCse).toBe(1);
    expect(r.deBaja).toEqual([{ nombre: "Lorena Osorio", proyectos: 1 }]);
    expect(r.filas.map((f) => f.nombre)).toEqual(["Andrea Solís"]);
  });

  it("el filtro por CSE mira todos los CSE de la cuenta, no solo el principal", () => {
    const [fila] = listaParaLlamar(
      [cuenta("b", { proyectos: [proyecto({ bloqueado: true }), proyecto({ id: "p2", cseNombre: "Heiver Gómez", cseEmail: "hgomez@smarteamcr.com" })] })],
      HOY,
    );
    expect(fila.cses.sort()).toEqual(["Andrea Solís", "Heiver Gómez"]);
  });
});
