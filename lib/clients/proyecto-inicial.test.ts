import { describe, expect, it } from "vitest";
import { elegirProyectoDeLaFicha, equipoDelProyecto, otrosProyectosDeLaCuenta, proyectoQueAbreLaFicha } from "./proyecto-inicial";

const CS = "826270797";
const DEV = "922785384";
const WEB = "922688687";

const crm = { id: "crm", esPrueba: false, hubspotOwnerEmail: "lmoreno@smarteamcr.com", hubspotPipelineId: CS };
const dev = { id: "dev", esPrueba: false, hubspotOwnerEmail: "bsalas@smarteamcr.com", hubspotPipelineId: DEV };

describe("proyectoQueAbreLaFicha (solo el correo, como antes)", () => {
  it("con un solo proyecto real abre en él, mire quien mire", () => {
    expect(proyectoQueAbreLaFicha([crm], "otra@smarteamcr.com")).toBe("crm");
    expect(proyectoQueAbreLaFicha([crm, { ...dev, esPrueba: true }], null)).toBe("crm");
  });

  it("Cemaco: con dos proyectos, a Liliana le abre el suyo y a Breiner el suyo", () => {
    expect(proyectoQueAbreLaFicha([crm, dev], "lmoreno@smarteamcr.com")).toBe("crm");
    expect(proyectoQueAbreLaFicha([crm, dev], " BSalas@SmarTeamCR.com ")).toBe("dev");
  });

  it("sin rol, quien no lleva ninguno abre en la cuenta", () => {
    expect(proyectoQueAbreLaFicha([crm, dev], "egonzalez@smarteamcr.com")).toBeNull();
    expect(proyectoQueAbreLaFicha([crm, dev], null)).toBeNull();
  });

  it("sin proyectos abre en la cuenta", () => {
    expect(proyectoQueAbreLaFicha([], "lmoreno@smarteamcr.com")).toBeNull();
  });
});

