import { describe, expect, it } from "vitest";
import { encargadoDelProyecto, encargadoEnLaFecha, propiedadesDeEncargados } from "./encargados";

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

describe("encargadoEnLaFecha (la historia de HubSpot)", () => {
  const cse = [{ value: "98665525", timestamp: "2026-10-15T01:28:05Z" }, { value: "87810520", timestamp: "2026-10-13T12:00:00Z" }];
  const csl = [{ value: "96588400", timestamp: "2026-10-13T12:00:00Z" }, { value: "87810520", timestamp: "2026-08-03T00:00:00Z" }];

  it("antes de la migración del 13 oct, el CSE vivía en «CSL Encargado»", () => {
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-09-20T00:00:00Z"))).toBe("87810520");
  });
  it("después, «CSE Encargado» manda aunque «CSL Encargado» diga la CSL", () => {
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-10-14T00:00:00Z"))).toBe("87810520");
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-10-19T00:00:00Z"))).toBe("98665525");
  });
  it("sin historia hasta esa fecha, nadie", () => {
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });
});
