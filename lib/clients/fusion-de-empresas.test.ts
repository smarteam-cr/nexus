/**
 * lib/clients/fusion-de-empresas.test.ts
 *
 * Correr: `npx vitest run lib/clients/fusion-de-empresas.test.ts --project unit`.
 *
 * La fusión de las dos fichas de Librería Internacional (2026-10-01), con sus datos reales: la que sigue es la de las
 * 30 reuniones (dcc.cr, empresa 28872445070, cuenta en colones con razón social); la absorbida, la del cliente de Odoo
 * (libreriainternacional.com, empresa 47341146427, cuenta en dólares). En HubSpot las dos quedaron dentro de
 * 58805575479.
 */
import { describe, it, expect } from "vitest";
import {
  DATOS_DE_LA_CLASIFICACION,
  destinoUnoAUno,
  dominioDeCompany,
  idDeHubspotFinal,
  juntarNotas,
  plegarClasificacion,
  plegarCuenta,
  plegarFicha,
  repartirSinChocar,
  resolverChoques,
  textoDeFusionDeCuenta,
  type CuentaParaFusionar,
  type FichaParaFusionar,
} from "./fusion-de-empresas";
import type { VeredictoDeFusion } from "@/lib/hubspot/empresa-fusionada";
import { DATOS_DE_CLASIFICACION } from "@/lib/cs/clasificacion";

const ficha = (p: Partial<FichaParaFusionar>): FichaParaFusionar => ({
  id: "x",
  name: "x",
  company: null,
  industry: null,
  notes: null,
  emailDomains: [],
  logoUrl: null,
  logoDarkUrl: null,
  logoScale: null,
  kind: "CLIENTE",
  isProspect: false,
  ignoredHubspotServiceIds: [],
  canvas: null,
  canvasConfidence: null,
  ficha: null,
  tamUsd: null,
  ...p,
});
const SIGUE = ficha({
  id: "cmtum4orn00bd07lg0if1q51q",
  name: "Librería Internacional (Desarrollos Culturales Costa Rica)",
  company: "Librería Internacional (Desarrollos Culturales Costa Rica)",
  emailDomains: ["dcc.cr"],
});
const ABSORBIDA = ficha({ id: "cmrf4wzfv00aq7gij2fbv1c59", name: "Librería Internacional", emailDomains: ["libreriainternacional.com"], logoUrl: "https://x/logo.png" });

const cuenta = (p: Partial<CuentaParaFusionar>): CuentaParaFusionar => ({
  id: "c",
  tipo: "NACIONAL",
  viaCobro: "ODOO",
  moneda: "CRC",
  terminosPago: "ANTICIPADO",
  estadoCuenta: "ACTIVA",
  excluidaOperacion: false,
  diaCobroAncla: null,
  creditoDias: null,
  responsableCobroTerceros: null,
  notas: null,
  correoCobro: null,
  razonSocial: null,
  cedulaJuridica: null,
  ...p,
});

describe("la ficha que sigue", () => {
  it("suma los dominios de las dos: son los que mandan las reuniones a la ficha", () => {
    const p = plegarFicha(SIGUE, ABSORBIDA, "2026-10-01");
    expect(p.dominiosNuevos).toEqual(["libreriainternacional.com"]);
    expect(p.cambios.emailDomains).toEqual(["dcc.cr", "libreriainternacional.com"]);
  });

  it("toma de la otra solo lo que le falta, y no pisa lo suyo", () => {
    const p = plegarFicha({ ...SIGUE, industry: "Retail" }, { ...ABSORBIDA, industry: "Educación" }, "2026-10-01");
    expect(p.cambios.logoUrl).toBe("https://x/logo.png");
    expect(p.cambios).not.toHaveProperty("industry");
    expect(p.cambios).not.toHaveProperty("company");
  });

  it("⭐ las notas se juntan: un texto libre que se pierde no se recupera", () => {
    const p = plegarFicha({ ...SIGUE, notes: "Contacto: Ana" }, { ...ABSORBIDA, notes: "Facturar a DCC" }, "2026-10-01");
    expect(p.cambios.notes).toBe("Contacto: Ana\n\n— De «Librería Internacional», que se fusionó en esta ficha el 2026-10-01:\nFacturar a DCC");
    expect(juntarNotas(null, "Facturar a DCC", "x", "2026-10-01")).toBe("Facturar a DCC");
    expect(juntarNotas("Contacto: Ana", null, "x", "2026-10-01")).toBe("Contacto: Ana");
  });

  it("si una de las dos ya es cliente, la que sigue también", () => {
    expect(plegarFicha({ ...SIGUE, kind: "PROSPECTO", isProspect: true }, ABSORBIDA, "2026-10-01").cambios).toMatchObject({ kind: "CLIENTE", isProspect: false });
    expect(plegarFicha(SIGUE, { ...ABSORBIDA, kind: "PROSPECTO" }, "2026-10-01").cambios).not.toHaveProperty("kind");
  });

  it("los servicios de HubSpot ignorados de las dos siguen ignorados", () => {
    const p = plegarFicha({ ...SIGUE, ignoredHubspotServiceIds: ["1"] }, { ...ABSORBIDA, ignoredHubspotServiceIds: ["1", "2"] }, "2026-10-01");
    expect(p.cambios.ignoredHubspotServiceIds).toEqual(["1", "2"]);
  });

  it("el dominio que la absorbida tenía escrito como empresa también cuenta", () => {
    expect(dominioDeCompany("https://www.kamalio.com/inicio")).toBe("kamalio.com");
    expect(dominioDeCompany("Librería Internacional")).toBeNull();
    expect(plegarFicha(SIGUE, { ...ABSORBIDA, emailDomains: [], company: "kamalio.com" }, "2026-10-01").dominiosNuevos).toEqual(["kamalio.com"]);
  });
});

