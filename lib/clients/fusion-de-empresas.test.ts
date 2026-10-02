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
  destinoUnoAUno,
  dominioDeCompany,
  idDeHubspotFinal,
  juntarNotas,
  plegarCuenta,
  plegarFicha,
  textoDeFusionDeCuenta,
  type CuentaParaFusionar,
  type FichaParaFusionar,
} from "./fusion-de-empresas";
import type { VeredictoDeFusion } from "@/lib/hubspot/empresa-fusionada";

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
});
