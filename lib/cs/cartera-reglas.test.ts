import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leerPartner } from "./lectura-partner";
import {
  QUE_PINTA_CADA_COLOR,
  adopcionPorHub,
  alertasParaRevisar,
  buscarEnLaLista,
  carteraEnUnaLinea,
  consumoDeLaCartera,
  cuentasParaBuscar,
  cseVigente,
  entregaDeProyectos,
  equipo,
  leyendaDeSalud,
  listaParaLlamar,
  motivosDeLaCuenta,
  nivelDePartner,
  oportunidades,
  pasaEntrega,
  primeros90Dias,
  renovacionesProximas,
  saludDeLaCuenta,
  ultimoContactoDeLaCuenta,
  type AlertaDeCuenta,
  type CuentaDeCartera,
  type ProyectoDeCuenta,
} from "./cartera-reglas";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

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

const alerta = (o: Partial<AlertaDeCuenta> = {}): AlertaDeCuenta => ({
  id: "a1",
  severidad: "HIGH",
  categoria: "CHURN_RISK",
  titulo: "Dice estar conforme, pero el uso cae",
  razon: "",
  accion: null,
  proyecto: null,
  estado: "OPEN",
  delAgente: true,
  detectadaEn: HOY,
  ...o,
});

describe("motivos de una cuenta", () => {
  it("una cuenta sana no tiene motivos", () => {
    const m = motivosDeLaCuenta(cuenta("sana"), HOY);
    expect(m).toEqual([]);
    expect(saludDeLaCuenta(cuenta("sana"), HOY).salud).toBe("saludable");
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

  it("⭐ la relación gestionada que terminó es motivo mientras es reciente (Cicadex, 2026-10-07)", () => {
    /* Cuando termina, el motivo «por vencer» desaparece justo cuando se perdió el uso. HOY = 4 oct. */
    const termino = (fin: string, extra: Record<string, string> = {}) =>
      motivosDeLaCuenta(
        cuenta("cicadex", { crudo: { hs_is_managed: "false", hs_unified_usage_score: "", hs_managed_relationship_end_date: fin, ...extra } }),
        HOY,
      ).find((m) => m.clave === "relacionTerminada");
    expect(termino("2026-09-05T00:00:00Z")).toMatchObject({
      prioridad: "alta",
      texto: "La relación gestionada terminó el 5 sep: desde entonces HubSpot no comparte el uso",
    });
    expect(termino("2026-08-01T00:00:00Z")?.prioridad).toBe("media");
    // Las terminadas hace más de 90 días no llenan la lista (hay relaciones terminadas en 2021).
    expect(termino("2026-06-01T00:00:00Z")).toBeUndefined();
    // Una cuenta inactiva en HubSpot ya tiene su propio motivo: la relación terminó porque se fue.
    expect(termino("2026-09-05T00:00:00Z", { hs_is_active: "false" })).toBeUndefined();
    // Una fecha que todavía no llegó no terminó nada.
    expect(termino("2026-10-20T00:00:00Z")).toBeUndefined();
  });

  it("sin contacto en más de 21 días", () => {
    const c = cuenta("altos", { ultimoContacto: "2026-08-31T00:00:00Z", ticketsAbiertos: 3 });
    expect(motivosDeLaCuenta(c, HOY)[0].texto).toBe("34 días sin reunión ni contacto y 3 tickets abiertos");
  });
});

describe("⭐ una cuenta sin NINGÚN contacto registrado pide llamada (D16, Elías 2026-10-05)", () => {
  /* Antes el «sin contacto» solo saltaba con una fecha vieja: la cuenta de la que no se sabía nada
     no daba ningún motivo y quedaba como sana, fuera de «A quién llamar». La edición que pone esto
     en rojo: borrar la rama `else` de `c.ultimoContacto` en motivosDeLaCuenta. */
  const nunca = cuenta("nunca", { ultimoContacto: null, ticketsAbiertos: 0 });

  it("da su motivo, con el texto que la explica", () => {
    const [m] = motivosDeLaCuenta(nunca, HOY);
    expect(m.clave).toBe("sinContactoRegistrado");
    expect(m.texto).toBe("Sin contacto registrado: ninguna reunión con el cliente en 6 meses ni actividad en HubSpot");
    expect(m.prioridad).toBe("media");
  });

  it("aparece en «A quién llamar», arriba de las de fricción y debajo de las de riesgo", () => {
    const lista = listaParaLlamar(
      [
        cuenta("media-atrasada", { proyectos: [proyecto({ atraso: { dias: 9, fase: "Integración" } })] }),
        nunca,
        cuenta("alta-bloqueada", { proyectos: [proyecto({ bloqueado: true })] }),
      ],
      HOY,
    );
    expect(lista.map((f) => f.clientId)).toEqual(["alta-bloqueada", "nunca", "media-atrasada"]);
    expect(lista[1]).toMatchObject({ prioridad: "media", salud: "en-friccion", sinDatos: true });
  });

  it("los tickets van en el mismo motivo, no en uno aparte", () => {
    const m = motivosDeLaCuenta(cuenta("x", { ultimoContacto: null, ticketsAbiertos: 4 }), HOY);
    expect(m.map((x) => x.clave)).toEqual(["sinContactoRegistrado"]);
    expect(m[0].texto).toContain("y 4 tickets abiertos");
  });
});

describe("⭐ el último contacto es con el CLIENTE: una reunión interna sobre él no cuenta (D15, Elías 2026-10-05)", () => {
  const PROPIOS = new Set(["smarteamcr.com"]);
  const interna = {
    date: "2026-10-03T15:00:00Z",
    participants: ["ana@smarteamcr.com", "luis@smarteamcr.com", "sala-3@resource.calendar.google.com"],
    organizerEmail: "ana@smarteamcr.com",
  };
  const conElCliente = {
    date: "2026-09-20T15:00:00Z",
    participants: ["ana@smarteamcr.com", "gerencia@cliente.com"],
    organizerEmail: "ana@smarteamcr.com",
  };

  it("la interna más nueva no tapa a la última reunión con el cliente", () => {
    /* La edición que lo pone en rojo: sacar el filtro de puertas adentro (volver a «cualquier
       reunión atribuida al cliente», como hacía cartera.ts hasta el 2026-10-05). */
    expect(ultimoContactoDeLaCuenta([interna, conElCliente], null, PROPIOS)).toBe("2026-09-20T15:00:00.000Z");
  });

  it("solo internas y nada en HubSpot → ningún contacto registrado", () => {
    expect(ultimoContactoDeLaCuenta([interna], null, PROPIOS)).toBeNull();
  });

  it("gana la fecha más nueva entre la reunión con el cliente y HubSpot", () => {
    expect(ultimoContactoDeLaCuenta([conElCliente], new Date("2026-09-25T00:00:00Z"), PROPIOS)).toBe("2026-09-25T00:00:00.000Z");
    expect(ultimoContactoDeLaCuenta([conElCliente], "2026-09-01T00:00:00Z", PROPIOS)).toBe("2026-09-20T15:00:00.000Z");
    expect(ultimoContactoDeLaCuenta([interna], "2026-09-01T00:00:00Z", PROPIOS)).toBe("2026-09-01T00:00:00.000Z");
  });

  it("el índice y la cuenta de respaldo de la ficha leen con esta regla", () => {
    const cartera = leer("lib/cs/cartera.ts");
    expect(cartera, "cartera.ts dejó de usar la regla").toContain("ultimoContactoDeLaCuenta(");
    expect(cartera, "las reuniones tienen que traer quién estuvo").toMatch(/participants: true, organizerEmail: true/);
    expect(leer("lib/cs/load-account.ts"), "la cuenta de respaldo volvió a mirar solo HubSpot").toContain(
      "ultimoContactoDeUnCliente(",
    );
  });
});

describe("⭐ la lista de la semana, en el orden de Elías", () => {
  const cuentas = [
    cuenta("media-atrasada", { proyectos: [proyecto({ atraso: { dias: 9, fase: "Integración" } })] }),
    cuenta("sin-datos", { crudo: null, proyectos: [], ultimoContacto: null }),
    cuenta("sin-partner", { crudo: null }),
    cuenta("alta-bloqueada", { proyectos: [proyecto({ bloqueado: true })] }),
    cuenta("cancelada", { crudo: { hs_cancellation_products: "SERVICE", hs_next_cancellation_date: "2026-12-31" } }),
    cuenta("sana"),
  ];
  const lista = listaParaLlamar(cuentas, HOY);

  it("primero el color (rojo, amarillo, sin datos, verde) y, adentro, la cancelación primera", () => {
    /* «sin-partner» no está vinculada a HubSpot Partner, pero su entrega va al día y hay contacto:
       es verde y va al final, aunque su motivo para llamar sea «sin datos» (2026-10-07). */
    expect(lista.map((f) => f.clientId)).toEqual(["cancelada", "alta-bloqueada", "media-atrasada", "sin-datos", "sin-partner"]);
    expect(lista.map((f) => f.salud)).toEqual(["en-riesgo", "en-riesgo", "en-friccion", "sin-datos", "saludable"]);
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

  it("la entrega de proyectos: las cuentas bloqueadas y atrasadas, y los proyectos sin CSE", () => {
    const r = entregaDeProyectos([cuenta("a", { proyectos: [proyecto({ bloqueado: true }), proyecto({ atraso: { dias: 3, fase: null }, cseNombre: null })] })]);
    expect(r).toEqual({ bloqueados: ["a"], atrasados: ["a"], alertasAltas: [], sinCse: 1 });
  });

  it("⭐ una moneda por fila: dos hubs que renuevan el mismo día en monedas distintas no se suman", () => {
    const c = cuenta("mixta", {
      crudo: { hs_sales_hub_renewal_date: "2026-11-14" },
      licenciasManuales: [{ hub: "service", plan: "Pro", fechaRenovacion: "2026-11-14", montoMensual: 300000, moneda: "crc" }],
    });
    const filas = renovacionesProximas([c], HOY, 90);
    expect(filas.map((f) => [f.moneda, f.montoMensual, f.hubs.map((h) => h.hub)])).toEqual([
      ["USD", 1000, ["sales"]],
      ["CRC", 300000, ["service"]],
    ]);
    // Lo que renueva en dólares en la cartera es solo lo que está en dólares.
    expect(carteraEnUnaLinea([c], HOY).renuevan90).toEqual({ monto: 1000, cuentas: 1 });
  });

  it("⭐ la moneda se compara en mayúsculas: una licencia cargada con «usd» cuenta en dólares", () => {
    const c = cuenta("minusculas", {
      crudo: null,
      licenciasManuales: [{ hub: "service", plan: null, fechaRenovacion: "2026-11-01", montoMensual: 500, moneda: "usd" }],
    });
    expect(renovacionesProximas([c], HOY, 90)[0].moneda).toBe("USD");
    expect(carteraEnUnaLinea([c], HOY).renuevan90).toEqual({ monto: 500, cuentas: 1 });
  });

  it("y se guarda en mayúsculas: la ruta de las licencias normaliza antes de escribir", () => {
    expect(leer("app/api/clients/[id]/licencias/route.ts")).toMatch(/moneda:\s*normalizarMoneda\(/);
  });
});

describe("⭐ entrega de proyectos: el número del botón = las filas que deja su filtro", () => {
  const RENUEVA_PRONTO = { hs_sales_hub_renewal_date: "2026-11-14" };
  const cuentas = [
    // Un atraso tapado por el «riesgo doble»: el motivo principal habla del bloqueo, no del atraso.
    cuenta("doble", {
      crudo: RENUEVA_PRONTO,
      proyectos: [proyecto({ id: "b", bloqueado: true }), proyecto({ id: "t", atraso: { dias: 12, fase: null } })],
    }),
    // Un bloqueo tapado por una cancelación: el motivo principal es la cancelación.
    cuenta("cancelada", { crudo: { ...RENUEVA_PRONTO, hs_cancellation_products: "SALES" }, proyectos: [proyecto({ bloqueado: true })] }),
    // Una alerta alta que no es del agente (un aviso automático): «A quién llamar» no la muestra.
    cuenta("aviso", { alertas: [alerta({ id: "x", delAgente: false, categoria: "RENEWAL_RISK" })] }),
    cuenta("vigia", { alertas: [alerta({ id: "y" })] }),
    cuenta("sana"),
  ];
  const entrega = entregaDeProyectos(cuentas);
  const filas = listaParaLlamar(cuentas, HOY);

  for (const [filtro, balde] of [
    ["bloqueados", "bloqueados"],
    ["atrasados", "atrasados"],
    ["alertas", "alertasAltas"],
  ] as const) {
    it(`«${filtro}»: el filtro lista exactamente las cuentas que cuenta el botón`, () => {
      const enLaLista = filas.filter((f) => pasaEntrega(f, filtro, entrega)).map((f) => f.clientId);
      expect(enLaLista.sort()).toEqual([...entrega[balde]].sort());
    });
  }

  it("los tres casos que antes no coincidían, contados como cuentas", () => {
    expect(entrega.atrasados).toEqual(["doble"]);
    expect([...entrega.bloqueados].sort()).toEqual(["cancelada", "doble"]);
    expect(entrega.alertasAltas).toEqual(["vigia"]);
  });
});

describe("⭐ buscar con un filtro puesto", () => {
  const cuentas = [
    cuenta("Banco Atlántico", { proyectos: [proyecto({ atraso: { dias: 5, fase: null } })] }),
    cuenta("Bancaria Sur", { crudo: { hs_sales_hub_renewal_date: "2026-11-14" }, proyectos: [proyecto({ bloqueado: true })] }),
    cuenta("Banco Sano"),
  ];
  const filas = listaParaLlamar(cuentas, HOY);
  const todas = cuentasParaBuscar(cuentas, HOY);

  it("una cuenta de la lista que el filtro oculta aparece abajo, no desaparece", () => {
    // Filtro «Riesgo doble»: solo deja «Bancaria Sur», que no se llama «banco».
    const r = buscarEnLaLista(filas, todas, { busqueda: "banco", cse: "", pasaLosFiltros: (f) => f.riesgoDoble });
    expect(r.visibles).toEqual([]);
    expect(r.otras.map((c) => c.nombre)).toEqual(["Banco Atlántico", "Banco Sano"]);
  });

  it("lo que ya se ve no se repite abajo; sin búsqueda no hay «otras»", () => {
    const r = buscarEnLaLista(filas, todas, { busqueda: "banco", cse: "", pasaLosFiltros: () => true });
    expect(r.visibles.map((f) => f.nombre)).toEqual(["Banco Atlántico"]);
    expect(r.otras.map((c) => c.nombre)).toEqual(["Banco Sano"]);
    expect(buscarEnLaLista(filas, todas, { busqueda: " ", cse: "", pasaLosFiltros: () => true }).otras).toEqual([]);
  });

  it("el filtro por CSE vale para las dos partes", () => {
    const r = buscarEnLaLista(filas, todas, { busqueda: "banc", cse: "Heiver Gómez", pasaLosFiltros: () => true });
    expect([...r.visibles, ...r.otras]).toEqual([]);
  });
});

describe("⭐ el color de cada cuenta (Elías, 2026-10-07)", () => {
  /* Pedido: que Alex Vanegas vea de un vistazo qué cuentas necesitan atención. El color sale de las
     cuatro lecturas de la ficha (entrega, uso, relación, renovación), no de los motivos para llamar:
     antes 11 cuentas estaban en rojo solo por alertas del agente (kölbi entre ellas). */
  const deuda = (diasMax: number) => ({
    vencidas: { cantidad: 1, montos: { USD: 900 }, diasMax },
    sinFacturarAtrasadas: { cantidad: 0, diasMax: 0 },
    promesasIncumplidas: 0,
    ultimoPago: null,
  });

  it("una cuenta sana va en verde y dice por qué", () => {
    const s = saludDeLaCuenta(cuenta("sana"), HOY);
    expect(s.salud).toBe("saludable");
    expect(s.porque).toBe("Va bien: entrega al día, uso 60 de 100 y último contacto hace 3 días.");
  });

  it("⭐ una alerta del agente NO pinta la cuenta: se ve aparte y se resuelve en la lista", () => {
    /* La edición que pone esto en rojo: volver a sacar el color de los motivos (alertaAlta es alta). */
    const c = cuenta("kolbi", { alertas: [alerta({ severidad: "HIGH" })] });
    expect(saludDeLaCuenta(c, HOY).salud).toBe("saludable");
    const [fila] = listaParaLlamar([c], HOY);
    expect(fila).toMatchObject({ salud: "saludable", principal: { clave: "alertaDelAgente" } });
    expect(fila.alertas.map((a) => a.id)).toEqual(["a1"]);
  });

  it("⭐ como kölbi: uso cayendo → amarillo, con su porqué en una línea", () => {
    const s = saludDeLaCuenta(cuenta("kolbi", { crudo: { hs_last_4_weeks_usage_score_trend: "-0.08" } }), HOY);
    expect(s.salud).toBe("en-friccion");
    expect(s.porque).toMatch(/^Uso cayendo: 60 de 100, .*8.* en 4 semanas\.$/);
  });

  it("una renovación cerca no pinta sola", () => {
    expect(saludDeLaCuenta(cuenta("x", { crudo: { hs_sales_hub_renewal_date: "2026-11-14" } }), HOY).salud).toBe("saludable");
  });

  it("⭐ renovación cerca CON el uso mal → rojo, en una sola razón", () => {
    const s = saludDeLaCuenta(cuenta("x", { crudo: { hs_sales_hub_renewal_date: "2026-10-31", hs_unified_usage_score: "29" } }), HOY);
    expect(s.salud).toBe("en-riesgo");
    expect(s.razones.map((r) => r.clave)).toEqual(["renuevaEnRiesgo"]);
    expect(s.porque).toBe("Renueva en 27 días con el uso bajo (29 de 100).");
  });

  it("renovación cerca con un proyecto atrasado → rojo", () => {
    const c = cuenta("x", {
      crudo: { hs_sales_hub_renewal_date: "2026-10-31" },
      proyectos: [proyecto({ atraso: { dias: 9, fase: null } })],
    });
    expect(saludDeLaCuenta(c, HOY).porque).toBe("Renueva en 27 días con un proyecto atrasado («Implementación Sales Hub» va 9 días tarde).");
  });

  it("un uso sin puntaje es no saber, no un problema: no pinta", () => {
    expect(saludDeLaCuenta(cuenta("x", { crudo: { hs_unified_usage_score: "" } }), HOY).salud).toBe("saludable");
  });

  it("la deuda vencida NO pinta (el pedido nombra entrega, adopción, relación y renovación): es un motivo para llamar", () => {
    const c = cuenta("x", { facturacion: deuda(38) });
    expect(saludDeLaCuenta(c, HOY).salud).toBe("saludable");
    expect(listaParaLlamar([c], HOY)[0].principal.clave).toBe("facturasVencidas");
  });

  it("con varias señales dice la más grave y cuántas más", () => {
    const s = saludDeLaCuenta(
      cuenta("x", { proyectos: [proyecto({ bloqueado: true })], ultimoContacto: "2026-08-31T00:00:00Z", facturacion: deuda(10) }),
      HOY,
    );
    expect(s.salud).toBe("en-riesgo");
    expect(s.porque).toBe("«Implementación Sales Hub» está bloqueado · y 1 señal más.");
  });

  it("sin proyecto, sin puntaje y sin contacto → gris «Sin datos», no verde", () => {
    const s = saludDeLaCuenta(cuenta("x", { crudo: null, proyectos: [], ultimoContacto: null }), HOY);
    expect(s.salud).toBe("sin-datos");
  });

  it("⭐ la relación pinta solo donde Smarteam acompaña la cuenta (proyecto activo o relación gestionada)", () => {
    /* Medido el 2026-10-07: 32 cuentas en amarillo solo por no tener contacto, sin proyecto ni
       relación gestionada. La edición que lo pone en rojo: sacar `acompanamos` de la regla. */
    const vieja = "2026-05-01T00:00:00Z";
    const noLaAcompanamos = cuenta("x", { crudo: { hs_is_managed: "false", hs_unified_usage_score: "" }, proyectos: [], ultimoContacto: vieja });
    expect(saludDeLaCuenta(noLaAcompanamos, HOY)).toMatchObject({ salud: "sin-datos" });
    expect(saludDeLaCuenta(noLaAcompanamos, HOY).porque).toBe(
      "Smarteam no la acompaña hoy (sin proyecto activo ni relación gestionada en HubSpot) y el último contacto fue hace 156 días.",
    );
    expect(saludDeLaCuenta(cuenta("x", { proyectos: [], ultimoContacto: vieja }), HOY).razones.map((r) => r.clave)).toEqual(["fria"]);
    expect(saludDeLaCuenta(cuenta("x", { crudo: null, ultimoContacto: vieja }), HOY).razones.map((r) => r.clave)).toEqual(["fria"]);
  });

  it("con proyecto activo y ningún contacto en 6 meses → amarillo", () => {
    expect(saludDeLaCuenta(cuenta("x", { ultimoContacto: null }), HOY)).toMatchObject({
      salud: "en-friccion",
      razones: [{ clave: "sinContacto" }],
    });
  });

  it("la lista va por color: rojo, amarillo, sin datos, verde", () => {
    const lista = listaParaLlamar(
      [
        cuenta("verde-con-alerta", { alertas: [alerta()] }),
        cuenta("amarilla", { proyectos: [proyecto({ atraso: { dias: 9, fase: null } })] }),
        cuenta("gris", { crudo: null, proyectos: [], ultimoContacto: null }),
        cuenta("roja", { proyectos: [proyecto({ bloqueado: true })] }),
      ],
      HOY,
    );
    expect(lista.map((f) => f.clientId)).toEqual(["roja", "amarilla", "gris", "verde-con-alerta"]);
  });
});

describe("⭐ la vista «Alertas»: la revisión del día", () => {
  it("trae las alertas de TODAS las cuentas, también las que no tienen motivo para llamar", () => {
    /* Un aviso de renovación (delAgente: false) no es un motivo: sin esta vista no había dónde cerrarlo. */
    const aviso = alerta({ id: "r1", delAgente: false, severidad: "MEDIUM", titulo: "Renovación en 60 días" });
    const sana = cuenta("sana", { alertas: [aviso] });
    expect(listaParaLlamar([sana], HOY)).toEqual([]);
    expect(alertasParaRevisar([sana], HOY).map((c) => c.alertas.map((a) => a.id))).toEqual([["r1"]]);
  });

  it("primero las cuentas con una alerta alta; adentro, la más grave y la más nueva primero", () => {
    const r = alertasParaRevisar(
      [
        cuenta("media", { alertas: [alerta({ id: "m1", severidad: "MEDIUM" })] }),
        cuenta("sin", { alertas: [] }),
        cuenta("alta", {
          alertas: [
            alerta({ id: "a-vieja", severidad: "LOW", detectadaEn: "2026-09-01" }),
            alerta({ id: "a-alta", severidad: "HIGH", detectadaEn: "2026-09-02" }),
            alerta({ id: "a-media", severidad: "MEDIUM", detectadaEn: "2026-10-01" }),
          ],
        }),
      ],
      HOY,
    );
    expect(r.map((c) => c.clientId)).toEqual(["alta", "media"]);
    expect(r[0].alertas.map((a) => a.id)).toEqual(["a-alta", "a-media", "a-vieja"]);
  });
});

/** La frase de una queja o un retraso, ya verificada por el runner del vigía. */
const CITA = { texto: "el reporte de ventas sigue sin funcionar", fuente: "reunion" as const, id: "s1", fecha: "2026-10-01", titulo: "Seguimiento" };

describe("⭐ la leyenda de los colores dice lo que hacen las reglas", () => {
  /* Una cuenta por cada razón que pinta. Si una regla cambia de color o de umbral, la razón que da ya
     no es la que dice la leyenda y esto se pone en rojo. */
  const RENUEVA_PRONTO = { hs_sales_hub_renewal_date: "2026-10-31" };
  const casos: CuentaDeCartera[] = [
    cuenta("bloqueado", { proyectos: [proyecto({ bloqueado: true })] }),
    cuenta("cancelacion", { crudo: { hs_cancellation_products: "SERVICE" } }),
    cuenta("renuevaConUsoBajo", { crudo: { ...RENUEVA_PRONTO, hs_unified_usage_score: "29" } }),
    cuenta("renuevaAtrasada", { crudo: RENUEVA_PRONTO, proyectos: [proyecto({ atraso: { dias: 9, fase: null } })] }),
    cuenta("atrasado", { proyectos: [proyecto({ atraso: { dias: 9, fase: null } })] }),
    cuenta("usoCayendo", { crudo: { hs_last_4_weeks_usage_score_trend: "-0.15" } }),
    cuenta("usoBajo", { crudo: { hs_unified_usage_score: "29" } }),
    cuenta("hubSinActivar", { crudo: { hs_is_sales_hub_activated: "false" } }),
    cuenta("fria", { ultimoContacto: "2026-08-31T00:00:00Z" }),
    cuenta("sinContacto", { ultimoContacto: null }),
    // 2026-10-09: quejas y retrasos con la frase verificada, y el motivo de bloqueo sin el estado.
    cuenta("queja", { alertas: [alerta({ categoria: "QUEJA", severidad: "MEDIUM", cita: CITA })] }),
    cuenta("quejaGrave", { alertas: [alerta({ categoria: "QUEJA", severidad: "HIGH", cita: CITA })] }),
    cuenta("retraso", { alertas: [alerta({ categoria: "TIMELINE_OVERDUE", severidad: "MEDIUM", cita: CITA })] }),
    cuenta("retrasoGrave", { alertas: [alerta({ categoria: "TIMELINE_OVERDUE", severidad: "HIGH", cita: CITA })] }),
    cuenta("bloqueoPorMotivo", { proyectos: [proyecto({ motivoBloqueo: "Atraso por Smarteam" })] }),
  ];
  const resultados = casos.map((c) => ({ id: c.clientId, ...saludDeLaCuenta(c, HOY) }));
  const dan = new Set(resultados.flatMap((r) => r.razones.map((x) => x.clave)));
  const dice = new Set(QUE_PINTA_CADA_COLOR.map((x) => x.clave));

  it("todo lo que pinta una cuenta está en la leyenda, y nada de la leyenda es inventado", () => {
    expect([...dan].filter((k) => !dice.has(k)), "las reglas dan esto y la leyenda no lo dice").toEqual([]);
    expect([...dice].filter((k) => !dan.has(k)), "la leyenda dice esto y ninguna cuenta lo da").toEqual([]);
  });

  it("cada razón pinta el color que dice la leyenda", () => {
    for (const r of resultados) {
      expect(r.razones, r.id).toHaveLength(1);
      const fila = QUE_PINTA_CADA_COLOR.find((x) => x.clave === r.razones[0].clave)!;
      expect(r.salud, `${r.id} → «${fila.texto}»`).toBe(fila.salud);
    }
  });

  it("cada texto va en el color que pinta", () => {
    const leyenda = leyendaDeSalud();
    for (const fila of QUE_PINTA_CADA_COLOR) {
      expect(leyenda.find((l) => l.salud === fila.salud)!.texto).toContain(fila.texto);
    }
    expect(leyenda.map((l) => l.salud)).toEqual(["en-riesgo", "en-friccion", "en-espera", "saludable", "sin-datos"]);
  });

  it("el índice pinta esta leyenda, no una escrita a mano", () => {
    expect(leer("components/cs/CsPanel.tsx")).toContain("leyendaDeSalud()");
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
