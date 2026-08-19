/**
 * lib/hubspot/urls.test.ts — que un link a HubSpot no se arme a medias.
 *
 * Lo que vale acá no es el string (eso es copiar la implementación) sino la REGLA: sin las dos
 * piezas no hay link. `/contacts/<portal>/company/undefined` es una URL perfectamente válida
 * para TypeScript que en HubSpot da un 404 y se lee como "no tengo permiso" — y el llamador que
 * recibe un string siempre pinta el botón siempre. Devolver `null` es lo que deja al consumidor
 * decidir NO pintarlo.
 */
import { describe, expect, it } from "vitest";
import { hubspotCompanyListUrl, hubspotCompanyUrl, hubspotDealUrl } from "./urls";

describe("URLs de HubSpot", () => {
  it("la ficha de empresa apunta al portal correcto, en singular", () => {
    // `company` en SINGULAR aunque el listado sea `companies` — la asimetría es de HubSpot.
    expect(hubspotCompanyUrl("6553628", "56443118488")).toBe(
      "https://app.hubspot.com/contacts/6553628/company/56443118488",
    );
    expect(hubspotCompanyListUrl("6553628")).toBe(
      "https://app.hubspot.com/contacts/6553628/companies/list",
    );
  });

  it("si falta CUALQUIERA de las dos piezas devuelve null, no una URL rota", () => {
    for (const [portal, company] of [
      [null, "123"],
      ["6553628", null],
      [undefined, undefined],
      ["", "123"],
      ["6553628", ""],
    ] as Array<[string | null | undefined, string | null | undefined]>) {
      expect(hubspotCompanyUrl(portal, company), `portal=${portal} company=${company}`).toBeNull();
    }
    expect(hubspotCompanyListUrl(null)).toBeNull();
  });
});

describe("hubspotDealUrl", () => {
  it("arma la ficha del trato con el portal explícito", () => {
    expect(hubspotDealUrl("6553628", "39218114285")).toBe(
      "https://app.hubspot.com/contacts/6553628/deal/39218114285",
    );
  });

  it("sin portal o sin trato NO inventa una URL", () => {
    // Media URL lleva a un 404 dentro de HubSpot que parece un problema de permisos.
    expect(hubspotDealUrl(null, "39218114285")).toBeNull();
    expect(hubspotDealUrl("6553628", null)).toBeNull();
    expect(hubspotDealUrl("6553628", "")).toBeNull();
  });
});
