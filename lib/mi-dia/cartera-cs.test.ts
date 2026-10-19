import { describe, expect, it } from "vitest";
import {
  encargadosDelPase,
  filtrarEmpresas,
  motivosDeAtencion,
  negociosDeLaEmpresa,
  opcionesDeFiltros,
  paraAtender,
  tieneDondeHacerElPase,
  porCse,
  renuevanPronto,
  saludDeCs,
  SIN_FILTROS,
  sinContacto,
  todas,
  tendenciaDeLaFraccion,
  usoDeHubspot,
  type EmpresaDeCs,
  type ProyectoDeCs,
} from "./cartera-cs";

const HOY = "2026-10-17";

function proyecto(p: Partial<ProyectoDeCs> = {}): ProyectoDeCs {
  return { id: "p1", nombre: "Implementación", pipeline: "customer-success", etapa: "Diagnóstico", encargado: "Ana", bloqueado: false, atrasoDias: null, hubspotUrl: null, ...p };
}

function empresa(e: Partial<EmpresaDeCs> = {}): EmpresaDeCs {
  return {
    clientId: "c1",
    nombre: "Acme",
    cse: { nombre: "Ana", email: "ana@smarteamcr.com" },
    cseDeBaja: null,
    tuya: true,
    salud: "bien",
    porque: "Va bien",
    motivos: [],
    proyectos: [proyecto()],
    ultimoContacto: "2026-10-15T16:00:00.000Z",
    proxima: null,
    calendarioLeido: true,
    accion: { numero: 12, titulo: "Revisar el pipeline" },
    renovacion: null,
    relacion: null,
    contactos: 3,
    ticketsAbiertos: 0,
    negocios: null,
    uso: null,
    invitados: [],
    ...e,
  };
}

describe("el pase de cuenta en la cartera", () => {
  it("muestra los encargados de Customer Success y SmartLoop, sin repetir", () => {
    const e = empresa({
      proyectos: [
        proyecto({ id: "a", encargado: "Caroline Bersot" }),
        proyecto({ id: "b", pipeline: "smartloop", encargado: "Caroline Bersot" }),
        proyecto({ id: "c", pipeline: "smartloop", encargado: "Heiver Gómez" }),
      ],
    });
    expect(encargadosDelPase(e)).toEqual(["Caroline Bersot", "Heiver Gómez"]);
  });

  it("los de Desarrollo no: el pase no los toca", () => {
    const e = empresa({ proyectos: [proyecto({ encargado: "Caroline Bersot" }), proyecto({ id: "d", pipeline: "development", encargado: "Breiner Salas" })] });
    expect(encargadosDelPase(e)).toEqual(["Caroline Bersot"]);
  });

  it("sin encargado no inventa uno", () => {
    expect(encargadosDelPase(empresa({ proyectos: [proyecto({ encargado: null })] }))).toEqual([]);
  });

  it("solo con desarrollo no hay dónde hacer el pase", () => {
    expect(tieneDondeHacerElPase(empresa({ proyectos: [proyecto({ pipeline: "development" })] }))).toBe(false);
    expect(tieneDondeHacerElPase(empresa())).toBe(true);
  });
});

describe("saludDeCs", () => {
  it("traduce la salud de Éxito del cliente", () => {
    expect(saludDeCs("en-riesgo")).toBe("riesgo");
    expect(saludDeCs("en-friccion")).toBe("senales");
    expect(saludDeCs("saludable")).toBe("bien");
    expect(saludDeCs("otra")).toBe("sin-datos");
  });
});

describe("motivosDeAtencion", () => {
  it("una cuenta al día no pide nada (sin reunión no es motivo)", () => {
    expect(motivosDeAtencion(empresa({ proxima: null }), HOY)).toEqual([]);
  });

  it("junta los motivos del más urgente al menos", () => {
    const m = motivosDeAtencion(
      empresa({ salud: "riesgo", accion: null, ultimoContacto: "2026-09-01T12:00:00.000Z", proyectos: [proyecto({ bloqueado: true, nombre: "CRM" })] }),
      HOY,
    );
    expect(m.map((x) => x.clave)).toEqual(["riesgo", "bloqueado", "sin-contacto", "sin-accion"]);
    expect(m[1].texto).toBe("Bloqueado: CRM");
    expect(m[2].texto).toBe("Sin contacto hace 46 días");
  });

  it("21 días sin contacto ya pide atención; 20 no", () => {
    expect(motivosDeAtencion(empresa({ ultimoContacto: "2026-09-26" }), HOY).map((x) => x.clave)).toEqual(["sin-contacto"]);
    expect(motivosDeAtencion(empresa({ ultimoContacto: "2026-09-27" }), HOY)).toEqual([]);
    expect(motivosDeAtencion(empresa({ ultimoContacto: null }), HOY)[0].texto).toBe("Sin contacto registrado");
  });

  it("la renovación cuenta a 30 días o menos, y la relación con HubSpot en ámbar", () => {
    expect(motivosDeAtencion(empresa({ renovacion: "2026-11-16" }), HOY)[0].texto).toBe("Renueva en 30 días");
    expect(motivosDeAtencion(empresa({ renovacion: "2026-11-17" }), HOY)).toEqual([]);
    expect(motivosDeAtencion(empresa({ relacion: { corto: "Vence en 12 días", tono: "ambar" } }), HOY)[0].texto).toBe("HubSpot: Vence en 12 días");
    expect(motivosDeAtencion(empresa({ relacion: { corto: "Gestionada", tono: "verde" } }), HOY)).toEqual([]);
  });
});

