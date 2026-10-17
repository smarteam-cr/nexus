/**
 * lib/casos-de-uso/camino.test.ts — el camino de crecimiento: qué sigue en la escala, por qué y qué casos lo mueven.
 * Correr: `npx vitest run lib/casos-de-uso/camino.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import type { Letra } from "@/lib/escala/documento/tipos";
import { caminoDeCrecimiento, casoDelCatalogoParaLaPropuesta, casosParaElArea, casosSugeridosParaLaPropuesta, type AreaParaElCamino } from "./camino";
import { casoPorId } from "./catalogo";

const OCHO = [1, 2, 3, 4, 5, 6, 7, 8];

function ventas(niveles: Record<string, Letra | null>, frena: AreaParaElCamino["frena"], nivel: Letra | null, objetivo: Letra | null): AreaParaElCamino {
  return {
    id: "1",
    nombre: "Ventas",
    nivel,
    objetivo,
    frena,
    capas: { base: { nombre: "Base operativa", nivel }, produccion: { nombre: "Producción", nivel } },
    dimensiones: OCHO.map((n) => ({ id: `1.${n}`, nombre: `D1.${n}`, aplica: true, nivel: niveles[`1.${n}`] ?? null, clase: "evidencia" as const })),
  };
}

const NOMBRES: Record<Letra, string> = { D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" };
const nombre = (l: Letra) => NOMBRES[l];
const todasEn = (l: Letra) => Object.fromEntries(OCHO.map((n) => [`1.${n}`, l]));

describe("el camino de crecimiento", () => {
  it("debajo de Funcional sugiere lo que aterriza el área y destraba lo que la frena", () => {
    const a = ventas(todasEn("I"), { capa: "base", nivel: "I", dimensiones: ["1.1", "1.2", "1.3", "1.4"] }, "I", "F");
    const casos = casosParaElArea(a, { nombreDeNivel: nombre });
    expect(casos.length).toBeGreaterThan(0);
    expect(casos[0].destraba).toBe(true);
    expect(casos.some((c) => c.caso.id === "sistematiza-ventas")).toBe(true);
    expect(casos.every((c) => c.caso.tipo !== "complementario")).toBe(true);
    const [paso] = caminoDeCrecimiento([a], nombre);
    expect(paso.porQue).toContain("Ventas está en Inicial.");
    expect(paso.porQue).toContain("a Funcional");
  });

  it("un área sin ubicar dice qué falta y no sugiere casos", () => {
    const [paso] = caminoDeCrecimiento([ventas({ "1.1": "F" }, null, null, null)], nombre);
    expect(paso.casos).toEqual([]);
    expect(paso.porQue).toContain("faltan 7 dimensiones");
  });

  it("lo que ya está elegido no se vuelve a sugerir", () => {
    const a = ventas(todasEn("D"), { capa: "base", nivel: "D", dimensiones: ["1.1"] }, "D", "F");
    expect(casosParaElArea(a, { excluir: new Set(["sistematiza-ventas"]) }).some((c) => c.caso.id === "sistematiza-ventas")).toBe(false);
  });

  it("la propuesta sin escala sugiere el caso que aterriza cada área", () => {
    const s = casosSugeridosParaLaPropuesta({ areas: ["1", "2"], escala: null });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((c) => c.tipo === "aterrizar" || c.tipo === "reactivar")).toBe(true);
    expect(casoDelCatalogoParaLaPropuesta(casoPorId("sistematiza-ventas")!)).toMatchObject({ id: "cat-sistematiza-ventas", price: "" });
  });

  it("con escala, la propuesta toma lo que destraba", () => {
    const a = ventas(todasEn("I"), { capa: "base", nivel: "I", dimensiones: ["1.1"] }, "I", "F");
    const s = casosSugeridosParaLaPropuesta({ areas: ["1"], escala: [a], max: 2 });
    expect(s).toHaveLength(2);
  });
});