describe("a qué empresa de HubSpot apunta", () => {
  const fusionadas = new Map<string, VeredictoDeFusion>([
    ["28872445070", { estado: "fusionada", idSobreviviente: "58805575479" }],
    ["47341146427", { estado: "fusionada", idSobreviviente: "58805575479" }],
  ]);

  it("⭐ Librería: las dos quedaron dentro de la misma empresa nueva, y la ficha apunta a esa", () => {
    const r = idDeHubspotFinal("28872445070", "47341146427", fusionadas);
    expect(r).toMatchObject({ id: "58805575479", desligado: null });
    expect(r.reemplaza.sort()).toEqual(["28872445070", "47341146427"]);
    expect(r.motivo).toContain("quedaron fusionadas en HubSpot en 58805575479");
  });

  it("dos empresas vivas distintas: se queda con la suya y la otra se reporta, no se adivina", () => {
    const vivas = new Map<string, VeredictoDeFusion>([
      ["1", { estado: "vigente" }],
      ["2", { estado: "vigente" }],
    ]);
    const r = idDeHubspotFinal("1", "2", vivas);
    expect(r).toMatchObject({ id: "1", desligado: "2", reemplaza: [] });
  });

  it("si solo la absorbida tiene empresa, la toma (la viva, si se fusionó)", () => {
    expect(idDeHubspotFinal(null, "47341146427", fusionadas)).toMatchObject({ id: "58805575479", reemplaza: ["47341146427"] });
  });

  it("lo que HubSpot no confirmó se toma tal cual y se dice", () => {
    const r = idDeHubspotFinal("1", null, new Map([["1", { estado: "ilegible", motivo: "red" } as VeredictoDeFusion]]));
    expect(r).toMatchObject({ id: "1", reemplaza: [] });
    expect(r.motivo).toContain("HubSpot no confirmó 1");
  });
});

describe("lo que es uno a uno", () => {
  it("se muda solo si la que sigue no lo tiene", () => {
    expect(destinoUnoAUno(false, true)).toBe("mover");
    expect(destinoUnoAUno(true, true)).toBe("queda-el-de-la-que-sigue");
    expect(destinoUnoAUno(true, false)).toBe("nada");
    expect(destinoUnoAUno(false, false)).toBe("nada");
  });
});