describe("las vistas", () => {
  const riesgo = empresa({ clientId: "r", nombre: "Zeta", salud: "riesgo" });
  const senales = empresa({ clientId: "s", nombre: "Beta", salud: "senales", accion: null });
  const bien = empresa({ clientId: "b", nombre: "Alfa" });
  const fria = empresa({ clientId: "f", nombre: "Fría", ultimoContacto: "2026-08-01" });
  const nunca = empresa({ clientId: "n", nombre: "Nunca", ultimoContacto: null, cse: null });

  it("«Para atender» pone primero lo más urgente y deja afuera lo que está al día", () => {
    expect(paraAtender([bien, senales, riesgo, fria], HOY).map((x) => x.empresa.clientId)).toEqual(["r", "s", "f"]);
  });

  it("«Sin contacto»: la que nunca tuvo, después la más vieja", () => {
    expect(sinContacto([bien, fria, nunca], HOY).map((e) => e.clientId)).toEqual(["n", "f"]);
  });

  it("«Renuevan pronto» mira 90 días", () => {
    const a = empresa({ clientId: "a", renovacion: "2026-12-01" });
    const b = empresa({ clientId: "b", renovacion: "2026-10-20" });
    const lejos = empresa({ clientId: "c", renovacion: "2027-03-01" });
    expect(renuevanPronto([a, lejos, b], HOY).map((e) => e.clientId)).toEqual(["b", "a"]);
  });

  it("«Todos» va por color y después por nombre", () => {
    expect(todas([bien, senales, riesgo]).map((e) => e.clientId)).toEqual(["r", "s", "b"]);
  });

  it("«Por CSE» en orden alfabético, sin CSE al final, con sus cuentas", () => {
    const deLuis = empresa({ clientId: "l", nombre: "Luis SA", cse: { nombre: "Luis", email: "luis@x.com" }, salud: "riesgo" });
    const g = porCse([deLuis, bien, nunca, senales], HOY);
    expect(g.map((x) => x.cse?.nombre ?? null)).toEqual(["Ana", "Luis", null]);
    expect(g[0]).toMatchObject({ proyectos: 2, enRiesgo: 0, sinAccion: 1 });
    expect(g[1].enRiesgo).toBe(1);
    expect(g[2].sinContacto).toBe(1);
  });
});

describe("filtrarEmpresas", () => {
  const dev = proyecto({ id: "p2", nombre: "Integración SAP", pipeline: "development", etapa: "Desarrollo", encargado: "Brainer" });
  const acme = empresa({ proyectos: [proyecto(), dev] });
  const otra = empresa({ clientId: "c2", nombre: "Bolsa Ñandú", cse: null, salud: null });

  it("busca en la empresa, los proyectos y quién los lleva, sin tildes", () => {
    expect(filtrarEmpresas([acme, otra], { ...SIN_FILTROS, texto: "brainer" }).map((e) => e.clientId)).toEqual(["c1"]);
    expect(filtrarEmpresas([acme, otra], { ...SIN_FILTROS, texto: "nandu" }).map((e) => e.clientId)).toEqual(["c2"]);
  });

  it("el pipeline recorta los proyectos de cada empresa", () => {
    const r = filtrarEmpresas([acme, otra], { ...SIN_FILTROS, pipeline: "development" });
    expect(r).toHaveLength(2 - 1);
    expect(r[0].proyectos.map((p) => p.id)).toEqual(["p2"]);
  });

  it("el CSE, «sin CSE» y «sin color»", () => {
    expect(filtrarEmpresas([acme, otra], { ...SIN_FILTROS, cse: "ana@smarteamcr.com" }).map((e) => e.clientId)).toEqual(["c1"]);
    expect(filtrarEmpresas([acme, otra], { ...SIN_FILTROS, cse: "sin" }).map((e) => e.clientId)).toEqual(["c2"]);
    expect(filtrarEmpresas([acme, otra], { ...SIN_FILTROS, color: "ninguno" }).map((e) => e.clientId)).toEqual(["c2"]);
    expect(filtrarEmpresas([acme, otra], { ...SIN_FILTROS, color: "bien" }).map((e) => e.clientId)).toEqual(["c1"]);
  });

  it("las opciones salen de la cartera", () => {
    const o = opcionesDeFiltros([acme, otra]);
    expect(o.cses).toEqual([{ clave: "ana@smarteamcr.com", nombre: "Ana" }]);
    expect(o.haySinCse).toBe(true);
    expect(o.pipelines).toEqual(["customer-success", "development"]);
    expect(o.etapas).toEqual(["Desarrollo", "Diagnóstico"]);
  });
});

