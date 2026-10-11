import { describe, expect, it } from "vitest";
import { encargadoDelProyecto, propiedadesDeEncargados } from "./encargados";

describe("los encargados de una cuenta en HubSpot (2026-10-09)", () => {
  it("el espejo lee primero «CSE Encargado» y, vacío, «CSL Encargado»", () => {
    expect(encargadoDelProyecto({ cse_encargado: "111", csl_encargado: "222" })).toBe("111");
    expect(encargadoDelProyecto({ cse_encargado: " ", csl_encargado: "222" })).toBe("222");
    expect(encargadoDelProyecto({ cse_encargado: null, csl_encargado: null })).toBeNull();
  });

  it("migrar no le cambia el encargado a nadie: copiar CSL → CSE y poner a la CSL deja el mismo", () => {
    const antes = { cse_encargado: null, csl_encargado: "cse-de-hoy" };
    const despues = { cse_encargado: "cse-de-hoy", csl_encargado: "la-csl" };
    expect(encargadoDelProyecto(despues)).toBe(encargadoDelProyecto(antes));
  });

  it("sin CSL con usuario en HubSpot, solo se escribe el CSE", () => {
    expect(propiedadesDeEncargados({ cse: "1", csl: null })).toEqual({ cse_encargado: "1" });
    expect(propiedadesDeEncargados({ cse: "1", csl: "2" })).toEqual({ cse_encargado: "1", csl_encargado: "2" });
  });
});
