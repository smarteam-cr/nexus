import { describe, expect, it } from "vitest";
import { hechosQueSeVan, notasQueCambiaron } from "./de-una-nota";

describe("notasQueCambiaron", () => {
  const antes = { "sabido:a": "Pierden 40 mil al mes en cotizaciones", "sabido:b": "Usan Excel para el pipeline", "sesion:s-1": "otra cosa" };

  it("cuenta las quitadas y las editadas, nunca las nuevas ni las de una sesión", () => {
    const despues = { "sabido:a": "Pierden 40 mil al mes en cotizaciones", "sabido:c": "nueva", "sesion:s-1": "cambiada" };
    expect(notasQueCambiaron(antes, despues)).toEqual(["sabido:b"]);
    expect(notasQueCambiaron(antes, { ...antes, "sabido:a": "Pierden 20 mil" })).toEqual(["sabido:a"]);
  });

  it("los espacios de más no son un cambio", () => {
    expect(notasQueCambiaron(antes, { ...antes, "sabido:a": "  Pierden 40 mil al mes en cotizaciones \n" })).toEqual([]);
  });
});

describe("hechosQueSeVan", () => {
  const hechos = [
    { id: "h1", notaClave: "sabido:a", cita: "Pierden 40 mil al mes" },
    { id: "h2", notaClave: "sabido:a", cita: "el gerente decide en enero" },
    { id: "h3", notaClave: "sabido:b", cita: "Usan Excel para el pipeline" },
  ];

  it("de una nota quitada se van todos", () => {
    expect(hechosQueSeVan(hechos, { "sabido:a": "Pierden 40 mil al mes; el gerente decide en enero" })).toEqual(["h3"]);
  });

  it("de una editada se van los que ya no están escritos y se quedan los que sí (sin tildes ni comillas)", () => {
    expect(hechosQueSeVan(hechos, { "sabido:a": "«Pierdén» 40 mil al mes, y decide la junta", "sabido:b": "Usan Excel para el pipeline" })).toEqual(["h2"]);
  });

  it("un hecho sin nota se va", () => {
    expect(hechosQueSeVan([{ id: "x", notaClave: null, cita: "Pierden 40 mil al mes" }], { "sabido:a": "Pierden 40 mil al mes" })).toEqual(["x"]);
  });
});
