/**
 * lib/mi-dia/mapas-de-empresas.test.ts — «Mi día» reparte la gente de una empresa con unidades como el resolver
 * (revisión del 8 nov: la regla no tenía prueba). Correr: `npx vitest run lib/mi-dia/mapas-de-empresas.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { armarMapasDeLaGente, type FichaParaMapas } from "./mapas-de-empresas";

const CR: FichaParaMapas = { id: "cr", name: "Cemaco · Costa Rica", company: null, emailDomains: ["cemaco.co.cr"], comparteDominioConId: null };
const EC: FichaParaMapas = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com", "comohogar.com"], comparteDominioConId: "cr" };
const TAE: FichaParaMapas = { id: "tae", name: "TEC · TAE", company: null, emailDomains: ["itcr.ac.cr"], comparteDominioConId: null };
const AE: FichaParaMapas = { id: "ae", name: "TEC · AE", company: null, emailDomains: [], comparteDominioConId: "tae" };

describe("las unidades de una empresa en «Mi día»", () => {
  it("una unidad con dominio propio (Ecuador) no se suma al dominio ni a los contactos de la principal", () => {
    const m = armarMapasDeLaGente([CR, EC], [{ email: "luis@cemaco.co.cr", clientId: "cr" }]);
    expect(m.porDominio.get("cemaco.co.cr")).toEqual(["cr"]);
    expect(m.porDominio.get("sukasa.com")).toEqual(["ec"]);
    expect(m.porCorreo.get("luis@cemaco.co.cr")).toEqual(["cr"]);
    expect(m.grupoDe.get("ec")).toBe("cr");
    expect(m.grupoDe.get("cr")).toBe("cr");
  });

  it("un contacto de Ecuador que HubSpot guarda en la empresa de Costa Rica es de Ecuador, como dice el resolver", () => {
    const m = armarMapasDeLaGente([CR, EC], [{ email: "Ana@Sukasa.com", clientId: "cr" }]);
    expect(m.porCorreo.get("ana@sukasa.com")).toEqual(["ec"]);
  });

  it("una unidad sin dominio propio (el TEC · AE) vive en el de la principal: su gente es de las dos", () => {
    const m = armarMapasDeLaGente([TAE, AE], [{ email: "ana@itcr.ac.cr", clientId: "tae" }]);
    expect(m.porDominio.get("itcr.ac.cr")).toEqual(["tae", "ae"]);
    expect(m.porCorreo.get("ana@itcr.ac.cr")).toEqual(["tae", "ae"]);
  });
});