describe("lo que choca con un único (SIN_CHOCAR)", () => {
  it("⭐ las licencias: pasa el hub que la que sigue no tiene; el que ya tiene se queda el suyo", () => {
    const sigue = [{ id: "s1", hub: "sales_hub", plan: "Pro" }];
    const absorbida = [
      { id: "a1", hub: "sales_hub", plan: "Starter" },
      { id: "a2", hub: "service_hub", plan: "Pro" },
    ];
    const r = repartirSinChocar(absorbida, sigue, ["hub"]);
    expect(r.pasan.map((f) => f.id)).toEqual(["a2"]);
    expect(r.chocan).toEqual([{ id: "a1", hub: "sales_hub", plan: "Starter" }]);
  });

  it("la clave compuesta compara todas sus columnas (notas de etapa: etapa y paso)", () => {
    const sigue = [{ stage: "HANDOFF", step: 1 }];
    const absorbida = [
      { id: "a1", stage: "HANDOFF", step: 1 },
      { id: "a2", stage: "HANDOFF", step: 2 },
      { id: "a3", stage: "KICKOFF", step: 1 },
    ];
    expect(repartirSinChocar(absorbida, sigue, ["stage", "step"]).pasan.map((f) => f.id)).toEqual(["a2", "a3"]);
  });

  it("un nulo en la clave cuenta como un valor más: dos asignaciones al mismo rol sin persona son la misma", () => {
    const sigue = [{ teamMemberId: null, targetRole: "CSE" }];
    const absorbida = [
      { id: "a1", teamMemberId: null, targetRole: "CSE" },
      { id: "a2", teamMemberId: "tm1", targetRole: null },
      { id: "a3", teamMemberId: null, targetRole: "VENTAS" },
    ];
    const r = repartirSinChocar(absorbida, sigue, ["teamMemberId", "targetRole"]);
    expect(r.chocan.map((f) => f.id)).toEqual(["a1"]);
    expect(r.pasan.map((f) => f.id)).toEqual(["a2", "a3"]);
  });

  it("sin nada en la que sigue, pasa todo; sin nada en la absorbida, no pasa nada", () => {
    expect(repartirSinChocar([{ id: "a1", huella: "x" }], [], ["huella"]).pasan).toHaveLength(1);
    expect(repartirSinChocar([], [{ huella: "x" }], ["huella"])).toEqual({ pasan: [], chocan: [] });
  });

  it("⛔ una solicitud fuera de alcance que alguien decidió no se borra: le gana a la que nadie decidió; si las dos, se frena", () => {
    const sinDecidir = { id: "s1", huella: "h", estado: "PEDIDO", decididoAt: null, pedido: "Reportes de ventas" };
    const cotizada = { id: "a1", huella: "h", estado: "COTIZADO", decididoAt: new Date("2026-10-05"), monto: "US$1.200", pedido: "Reportes de ventas" };
    expect(resolverChoques("pedidoFueraDeAlcance", [cotizada], [sinDecidir], ["huella"]).map((c) => c.accion)).toEqual(["reemplazar"]);
    expect(resolverChoques("pedidoFueraDeAlcance", [{ ...sinDecidir, id: "a1" }], [{ ...cotizada, id: "s1" }], ["huella"]).map((c) => c.accion)).toEqual(["borrar-absorbida"]);
    expect(resolverChoques("pedidoFueraDeAlcance", [{ ...sinDecidir, id: "a1" }], [sinDecidir], ["huella"]).map((c) => c.accion)).toEqual(["borrar-absorbida"]);
    const ambas = resolverChoques("pedidoFueraDeAlcance", [cotizada], [{ ...cotizada, id: "s1", estado: "APROBADO" }], ["huella"]);
    expect(ambas[0]).toMatchObject({ accion: "frenar" });
    expect(ambas[0].motivo).toMatch(/Reportes de ventas/);
  });

  it("⭐ una licencia que choca: la de la que sigue toma lo que le falta y junta las notas; un dato distinto queda el suyo y se avisa", () => {
    const sigue = { id: "s1", hub: "sales_hub", plan: "Pro", fechaCompra: null, fechaRenovacion: new Date("2027-01-01"), montoMensual: null, moneda: null, nota: "La compró Ana" };
    const absorbida = { id: "a1", hub: "sales_hub", plan: "Starter", fechaCompra: new Date("2025-03-01"), fechaRenovacion: null, montoMensual: 450, moneda: "USD", nota: "Asientos: 5" };
    const [c] = resolverChoques("licenciaCliente", [absorbida], [sigue], ["hub"]);
    expect(c.accion).toBe("plegar");
    expect(c.cambios).toEqual({ fechaCompra: absorbida.fechaCompra, montoMensual: 450, moneda: "USD", nota: "La compró Ana\n\nAsientos: 5" });
    expect(c.motivo).toMatch(/plan/);
  });

  it("las notas de etapa y las asignaciones siguen como siempre: queda la de la que sigue", () => {
    expect(resolverChoques("stageNote", [{ id: "a1", stage: "HANDOFF", step: 1 }], [{ id: "s1", stage: "HANDOFF", step: 1 }], ["stage", "step"]).map((c) => c.accion)).toEqual(["borrar-absorbida"]);
  });
});

