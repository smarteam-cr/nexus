import { describe, expect, it } from "vitest";
import { loQueDejaDeDecir, renglones } from "./contradice";

const CONFIRMADO = ["- Usan HubSpot Sales Hub Professional", "- El ERP es SAP Business One", "- Venden por distribuidores en Centroamérica"].join("\n");

describe("¿la propuesta contradice lo confirmado?", () => {
  it("una propuesta que suma no contradice", () => {
    const suma = `${CONFIRMADO}\n- Abrieron una tienda en línea en 2026`;
    expect(loQueDejaDeDecir(CONFIRMADO, suma)).toEqual([]);
  });

  it("reescribir con otras palabras parecidas no cuenta (sin tildes ni negritas)", () => {
    const reescrita = [
      "- Usan **HubSpot Sales Hub** Professional desde enero",
      "- El ERP es SAP Business One (versión 10)",
      "- Venden por distribuidores en Centroamerica y Panamá",
    ].join("\n");
    expect(loQueDejaDeDecir(CONFIRMADO, reescrita)).toEqual([]);
  });

  it("lo que deja de decir es la contradicción", () => {
    const cambia = ["- Usan HubSpot Sales Hub Professional", "- Migraron el ERP a Odoo", "- Venden por distribuidores en Centroamérica"].join("\n");
    expect(loQueDejaDeDecir(CONFIRMADO, cambia)).toEqual(["El ERP es SAP Business One"]);
  });

  it("sin nada confirmado o sin propuesta, no hay qué preguntar", () => {
    expect(loQueDejaDeDecir("", "- Algo nuevo")).toEqual([]);
    expect(loQueDejaDeDecir(CONFIRMADO, "  ")).toEqual([]);
  });

  it("los renglones sin contenido no cuentan", () => {
    expect(renglones("- \n\n* x\n- El ERP es SAP")).toEqual(["El ERP es SAP"]);
  });
});
