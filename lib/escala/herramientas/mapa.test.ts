/**
 * El mapa de herramientas del repo, contra la escala del repo: lo mismo que mira el script que
 * publica, para que un mapa roto se vea en los tests y no recién al publicar.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "../documento/archivos";
import { parsearEscala } from "../documento/parsear";
import { parsearMapaDeHerramientas } from "./parsear";
import { criteriosDeLaEscala, problemasDelMapa } from "./validar";

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const mapa = parsearMapaDeHerramientas(leerArchivoDeLaEscala("herramientas"));

describe("el mapa de herramientas del repo", () => {
  it("nombra solo criterios que la escala tiene", () => {
    expect(problemasDelMapa(mapa, escala)).toEqual([]);
  });

  it("se armó con la escala que está en el repo", () => {
    expect(mapa.escala).toBe(escala.version);
  });

  it("trae las tres herramientas del pedido, cada una con su color", () => {
    expect(mapa.herramientas.map((h) => h.clave).sort()).toEqual(["hubspot", "insider", "smarteam"]);
    expect(new Set(mapa.herramientas.map((h) => h.color)).size).toBe(mapa.herramientas.length);
    // Smarteam en celeste: lo pidió Elías.
    expect(mapa.herramientas.find((h) => h.clave === "smarteam")?.color).toBe("celeste");
  });

  it("cada herramienta toca las tres áreas o dice por qué no (Insider One casi no toca la venta con equipo)", () => {
    for (const h of mapa.herramientas) {
      const areas = new Set(Object.keys(h.aportes).map((id) => id[0]));
      expect(areas.size, h.nombre).toBeGreaterThanOrEqual(2);
    }
  });

  it("la introducción dice qué es y cómo se lee («lo habilita, no lo cumple»): la pantalla la muestra", () => {
    expect(mapa.intro.length).toBeGreaterThanOrEqual(2);
    expect(mapa.intro.some((p) => p.startsWith("**"))).toBe(true);
  });

  it("su historial trae la versión que dice el encabezado", () => {
    expect(mapa.historial.map((h) => h.version)).toContain(mapa.version);
  });

  it("los propios de una edición también cuentan como criterios de la escala", () => {
    const ids = criteriosDeLaEscala(escala);
    expect(ids.has("1.6.O101")).toBe(true);
    expect(ids.has("2.7.F202")).toBe(true);
  });
});