describe("negociosDeLaEmpresa", () => {
  it("suma los dólares, cuenta las otras monedas y deja afuera los pausados", () => {
    expect(
      negociosDeLaEmpresa([
        { monto: 1000, moneda: "USD", etapa: "Propuesta" },
        { monto: 500, moneda: "usd", etapa: "Negociación" },
        { monto: 9000, moneda: "CRC", etapa: "Propuesta" },
        { monto: 4000, moneda: "USD", etapa: "Pausados" },
        { monto: null, moneda: "USD", etapa: "Calificación" },
      ]),
    ).toEqual({ cantidad: 4, montoUsd: 1500, otrasMonedas: 1 });
  });

  it("sin negocios activos no hay nada", () => {
    expect(negociosDeLaEmpresa([{ monto: 1, moneda: "USD", etapa: "Pausado" }])).toBeNull();
    expect(negociosDeLaEmpresa([])).toBeNull();
  });
});

describe("usoDeHubspot", () => {
  const hub = (h: "marketing" | "sales" | "service" | "operations", uso: number | null) => ({
    hub: h,
    nombre: h,
    plan: "Professional",
    activado: true,
    uso,
    porActivar: [],
    licencias: null,
    renovacion: null,
    montoMensual: null,
  });
  const partner = (o: Partial<Parameters<typeof usoDeHubspot>[0]["partner"] & object> = {}) => ({
    uso: 62,
    tendencia: 0.01,
    hubs: [hub("sales", 50), hub("service", 70)],
    gestionada: true,
    relacionGestionadaTermino: null,
    ...o,
  });
  // La copia semanal: la más nueva es la W42 y hace 4 semanas, la W38.
  const historial = [
    { semana: "2026-W42", uso: 62, porHub: { sales: 50, service: 70 } },
    { semana: "2026-W38", uso: 60, porHub: { sales: 60, service: 69 } },
  ];

  it("muestra el UUS con su tendencia y, sin un hub que baje, ningún hub", () => {
    const u = usoDeHubspot({ partner: partner(), historial: [{ semana: "2026-W42", uso: 62, porHub: { sales: 50 } }, { semana: "2026-W38", uso: 60, porHub: { sales: 49 } }], hoyISO: HOY });
    expect(u).toEqual({ estado: "con-uso", uso: 62, tendencia: "igual", hubs: [] });
  });

  it("si un hub que compró baja, muestra los hubs que compró, cada uno con su tendencia", () => {
    const u = usoDeHubspot({ partner: partner({ tendencia: -0.12 }), historial, hoyISO: HOY });
    expect(u).toEqual({
      estado: "con-uso",
      uso: 62,
      tendencia: "baja",
      hubs: [
        { hub: "sales", uso: 50, tendencia: "baja" },
        { hub: "service", uso: 70, tendencia: "igual" },
      ],
    });
  });

  it("solo los hubs con puntaje que la cuenta tiene (Operations no da puntaje)", () => {
    const u = usoDeHubspot({ partner: partner({ hubs: [hub("sales", 40), hub("operations", null)] }), historial, hoyISO: HOY });
    expect(u.estado === "con-uso" && u.hubs.map((h) => h.hub)).toEqual(["sales"]);
  });

  it("sin la copia de hace 4 semanas no inventa la tendencia de un hub", () => {
    const u = usoDeHubspot({ partner: partner({ tendencia: null }), historial: [historial[0]], hoyISO: HOY });
    expect(u).toEqual({ estado: "con-uso", uso: 62, tendencia: null, hubs: [] });
  });

  it("sin HubSpot Partner: sin uso, sin relación ni último puntaje", () => {
    expect(usoDeHubspot({ partner: null, usoAnterior: { uso: 40, fecha: "2026-07-01" }, hoyISO: HOY })).toEqual({ estado: "sin-uso", terminoLaRelacion: null, ultimo: null });
  });

  it("si la relación gestionada terminó, lo dice con el último puntaje", () => {
    const u = usoDeHubspot({
      partner: partner({ uso: null, gestionada: false, relacionGestionadaTermino: "2026-08-20" }),
      usoAnterior: { uso: 41, fecha: "2026-08-10" },
      hoyISO: HOY,
    });
    expect(u).toEqual({ estado: "sin-uso", terminoLaRelacion: "2026-08-20", ultimo: { uso: 41, fecha: "2026-08-10" } });
  });

  it("gestionada y sin puntaje: sin uso, sin decir que terminó", () => {
    expect(usoDeHubspot({ partner: partner({ uso: null }), hoyISO: HOY })).toEqual({ estado: "sin-uso", terminoLaRelacion: null, ultimo: null });
  });

  it("la tendencia usa el umbral de «uso cayendo» de Éxito del cliente (5 %)", () => {
    expect(tendenciaDeLaFraccion(-0.06)).toBe("baja");
    expect(tendenciaDeLaFraccion(-0.05)).toBe("igual");
    expect(tendenciaDeLaFraccion(0.06)).toBe("sube");
    expect(tendenciaDeLaFraccion(null)).toBeNull();
  });
});
