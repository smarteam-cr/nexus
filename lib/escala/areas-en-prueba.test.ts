/**
 * TI vive solo en La escala hasta su migración (./areas-en-prueba.ts): la escala publicada se lee sin ella por defecto,
 * y lo demás de la escala no cambia.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sinAreasEnPrueba, esAreaEnPrueba } from "./areas-en-prueba";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { parsearEscala } from "./documento/parsear";
import { MINI_ESCALA } from "./documento/mini-escala.fixture";

const real = parsearEscala(leerArchivoDeLaEscala("escala"));
const sin = sinAreasEnPrueba(real);

describe("sinAreasEnPrueba", () => {
  it("la escala del repo trae TI como área 4, con ocho dimensiones en dos capas", () => {
    const ti = real.areas.find((a) => a.id === "4");
    expect(ti?.nombre).toBe("TI");
    expect(ti?.dimensiones.map((d) => d.capa)).toEqual(["base", "base", "base", "base", "produccion", "produccion", "produccion", "produccion"]);
    expect(esAreaEnPrueba("4")).toBe(true);
    expect(esAreaEnPrueba("1")).toBe(false);
  });

  it("sin las áreas en prueba quedan las tres de antes, iguales", () => {
    expect(sin.areas.map((a) => a.id)).toEqual(["1", "2", "3"]);
    expect(sin.areas).toEqual(real.areas.filter((a) => a.id !== "4"));
    expect(sin.version).toBe(real.version);
    expect(sin.ediciones.length).toBe(real.ediciones.length);
  });

  it("se van sus riesgos, su orden de producción y su regla de asignación; las reglas de todas las áreas se quedan", () => {
    expect(Object.keys(sin.riesgos).filter((id) => id.startsWith("4."))).toEqual([]);
    expect(Object.keys(real.riesgos).filter((id) => id.startsWith("4.")).length).toBe(3);
    expect(sin.dependencias.some((d) => d.cuando === "TI")).toBe(false);
    expect(sin.dependencias.length).toBe(real.dependencias.length - 1);
    expect(sin.asignacion.some((r) => r.texto.includes("**TI**"))).toBe(false);
    expect(sin.asignacion.length).toBe(real.asignacion.length - 1);
    expect(sin.asignacion.flatMap((r) => r.dimensiones).some((id) => id.startsWith("4."))).toBe(false);
  });

  it("no muta la escala compartida y devuelve siempre la misma copia", () => {
    expect(real.areas.some((a) => a.id === "4")).toBe(true);
    expect(sinAreasEnPrueba(real)).toBe(sin);
  });

  it("una escala sin áreas en prueba sale tal cual", () => {
    const mini = parsearEscala(MINI_ESCALA);
    expect(sinAreasEnPrueba(mini)).toBe(mini);
  });
});

/**
 * Lo que impide que TI se cuele en la preventa o en la escala de una empresa: la lectura por defecto la esconde, solo una
 * lista conocida de archivos la pide entera, y los tests de TI (de Nexus y sus notas de HubSpot) no entran a la preventa.
 * Escaneo estructural: si una guarda desaparece del texto, esto falla.
 */
describe("el candado de TI", () => {
  const leer = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

  it("leerEscalaVigente devuelve la escala sin áreas en prueba salvo que se pida", () => {
    expect(leer("lib/escala/documento/vigente.ts")).toMatch(/o\.conAreasEnPrueba \? resultado : sinAreasEnPrueba\(resultado\)/);
  });

  it("solo La escala, el test, el editor y quien publica piden la escala con TI", () => {
    const PUEDEN = [
      "app/(shell)/escala/[area]/page.tsx",
      "app/(shell)/escala/page.tsx",
      "app/external/test/resultado/anterior/page.tsx",
      "lib/escala/datos/servidor.ts",
      "lib/feedback/escala-server.ts",
      "lib/tests-diagnostico/admin-server.ts",
      "lib/tests-diagnostico/servicio-server.ts",
      "scripts/tests-preguntas.ts",
    ];
    const archivos = ["app", "lib", "components", "scripts"].flatMap((d) =>
      (readdirSync(d, { recursive: true }) as string[]).map((f) => join(d, f).split("\\").join("/")).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)),
    );
    const piden = archivos.filter((f) => /conAreasEnPrueba:\s*true/.test(leer(f))).sort();
    expect(piden, "un lector nuevo pide la escala con TI: si es de la preventa o de una empresa, TI se cuela; si es de La escala o del test, súmalo acá").toEqual([...PUEDEN].sort());
  });

  it("los tests de TI no entran a la preventa: ni los de Nexus ni sus notas de HubSpot", () => {
    expect(leer("lib/tests-diagnostico/preventa-server.ts")).toMatch(/!esAreaEnPrueba\(i\.area\)/);
    const hubspot = leer("lib/exploraciones/hubspot.ts");
    // Las tres lecturas de notas: el enlace del resultado, la actividad que lee el agente y «Llegaron por el test».
    expect(hubspot.match(/notaDeAreaEnPrueba\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(hubspot).toMatch(/if \(!nota\?\.resultado \|\| notaDeAreaEnPrueba\(nota\)\) return null;/);
    expect(hubspot).toMatch(/notaDeAreaEnPrueba\(leerNotaDelTest\(m\.body\)\)\) return null;/);
    expect(hubspot).toMatch(/nota && !notaDeAreaEnPrueba\(nota\)/);
  });
});
