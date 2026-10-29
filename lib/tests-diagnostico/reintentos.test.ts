import { describe, expect, it } from "vitest";
import { esElUltimoIntento, MAX_INTENTOS_HUBSPOT } from "./reintentos";

describe("el último intento del envío a HubSpot", () => {
  it("se reintenta ocho veces", () => {
    expect(MAX_INTENTOS_HUBSPOT).toBe(8);
  });

  it("los primeros siete no son el último: una falla pasajera no deja a un lead nuevo solo con el correo", () => {
    for (let hechos = 0; hechos <= 6; hechos++) expect(esElUltimoIntento(hechos)).toBe(false);
  });

  it("el octavo sí lo es: el formulario sale igual, y el lead llega a HubSpot", () => {
    expect(esElUltimoIntento(7)).toBe(true);
  });

  it("pasado el tope, sigue siendo el último", () => {
    expect(esElUltimoIntento(8)).toBe(true);
  });
});
