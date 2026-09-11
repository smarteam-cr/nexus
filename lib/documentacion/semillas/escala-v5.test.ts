/**
 * lib/documentacion/semillas/escala-v5.test.ts — que el reglamento se lea entero y sin inventar.
 *
 * El riesgo real de un lector de documentos no es que falle: es que lea de MENOS y nadie lo note
 * —una dimensión sin señales, una pregunta vacía— y eso termine publicado como si fuera el
 * reglamento. Por eso acá se cuentan las piezas y se afirma su forma.
 */
import { describe, expect, it } from "vitest";
import { leerReglamentoV5, NIVELES_V5 } from "./escala-v5";

const reglamento = leerReglamentoV5();
const dimensiones = reglamento.areas.flatMap((a) => a.dimensiones);

describe("el reglamento v5 se lee completo", () => {
  it("es la versión 5.2.0", () => {
    expect(reglamento.version).toBe("5.2.0");
  });

  it("tiene las tres áreas, en orden", () => {
    expect(reglamento.areas.map((a) => `${a.numero} ${a.nombre}`)).toEqual([
      "1 Ventas",
      "2 Marketing",
      "3 Servicio",
    ]);
  });

  it("cada área trae una introducción", () => {
    for (const a of reglamento.areas) expect(a.intro.length, a.nombre).toBeGreaterThan(20);
  });

  it("son 24 dimensiones: 8 por área", () => {
    expect(dimensiones).toHaveLength(24);
    for (const a of reglamento.areas) expect(a.dimensiones, a.nombre).toHaveLength(8);
  });

  it("cada área tiene 4 dimensiones de base y 4 de producción", () => {
    for (const a of reglamento.areas) {
      expect(a.dimensiones.filter((d) => d.capa === "base"), a.nombre).toHaveLength(4);
      expect(a.dimensiones.filter((d) => d.capa === "produccion"), a.nombre).toHaveLength(4);
    }
  });

  it("los identificadores son los del anexo (x.1 … x.8)", () => {
    expect(dimensiones.map((d) => d.id)).toEqual([
      "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8",
      "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8",
      "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8",
    ]);
  });

  it("cada dimensión tiene su pregunta y sus cinco niveles", () => {
    for (const d of dimensiones) {
      expect(d.pregunta.length, `${d.id} ${d.nombre}`).toBeGreaterThan(15);
      expect(d.niveles.map((n) => n.nombre), `${d.id} ${d.nombre}`).toEqual([...NIVELES_V5]);
    }
  });

  it("cada nivel que existe trae su resumen", () => {
    for (const d of dimensiones) {
      for (const n of d.niveles) {
        expect(n.resumen.length, `${d.id} · ${n.nombre}`).toBeGreaterThan(10);
      }
    }
  });
});

describe("las dimensiones sin nivel Funcional", () => {
  it("son exactamente tres, y son 1.7, 3.7 y 3.8", () => {
    expect(dimensiones.filter((d) => d.sinFuncional).map((d) => d.id)).toEqual(["1.7", "3.7", "3.8"]);
  });

  it("la 1.8 SÍ admite Funcional, con sus señales", () => {
    const d = dimensiones.find((x) => x.id === "1.8");
    expect(d?.sinFuncional).toBe(false);
    expect(d?.niveles.find((n) => n.nombre === "Funcional")?.senales.length).toBeGreaterThan(0);
  });

  it("se detectan por la marca del texto, no por el número", () => {
    for (const d of dimensiones.filter((x) => x.sinFuncional)) {
      const funcional = d.niveles.find((n) => n.nombre === "Funcional");
      expect(funcional?.ausente, d.id).toBe(true);
      expect(funcional?.resumen, d.id).toMatch(/Sin nivel Funcional/);
    }
  });
});

describe("la vista rápida de los cinco niveles", () => {
  it("trae los cinco, cada uno con sus tres áreas", () => {
    expect(reglamento.panorama.map((p) => p.nivel)).toEqual([...NIVELES_V5]);
    for (const p of reglamento.panorama) {
      expect(p.porArea.map((a) => a.area), p.nivel).toEqual(["Ventas", "Marketing", "Servicio"]);
      for (const a of p.porArea) expect(a.texto.length, `${p.nivel} · ${a.area}`).toBeGreaterThan(40);
    }
  });
});

describe("el texto sale limpio", () => {
  it("sin asteriscos de markdown ni saltos sueltos", () => {
    const todo = dimensiones.flatMap((d) => [d.pregunta, ...d.niveles.flatMap((n) => [n.resumen, ...n.senales])]);
    for (const t of todo) {
      expect(t).not.toContain("*");
      expect(t).not.toContain("\n");
    }
  });

  it("las señales de Funcional de 1.1 son las del reglamento", () => {
    const d = dimensiones.find((x) => x.id === "1.1");
    const funcional = d?.niveles.find((n) => n.nombre === "Funcional");
    expect(funcional?.senales.length).toBeGreaterThanOrEqual(4);
    expect(funcional?.senales.join(" ")).toContain("pipeline de ventas configurado");
  });
});
