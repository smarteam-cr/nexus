import { describe, expect, it } from "vitest";
import type { Area } from "../documento/tipos";
import { consultaDeLaEscala } from "../vista";
import { SIN_PERFIL } from "../documento/perfil";
import { activasQueExisten, aportesDelCriterio, herramientasDeLaVista, herramientasDesdeUrl } from "./vista";
import type { MapaDeHerramientas } from "./tipos";

const MAPA: MapaDeHerramientas = {
  version: "1.0.0",
  escala: "8.7.0",
  fecha: null,
  estado: null,
  intro: ["Qué es."],
  historial: [],
  herramientas: [
    { clave: "insider", nombre: "Insider One", sigla: "I", color: "fucsia", queEs: "x", cuandoConviene: null, revisado: null, responsable: null, aportes: { "2.2.O1": "a", "1.7.O2": "b" } },
    { clave: "hubspot", nombre: "HubSpot", sigla: "H", color: "naranja", queEs: "y", cuandoConviene: null, revisado: null, responsable: null, aportes: { "2.2.O1": "c", "2.2.F3": "d" } },
  ],
};

/** Un área de Marketing con dos criterios: lo justo para reducir el mapa. */
const AREA = {
  id: "2",
  dimensiones: [{ id: "2.2", niveles: [{ id: "2.2.F", criterios: [{ id: "2.2.F3" }] }, { id: "2.2.O", criterios: [{ id: "2.2.O1" }] }] }],
} as unknown as Area;

describe("herramientasDeLaVista", () => {
  it("baja solo lo que aporta cada herramienta en los criterios del área que se ve", () => {
    const v = herramientasDeLaVista(MAPA, AREA)!;
    expect(v.herramientas.map((h) => [h.clave, h.aportes])).toEqual([
      ["insider", { "2.2.O1": "a" }],
      ["hubspot", { "2.2.O1": "c", "2.2.F3": "d" }],
    ]);
  });

  it("sin mapa publicado no hay filtro", () => {
    expect(herramientasDeLaVista(null, AREA)).toBeNull();
  });
});

describe("aportesDelCriterio", () => {
  const v = herramientasDeLaVista(MAPA, AREA);
  it("solo las prendidas, en el orden del documento", () => {
    expect(aportesDelCriterio(v, ["hubspot", "insider"], "2.2.O1").map((a) => [a.herramienta.clave, a.aporte])).toEqual([
      ["insider", "a"],
      ["hubspot", "c"],
    ]);
    expect(aportesDelCriterio(v, ["insider"], "2.2.F3")).toEqual([]);
    expect(aportesDelCriterio(v, [], "2.2.O1")).toEqual([]);
  });
});

describe("las herramientas en la URL", () => {
  it("se leen sin repetir y sin lo que no parece una clave", () => {
    expect(herramientasDesdeUrl("insider,HubSpot,insider,<x>, smarteam ")).toEqual(["insider", "hubspot", "smarteam"]);
    expect(herramientasDesdeUrl(null)).toEqual([]);
  });

  it("un enlace viejo que nombra una herramienta que ya no está no la prende", () => {
    expect(activasQueExisten(["insider", "vieja"], herramientasDeLaVista(MAPA, AREA))).toEqual(["insider"]);
    expect(activasQueExisten(["insider"], null)).toEqual([]);
  });

  it("viajan en la consulta de la escala", () => {
    expect(consultaDeLaEscala({ vista: "mapa", perfil: SIN_PERFIL, industria: null, herramientas: ["insider", "smarteam"] })).toBe("?h=insider%2Csmarteam");
    expect(consultaDeLaEscala({ vista: "mapa", perfil: SIN_PERFIL, industria: null, herramientas: [] })).toBe("");
  });
});
