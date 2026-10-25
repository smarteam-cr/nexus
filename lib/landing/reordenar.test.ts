/**
 * lib/landing/reordenar.test.ts — reordenar un grupo sin mover lo demás (L3 etapa 2, 2026-10-24).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { reordenarEnSusLugares, reordenarPorIndices } from "./reordenar";

describe("reordenar una parte de la lista", () => {
  // Cuantitativos en 0, 2 y 4; cualitativos en 1 y 3.
  const objetivos = ["Q1", "C1", "Q2", "C2", "Q3"];

  it("los cuantitativos cambian de orden y los cualitativos quedan donde estaban", () => {
    expect(reordenarEnSusLugares(objetivos, [0, 2, 4], [4, 0, 2])).toEqual(["Q3", "C1", "Q1", "C2", "Q2"]);
  });

  it("los cualitativos, igual", () => {
    expect(reordenarEnSusLugares(objetivos, [1, 3], [3, 1])).toEqual(["Q1", "C2", "Q2", "C1", "Q3"]);
  });

  it("un orden que no es del grupo no pierde ni duplica nada", () => {
    expect(reordenarEnSusLugares(objetivos, [0, 2], [0, 0])).toEqual(objetivos);
    expect(reordenarEnSusLugares(objetivos, [0, 2], [0, 9])).toEqual(objetivos);
    expect(reordenarEnSusLugares(objetivos, [0, 2], [2])).toEqual(objetivos);
  });
});

describe("las tarjetas que se arrastran (L3 etapa 2): la guarda del texto", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("la cuarta columna del problema, los objetivos, el alcance y las tablas usan SortableItems", () => {
    const diag = leer("components/landing/sections-diagnostico.tsx");
    expect(diag).toContain("onReordenarAcciones");
    expect(diag).toContain("reordenarEnSusLugares(");
    expect(diag).toMatch(/elemento="li"/);
    expect((diag.match(/elemento="tr"/g) ?? []).length, "las dos tablas: equipos y preguntas").toBe(2);
    expect(leer("components/landing/sections-escala.tsx")).toContain("<SortableItems");
  });
});

describe("reordenar la tabla de Acciones desde la cuarta columna del problema", () => {
  const acciones = ["AC-01", "", "AC-02", "AC-03"]; // la vacía (1) no se ve en la columna
  it("las que se ven, en el orden nuevo; las demás al final, en su orden", () => {
    expect(reordenarPorIndices(acciones, [3, 0, 2])).toEqual(["AC-03", "AC-01", "AC-02", ""]);
  });
  it("un índice repetido o de afuera no duplica ni pierde nada", () => {
    expect(reordenarPorIndices(acciones, [3, 3, 9, -1, 0])).toEqual(["AC-03", "AC-01", "", "AC-02"]);
    expect(reordenarPorIndices(acciones, [])).toEqual(acciones);
  });
  it("la pantalla usa esta función (no repite la cuenta)", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "components/canvas/DiagnosticoWorkspace.tsx"), "utf8")).toContain("reordenarPorIndices(lista, indices)");
  });
});
