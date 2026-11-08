/**
 * lib/exploraciones/equipos-de-la-escala.test.ts — qué equipos se detectan, qué es evidencia y qué es hipótesis, la frase
 * de «Dónde está hoy» y qué áreas van a la página del cliente (2026-11-08, Centauro Solutions).
 */
import { describe, expect, it } from "vitest";
import { areasDeLaEscala, areasParaElCliente, resumenDeLoExplorado, type AreaParaContar, type LoDeLaDimension } from "./equipos-de-la-escala";

const dims = (area: string, n = 8) => Array.from({ length: n }, (_, i) => ({ id: `${area}.${i + 1}`, aplica: true }));
const AREAS: AreaParaContar[] = [
  { id: "1", nombre: "Ventas", dimensiones: dims("1") },
  { id: "2", nombre: "Marketing", dimensiones: dims("2") },
  { id: "3", nombre: "Servicio", dimensiones: dims("3") },
];

const conEvidencia = (...ids: string[]): Record<string, LoDeLaDimension> => Object.fromEntries(ids.map((id) => [id, { confirmado: { fuente: "reunion" as const } }]));
const porExplorar = (...ids: string[]): Record<string, LoDeLaDimension> => Object.fromEntries(ids.map((id) => [id, { confirmado: { fuente: "hipotesis" as const } }]));

describe("los equipos de la escala", () => {
  it("Centauro: Ventas con evidencia, Servicio con algo, Marketing con una frase sugerida → se habló de los tres", () => {
    const lo = {
      ...conEvidencia("1.1", "1.2", "1.3", "1.4", "1.5", "1.6"),
      ...porExplorar("1.7"),
      ...conEvidencia("3.1", "3.2"),
      "2.4": { sugerido: { fuente: "reunion" as const, conCita: true } },
    };
    const areas = areasDeLaEscala({ areas: AREAS, enJuego: ["1", "3"], lo, areasDeLasSesiones: [] });
    expect(areas.map((a) => [a.nombre, a.conEvidencia, a.porExplorar, a.sugeridas, a.sinDato, a.seHablo])).toEqual([
      ["Ventas", 6, 1, 0, 1, true],
      ["Marketing", 0, 0, 1, 7, true],
      ["Servicio", 2, 0, 0, 6, true],
    ]);
  });

  it("una hipótesis sola no cuenta como que se habló de esa área; una sesión con su equipo sí", () => {
    const lo = { ...porExplorar("2.1", "2.2"), "2.3": { sugerido: { fuente: "hipotesis" as const, conCita: false } } };
    const [, marketing, servicio] = areasDeLaEscala({ areas: AREAS, enJuego: [], lo, areasDeLasSesiones: ["3", null] });
    expect(marketing).toMatchObject({ porExplorar: 2, sugeridas: 1, seHablo: false });
    expect(servicio).toMatchObject({ sesiones: 1, seHablo: true });
  });

  it("lo que no aplica a su perfil no cuenta", () => {
    const areas = areasDeLaEscala({
      areas: [{ id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1", aplica: true }, { id: "1.2", aplica: false }] }],
      enJuego: ["1"],
      lo: conEvidencia("1.2"),
      areasDeLasSesiones: [],
    });
    expect(areas[0]).toMatchObject({ partes: 1, conEvidencia: 0, sinDato: 1 });
  });
});

describe("«Dónde está hoy», en una frase", () => {
  it("dice cuál se exploró más y por eso cuál está llena, y de cuál no se habló", () => {
    const areas = areasDeLaEscala({ areas: AREAS, enJuego: ["1"], lo: { ...conEvidencia("1.1", "1.2", "1.3", "1.4", "1.5", "1.6"), ...conEvidencia("3.1", "3.2") }, areasDeLasSesiones: ["1", "1"] });
    const frase = resumenDeLoExplorado(areas);
    expect(frase).toContain("Hasta ahora se exploró sobre todo Ventas (2 sesiones con su equipo, 6 de 8 con evidencia): por eso su escala es la más llena.");
    expect(frase).toContain("De Servicio hay 2 de 8 con evidencia.");
    expect(frase).toContain("De Marketing todavía no se habló.");
  });

  it("sin nada todavía, lo dice; con solo hipótesis, aclara que son por explorar", () => {
    expect(resumenDeLoExplorado(areasDeLaEscala({ areas: AREAS, enJuego: [], lo: {}, areasDeLasSesiones: [] }))).toMatch(/^Todavía no hay nada de las reuniones/);
    expect(resumenDeLoExplorado(areasDeLaEscala({ areas: AREAS, enJuego: [], lo: porExplorar("1.1"), areasDeLasSesiones: [] }))).toContain("lo de Ventas es por explorar");
  });

  it("dos áreas igual de exploradas se nombran juntas", () => {
    const frase = resumenDeLoExplorado(areasDeLaEscala({ areas: AREAS, enJuego: [], lo: conEvidencia("1.1", "3.1"), areasDeLasSesiones: [] }));
    expect(frase).toContain("se exploraron por igual Ventas y Servicio");
  });
});

describe("las áreas de la página del cliente", () => {
  const areas = areasDeLaEscala({ areas: AREAS, enJuego: ["3"], lo: { ...conEvidencia("1.1"), ...porExplorar("2.1"), ...conEvidencia("3.1") }, areasDeLasSesiones: [] });

  it("sin elegir: todas las que tienen algo usado, las en juego primero", () => {
    expect(areasParaElCliente(areas, undefined)).toEqual(["3", "1", "2"]);
  });

  it("elegidas por el vendedor: solo esas, y una sin nada usado no sale", () => {
    expect(areasParaElCliente(areas, ["1"])).toEqual(["1"]);
    const sinNada = areasDeLaEscala({ areas: AREAS, enJuego: [], lo: conEvidencia("1.1"), areasDeLasSesiones: [] });
    expect(areasParaElCliente(sinNada, ["1", "2"])).toEqual(["1"]);
  });
});
