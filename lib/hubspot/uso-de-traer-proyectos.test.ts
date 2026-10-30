import { describe, expect, it } from "vitest";
import { desenlaceDe, sumarUso } from "./uso-de-traer-proyectos";

describe("cómo terminó una corrida de «Traer proyectos de HubSpot»", () => {
  it("un error gana sobre todo", () => {
    expect(desenlaceDe(null)).toBe("error");
    expect(desenlaceDe({ errors: ["token vencido"], releidos: 2 })).toBe("error");
  });
  it("la relectura del botón, las frenadas y la completa", () => {
    expect(desenlaceDe({ errors: [], releidos: 3 })).toBe("releyo");
    expect(desenlaceDe({ errors: [], omitido: "piso" })).toBe("piso");
    expect(desenlaceDe({ errors: [], omitido: "en_vuelo" })).toBe("en_vuelo");
    expect(desenlaceDe({ errors: [], omitido: "cooldown" })).toBe("cooldown");
    expect(desenlaceDe({ errors: [] })).toBe("corrio");
  });
});

describe("el registro por día", () => {
  const ahora = new Date("2026-10-29T12:00:00Z");
  it("suma por día, por quién la disparó y por cómo terminó", () => {
    let r = sumarUso(null, "2026-10-29", "boton", "corrio", ahora);
    r = sumarUso(r, "2026-10-29", "boton", "corrio", ahora);
    r = sumarUso(r, "2026-10-29", "fondo", "corrio", ahora);
    expect(r.dias["2026-10-29"]).toEqual({ "boton.corrio": 2, "fondo.corrio": 1 });
    expect(r.at).toBe(ahora.toISOString());
  });
  it("un registro con otra forma se empieza de cero, y se guardan los últimos 60 días", () => {
    expect(sumarUso({ version: 2 } as never, "2026-10-29", "boton", "piso", ahora).dias).toEqual({ "2026-10-29": { "boton.piso": 1 } });
    let r = sumarUso(null, "2026-01-01", "boton", "corrio", ahora);
    for (let i = 1; i <= 60; i++) r = sumarUso(r, `2026-03-${String(i).padStart(2, "0")}`, "boton", "corrio", ahora);
    expect(Object.keys(r.dias)).toHaveLength(60);
    expect(r.dias["2026-01-01"]).toBeUndefined();
  });
});
