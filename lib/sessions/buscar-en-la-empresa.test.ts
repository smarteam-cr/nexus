/**
 * lib/sessions/buscar-en-la-empresa.test.ts — encontrar cualquier reunión de la empresa (T8): lo escrito se busca
 * literal y los dominios salen de las piezas del resolver.
 */
import { describe, expect, it } from "vitest";
import { dominiosDeLaEmpresa, dominiosEnComun, patronDeBusqueda } from "./buscar-en-la-empresa";

describe("buscar en la empresa", () => {
  it("«%» y «_» se buscan literales", () => {
    expect(patronDeBusqueda(" 100%_listo ")).toBe("%100\\%\\_listo%");
  });
  it("los dominios de la empresa, sin los de la casa", () => {
    expect(dominiosDeLaEmpresa({ emailDomains: ["Honda.cr", "smarteamcr.com"], company: "facocr.com" }, new Set(["smarteamcr.com"]))).toEqual(["honda.cr", "facocr.com"]);
    expect(dominiosDeLaEmpresa({ emailDomains: null, company: "Honda Costa Rica" }, new Set())).toEqual([]);
  });
  it("en común con la reunión, como los mira el resolver (el organizador cuenta; un calendario, no)", () => {
    const r = { participants: ["sala@resource.calendar.google.com", "ana@smarteamcr.com"], organizerEmail: "pablo@facocr.com" };
    expect(dominiosEnComun(r, ["honda.cr", "facocr.com"])).toEqual(["facocr.com"]);
    expect(dominiosEnComun({ participants: ["x@resource.calendar.google.com"], organizerEmail: null }, ["resource.calendar.google.com"])).toEqual([]);
  });
});
