import { describe, expect, it } from "vitest";
import { leerPartner } from "./lectura-partner";
import type { CuentaDeCartera, ProyectoDeCuenta } from "./cartera-reglas";
import {
  RELACIONES,
  clasificarCuenta,
  estadoDelDato,
  filasDeLaCartera,

  leerDescartes,
  pendientesDeConfirmar,
  proponerMomento,
  proponerPotencial,
  proponerRelacion,
  type ClasificacionGuardada,
} from "./clasificacion";

const HOY = "2026-10-07";

const proyecto = (o: Partial<ProyectoDeCuenta> = {}): ProyectoDeCuenta => ({
  id: "p1",
  nombre: "Implementación Sales Hub",
  etapa: "Diagnóstico",
  etapaClave: "DIAGNOSTICO",
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

/** Licencias activas, uso 60 solo en Sales Hub (una oportunidad: un hub que no tiene), renueva lejos. */
const CRUDO = {
  hs_is_active: "true",
  hs_is_managed: "true",
  hs_unified_usage_score: "60",
  hs_has_sales_hub: "true",
  hs_is_sales_hub_activated: "true",
  hs_sales_hub_usage_score: "60",
  hs_sales_hub_renewal_date: "2027-06-01",
  hs_total_subscription_mrr: "400",
  hs_managed_local_mrr_currency: "USD",
};

const cuenta = (o: Partial<CuentaDeCartera> & { crudo?: Record<string, string> | null } = {}): CuentaDeCartera => {
  const { crudo, ...resto } = o;
  return {
    clientId: "c1",
    nombre: "Cuenta",
    partner: crudo === null ? null : leerPartner({ ...CRUDO, ...(crudo ?? {}) }),
    proyectos: [],
    ultimoContacto: "2026-10-01T15:00:00Z",
    ticketsAbiertos: 0,
    alertas: [],
    facturacion: null,
    licenciasManuales: [],
    ...resto,
  };
};

const pago = (ultimoPago: string) => ({
  vencidas: { cantidad: 0, montos: {}, diasMax: 0 },
  sinFacturarAtrasadas: { cantidad: 0, diasMax: 0 },
  promesasIncumplidas: 0,
  ultimoPago,
});

describe("tipo de relación", () => {
  it("un servicio recurrente activo en Cobranza manda, aunque también haya un proyecto en curso", () => {
    const p = proponerRelacion(cuenta({ serviciosRecurrentes: 1, proyectos: [proyecto()] }), HOY);
    expect(p.valor).toBe("recurrente");
    expect(p.razon).toBe("1 servicio recurrente activo en Cobranza, y «Implementación Sales Hub» en curso");
  });

  it("un proyecto en operación continua también es recurrente", () => {
    const p = proponerRelacion(cuenta({ proyectos: [proyecto({ nombre: "Continuidad CRM", etapaClave: "OPERACION_CONTINUA" })] }), HOY);
    expect(p).toMatchObject({ valor: "recurrente", razon: "«Continuidad CRM» en operación continua" });
  });

  it("un proyecto en curso, sin servicio recurrente", () => {
    expect(proponerRelacion(cuenta({ proyectos: [proyecto(), proyecto({ id: "p2" })] }), HOY)).toMatchObject({
      valor: "proyecto",
      razon: "«Implementación Sales Hub» y 1 proyecto más en curso",
    });
  });

  it("sin proyecto ni servicio, con licencias activas → solo licencias", () => {
    expect(proponerRelacion(cuenta(), HOY).valor).toBe("licencias");
  });

  it("nada activo y algo en el último año → sin servicio activo", () => {
    const p = proponerRelacion(cuenta({ crudo: null, facturacion: pago("2026-05-15") }), HOY);
    expect(p).toMatchObject({ valor: "sin-servicio", razon: "Sin proyecto, servicio ni licencias activas; lo último fue el 15 may" });
  });

  it("⭐ nada activo desde hace más de un año → excliente", () => {
    const p = proponerRelacion(cuenta({ crudo: null, ultimoCierre: "2025-08-01", facturacion: pago("2025-06-30") }), HOY);
    expect(p).toMatchObject({ valor: "excliente", razon: "Nada activo desde el 1 ago 2025" });
  });

  it("sin ningún rastro no se afirma que fue cliente: sin servicio activo", () => {
    expect(proponerRelacion(cuenta({ crudo: null }), HOY)).toMatchObject({ valor: "sin-servicio", razon: "Nexus no ve proyecto, servicio ni licencias activas" });
  });
});

describe("potencial (⚠ cortes a calibrar con Alex)", () => {
  it("con TAM manda el TAM", () => {
    expect(proponerPotencial(cuenta({ tamUsd: 45_000 }), HOY).valor).toBe("alto");
    expect(proponerPotencial(cuenta({ tamUsd: 12_000 }), HOY).valor).toBe("medio");
    expect(proponerPotencial(cuenta({ tamUsd: 4_000 }), HOY).valor).toBe("bajo");
  });

  it("sin TAM ni licencias activas no se adivina: sin estimar", () => {
    expect(proponerPotencial(cuenta({ crudo: null, facturacion: pago("2026-09-30") }), HOY).valor).toBe("sin-estimar");
  });

  it("una oportunidad y paga poco → medio, y dice cuál", () => {
    const p = proponerPotencial(cuenta(), HOY);
    expect(p.valor).toBe("medio");
    expect(p.razon).toMatch(/^1 oportunidad: Usa bien Sales Hub \(60\) y no tiene Marketing Hub · paga US\$400 al mes en licencias$/);
  });

  it("una oportunidad y paga mucho → alto", () => {
    expect(proponerPotencial(cuenta({ crudo: { hs_total_subscription_mrr: "2500" } }), HOY).valor).toBe("alto");
  });

  it("sin oportunidades y paga poco → bajo", () => {
    expect(proponerPotencial(cuenta({ crudo: { hs_sales_hub_usage_score: "20", hs_unified_usage_score: "20" } }), HOY).valor).toBe("bajo");
  });
});

describe("momento", () => {
  it("una cancelación registrada es salida, antes que todo", () => {
    expect(proponerMomento(cuenta({ crudo: { hs_cancellation_products: "SALES" }, proyectos: [proyecto()] }), HOY).valor).toBe("salida");
  });

  it("renovación a 90 días o menos", () => {
    expect(proponerMomento(cuenta({ crudo: { hs_sales_hub_renewal_date: "2026-11-30" }, proyectos: [proyecto()] }), HOY)).toMatchObject({
      valor: "renovacion",
      razon: "Renueva el 30 nov",
    });
  });

  it("arranque, implementación y adopción salen de la etapa del ciclo", () => {
    expect(proponerMomento(cuenta({ proyectos: [proyecto({ etapaClave: "HAND_OFF" })] }), HOY).valor).toBe("arranque");
    expect(proponerMomento(cuenta({ proyectos: [proyecto()] }), HOY).valor).toBe("implementacion");
    expect(proponerMomento(cuenta({ proyectos: [proyecto({ etapaClave: "ADOPCION", etapa: "Adopción" })] }), HOY).valor).toBe("adopcion");
    // Un desarrollo no tiene ciclo: si está activo, es implementación.
    expect(proponerMomento(cuenta({ proyectos: [proyecto({ etapaClave: null })] }), HOY).valor).toBe("implementacion");
  });

  it("⭐ un proyecto que cerró hace poco deja la cuenta en adopción (termina un proyecto y no sigue nada)", () => {
    const p = proponerMomento(cuenta({ proyectos: [proyecto({ activo: false, cerradoEn: "2026-09-20" })] }), HOY);
    expect(p).toMatchObject({ valor: "adopcion", razon: "«Implementación Sales Hub» cerró hace 17 días" });
  });

  it("una preventa abierta es expansión", () => {
    expect(proponerMomento(cuenta({ preventaViva: true }), HOY).valor).toBe("expansion");
  });

  it("solo licencias o servicio recurrente sin proyecto → recurrente; sin nada → sin actividad", () => {
    expect(proponerMomento(cuenta(), HOY).valor).toBe("recurrente");
    expect(proponerMomento(cuenta({ crudo: null }), HOY).valor).toBe("inactiva");
  });
});

describe("⭐ lo confirmado contra lo propuesto", () => {
  const guardada = (o: Partial<ClasificacionGuardada> = {}): ClasificacionGuardada => ({
    relacion: null,
    relacionPor: null,
    relacionEn: null,
    potencial: null,
    potencialPor: null,
    potencialEn: null,
    momento: null,
    momentoPor: null,
    momentoEn: null,
    descartes: {},
    ...o,
  });
  const propuesta = { valor: "adopcion", razon: "x", huella: "adopcion:p1" };

  it("sin confirmar, la propuesta se muestra y es lo que vale", () => {
    expect(estadoDelDato("momento", propuesta, null)).toMatchObject({ sugerir: true, vigente: "adopcion", confirmado: null });
  });

  it("confirmado igual a lo propuesto: no hay nada que sugerir", () => {
    expect(estadoDelDato("momento", propuesta, guardada({ momento: "adopcion", momentoPor: "alex@x" }))).toMatchObject({
      sugerir: false,
      confirmadoPor: "alex@x",
    });
  });

  it("la cuenta cambió: lo confirmado sigue valiendo y Nexus propone lo nuevo", () => {
    expect(estadoDelDato("momento", propuesta, guardada({ momento: "implementacion" }))).toMatchObject({ sugerir: true, vigente: "implementacion" });
  });

  it("lo descartado no vuelve hasta que cambia la huella", () => {
    const g = guardada({ momento: "implementacion", descartes: { momento: { valor: "adopcion", huella: "adopcion:p1" } } });
    expect(estadoDelDato("momento", propuesta, g).sugerir).toBe(false);
    expect(estadoDelDato("momento", { ...propuesta, huella: "adopcion:p1,p2" }, g).sugerir).toBe(true);
  });

  it("cuenta las pendientes de una cuenta", () => {
    const cl = clasificarCuenta(cuenta({ clasificacion: guardada({ relacion: "licencias" }) }), HOY);
    expect(pendientesDeConfirmar(cl)).toBe(2);
  });

  it("los descartes se leen con tolerancia", () => {
    expect(leerDescartes({ momento: { valor: "a", huella: "b" }, relacion: "basura", otro: 1 })).toEqual({ momento: { valor: "a", huella: "b" } });
    expect(leerDescartes(null)).toEqual({});
  });

  it("cada valor tiene un nombre distinto", () => {
    expect(new Set(RELACIONES.map((r) => r.nombre)).size).toBe(RELACIONES.length);
  });
});

describe("⭐ un excliente confirmado manda sobre lo que sigue activo (2026-10-17)", () => {
  const confirmadaExcliente: ClasificacionGuardada = {
    relacion: "excliente",
    relacionPor: "avanegas@smarteamcr.com",
    relacionEn: "2026-10-17T15:00:00Z",
    potencial: null,
    potencialPor: null,
    potencialEn: null,
    momento: null,
    momentoPor: null,
    momentoEn: null,
    descartes: {},
  };

  it("con un proyecto activo, Nexus no le propone «Proyecto en curso»", () => {
    const c = cuenta({ proyectos: [proyecto()], clasificacion: confirmadaExcliente });
    const cl = clasificarCuenta(c, HOY);
    expect(cl.relacion.propuesta.valor).toBe("proyecto");
    expect(cl.relacion.sugerir).toBe(false);
    expect(cl.relacion.vigente).toBe("excliente");
  });

  it("en la cartera sale marcada, con lo que sigue activo para cerrarlo", () => {
    const [f] = filasDeLaCartera([cuenta({ proyectos: [proyecto()], serviciosRecurrentes: 1, clasificacion: confirmadaExcliente, enCartera: false })], HOY);
    expect(f.excliente).toEqual({ sigueActivo: "Sigue con 1 proyecto activo en HubSpot, 1 servicio recurrente activo en Cobranza, licencias activas en HubSpot" });
    expect(f.enCartera).toBe(false);
  });

  it("lo propuesto no cuenta: sin confirmar, no hay marca", () => {
    const [f] = filasDeLaCartera([cuenta({ crudo: null })], HOY);
    expect(f.excliente).toBeNull();
  });

  it("Nexus propone «excliente» cuando la cancelación de HubSpot ya corrió y no queda nada activo", () => {
    const c = cuenta({
      crudo: { hs_is_active: "false", hs_cancellation_products: "sales", hs_next_cancellation_date: "2026-09-30" },
      facturacion: pago("2026-09-15"),
    });
    const p = proponerRelacion(c, HOY);
    expect(p.valor).toBe("excliente");
    expect(p.razon).toMatch(/^HubSpot registró la cancelación el /);
  });
});