describe("la clasificación de la cartera (la confirmó una persona)", () => {
  const vacia = { relacion: null, relacionPor: null, relacionEn: null, potencial: null, potencialPor: null, potencialEn: null, momento: null, momentoPor: null, momentoEn: null, descartes: {} };
  const EN = new Date("2026-10-08T15:00:00Z");

  it("los datos son los mismos que confirma la pantalla: un dato nuevo no se queda afuera de la fusión", () => {
    expect([...DATOS_DE_LA_CLASIFICACION]).toEqual(DATOS_DE_CLASIFICACION.map((d) => d.clave));
  });

  it("⭐ la que sigue conserva lo que confirmó y toma de la otra lo que no tiene, con su autor y su fecha", () => {
    const sigue = { ...vacia, relacion: "proyecto", relacionPor: "alex@x", relacionEn: EN };
    const absorbida = { ...vacia, relacion: "recurrente", relacionPor: "otra@x", relacionEn: EN, potencial: "alto", potencialPor: "otra@x", potencialEn: EN };
    const p = plegarClasificacion(sigue, absorbida);
    expect(p.tomados).toEqual(["potencial"]);
    expect(p.cambios).toEqual({ potencial: "alto", potencialPor: "otra@x", potencialEn: EN });
  });

  it("lo que toma deja de estar descartado; los demás descartes de la que sigue quedan", () => {
    const sigue = { ...vacia, descartes: { momento: { valor: "adopcion", huella: "h1" }, potencial: { valor: "bajo", huella: "h2" } } };
    const absorbida = { ...vacia, momento: "recurrente", momentoPor: "otra@x", momentoEn: EN };
    const p = plegarClasificacion(sigue, absorbida);
    expect(p.tomados).toEqual(["momento"]);
    expect(p.cambios.descartes).toEqual({ potencial: { valor: "bajo", huella: "h2" } });
  });

  it("si la otra no confirmó nada que falte, no cambia nada (ni los descartes)", () => {
    const sigue = { ...vacia, relacion: "proyecto", descartes: { momento: { valor: "adopcion", huella: "h1" } } };
    expect(plegarClasificacion(sigue, { ...vacia, relacion: "recurrente" })).toEqual({ cambios: {}, tomados: [] });
    expect(plegarClasificacion(sigue, vacia)).toEqual({ cambios: {}, tomados: [] });
  });

  it("unos descartes ilegibles no rompen nada", () => {
    const p = plegarClasificacion({ ...vacia, descartes: "basura" }, { ...vacia, momento: "adopcion" });
    expect(p.cambios).toEqual({ momento: "adopcion", momentoPor: null, momentoEn: null });
  });
});

describe("la cuenta de cobro", () => {
  const SIGUE_C = cuenta({ id: "cmtx", moneda: "CRC", cedulaJuridica: "3-101-167504", razonSocial: "Desarrollos Culturales Costarricenses DCC, S.A.," });
  const ABSORBIDA_C = cuenta({ id: "cmry", moneda: "USD", cedulaJuridica: "3101167504", correoCobro: "cxp@libreriainternacional.com" });

  it("⭐ Librería: la cédula con y sin guiones es la misma, y la moneda distinta se reporta sin elegir", () => {
    const p = plegarCuenta(SIGUE_C, ABSORBIDA_C, "Librería Internacional", "2026-10-01");
    expect(p.diferencias).toEqual(["moneda: queda «CRC» (la otra decía «USD»)"]);
    expect(p.cambios).toEqual({ correoCobro: "cxp@libreriainternacional.com" });
  });

  it("toma lo que le falta y reporta lo que dice distinto", () => {
    const p = plegarCuenta(cuenta({ creditoDias: 30, razonSocial: "DCC S.A." }), cuenta({ creditoDias: 60, diaCobroAncla: 15, razonSocial: "D.C.C., S.A." }), "x", "2026-10-01");
    expect(p.cambios).toEqual({ diaCobroAncla: 15 });
    expect(p.diferencias).toEqual(["días de crédito: queda «30» (la otra decía «60»)"]);
  });

  it("la línea de la bitácora dice qué pasó, quién lo hizo y qué quedó distinto", () => {
    const t = textoDeFusionDeCuenta("egonzalez@smarteamcr.com", "Librería Internacional", { servicios: 1, cobros: 1, alertas: 0, bitacora: 1, facturasSoltadas: 0, clientesDeOdoo: 1, facturasDeOdoo: 4 }, ["moneda: queda «CRC» (la otra decía «USD»)"]);
    expect(t).toBe(
      "egonzalez@smarteamcr.com fusionó en esta cuenta la de «Librería Internacional», que era la misma empresa: pasaron 1 servicio(s), 1 cobro(s), 1 cliente(s) de Odoo con 4 documento(s), 1 línea(s) de bitácora. Quedaron los datos de esta cuenta donde decían distinto: moneda: queda «CRC» (la otra decía «USD»).",
    );
  });

  it("los clientes de Mercury que se mudaron también se dicen", () => {
    const t = textoDeFusionDeCuenta("egonzalez@smarteamcr.com", "Teamnet", { servicios: 2, cobros: 6, alertas: 0, bitacora: 0, facturasSoltadas: 0, clientesDeOdoo: 0, facturasDeOdoo: 0, clientesDeMercury: 1 }, []);
    expect(t).toBe("egonzalez@smarteamcr.com fusionó en esta cuenta la de «Teamnet», que era la misma empresa: pasaron 2 servicio(s), 6 cobro(s), 1 cliente(s) de Mercury.");
  });
});