describe("elegirProyectoDeLaFicha: el proyecto que le corresponde a cada quien", () => {
  it("Cemaco: otra CSE cae en el CRM y otro de Desarrollo en «CEMACO »", () => {
    expect(elegirProyectoDeLaFicha([crm, dev], { email: "hgomez@smarteamcr.com", rol: "CSE" })).toEqual({ id: "crm", motivo: "tu-equipo" });
    expect(elegirProyectoDeLaFicha([crm, dev], { email: "asalas@smarteamcr.com", rol: "DEV" })).toEqual({ id: "dev", motivo: "tu-equipo" });
  });

  it("el encargado gana sobre el equipo: un CSE encargado del de Desarrollo cae en ése", () => {
    const devDeUnCse = { ...dev, hubspotOwnerEmail: "lmoreno@smarteamcr.com" };
    const crmDeOtra = { ...crm, hubspotOwnerEmail: "otra@smarteamcr.com" };
    expect(elegirProyectoDeLaFicha([crmDeOtra, devDeUnCse], { email: "lmoreno@smarteamcr.com", rol: "CSE" })).toEqual({ id: "dev", motivo: "lo-llevas" });
  });

  it("dirección y la CSL abren en la cuenta si no llevan uno, y en el suyo si lo llevan", () => {
    expect(elegirProyectoDeLaFicha([crm, dev], { email: "egonzalez@smarteamcr.com", rol: "SUPER_ADMIN" }).id).toBeNull();
    expect(elegirProyectoDeLaFicha([crm, dev], { email: "avanegas@smarteamcr.com", rol: "CSL" }).id).toBeNull();
    expect(elegirProyectoDeLaFicha([crm, { ...dev, hubspotOwnerEmail: "avanegas@smarteamcr.com" }], { email: "avanegas@smarteamcr.com", rol: "CSL" }).id).toBe("dev");
  });

  it("Ventas cae en el proyecto que nació de su venta; sin venta suya, en la cuenta", () => {
    const conVenta = { ...crm, vendedorEmail: "apinzon@smarteamcr.com" };
    expect(elegirProyectoDeLaFicha([conVenta, dev], { email: "apinzon@smarteamcr.com", rol: "VENTAS" })).toEqual({ id: "crm", motivo: "tu-venta" });
    expect(elegirProyectoDeLaFicha([conVenta, dev], { email: "lnavarro@smarteamcr.com", rol: "VENTAS" }).id).toBeNull();
  });

  it("Marketing y Finanzas, sin proyecto propio, abren en la cuenta", () => {
    expect(elegirProyectoDeLaFicha([crm, dev], { email: "aortega@smarteamcr.com", rol: "MARKETING" }).id).toBeNull();
    expect(elegirProyectoDeLaFicha([crm, dev], { email: "dinia@smarteamcr.com", rol: "ADMIN" }).id).toBeNull();
  });

  it("con varios del equipo gana el más vivo: no parado, y después la actividad más reciente", () => {
    const viejo = { ...crm, id: "viejo", hubspotOwnerEmail: null, hubspotUltimaActividad: "2026-09-01" };
    const reciente = { ...crm, id: "reciente", hubspotOwnerEmail: null, hubspotUltimaActividad: "2026-10-15" };
    const bloqueado = { ...crm, id: "bloq", hubspotOwnerEmail: null, hubspotUltimaActividad: "2026-10-18", hubspotPipelineStageLabel: "Bloqueado" };
    const pausa = { ...crm, id: "pausa", hubspotOwnerEmail: null, hubspotUltimaActividad: "2026-10-19", hubspotStatus: "on_hold" };
    expect(elegirProyectoDeLaFicha([viejo, bloqueado, pausa, reciente, dev], { email: "hgomez@smarteamcr.com", rol: "CSE" }).id).toBe("reciente");
  });

  it("quien lleva varios cae en el de su equipo y, entre ésos, en el más vivo", () => {
    const a = { ...crm, id: "a", hubspotUltimaActividad: "2026-10-01" };
    const b = { ...crm, id: "b", hubspotUltimaActividad: "2026-10-10" };
    const d = { ...dev, id: "d", hubspotOwnerEmail: "lmoreno@smarteamcr.com", hubspotUltimaActividad: "2026-10-18" };
    expect(elegirProyectoDeLaFicha([a, b, d], { email: "lmoreno@smarteamcr.com", rol: "CSE" })).toEqual({ id: "b", motivo: "lo-llevas" });
    // Dirección que lleva varios: el más vivo de los suyos.
    expect(elegirProyectoDeLaFicha([a, b, d].map((p) => ({ ...p, hubspotOwnerEmail: "msalas@smarteamcr.com" })), { email: "msalas@smarteamcr.com", rol: "SUPER_ADMIN" }).id).toBe("d");
  });

  it("un proyecto de prueba no abre solo aunque sea de quien mira", () => {
    const prueba = { ...dev, id: "prueba", esPrueba: true, hubspotOwnerEmail: "hgomez@smarteamcr.com" };
    expect(elegirProyectoDeLaFicha([crm, prueba, { ...crm, id: "crm2", hubspotOwnerEmail: null }], { email: "hgomez@smarteamcr.com", rol: "DEV" }).id).toBeNull();
  });
});

describe("equipoDelProyecto", () => {
  it("Desarrollo es de Desarrollo; implementación, sitio web y sin pipeline, de Customer Success", () => {
    expect(equipoDelProyecto({ hubspotPipelineId: DEV })).toBe("dev");
    expect(equipoDelProyecto({ hubspotPipelineId: CS })).toBe("cs");
    expect(equipoDelProyecto({ hubspotPipelineId: WEB })).toBe("cs");
    expect(equipoDelProyecto({ hubspotPipelineId: null })).toBe("cs");
  });
});

describe("otrosProyectosDeLaCuenta", () => {
  const filas = [
    { id: "crm", name: "Cemaco Internacional - CRM", hubspotPipelineId: CS, hubspotOwnerName: "Liliana Moreno" },
    { id: "dev", name: "CEMACO ", hubspotPipelineId: DEV, hubspotOwnerName: "Breiner Salas" },
    { id: "p", name: "Prueba", esPrueba: true },
  ];
  it("Cemaco: desde el CRM, nombra el de Desarrollo con su tipo y su encargado; nunca el de prueba", () => {
    expect(otrosProyectosDeLaCuenta(filas, "crm")).toEqual([{ id: "dev", nombre: "CEMACO", tipo: "Desarrollo e integración", encargado: "Breiner" }]);
  });
  it("en la cuenta (o con un id que no es un proyecto) no dice nada", () => {
    expect(otrosProyectosDeLaCuenta(filas, null)).toEqual([]);
    expect(otrosProyectosDeLaCuenta(filas, "__strategy__")).toEqual([]);
  });
});
