/**
 * lib/business-cases/casos-para-la-propuesta.test.ts — qué lleva la sección «Casos de uso» de una propuesta nueva.
 * Correr: `npx vitest run lib/business-cases/casos-para-la-propuesta.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { casoPorId } from "@/lib/casos-de-uso/catalogo";
import { itemsDeLaSeccionDeCasos, preambuloDeCasos } from "./casos-para-la-propuesta";

const sugerido = casoPorId("sistematiza-ventas")!;

describe("la sección de casos de uso", () => {
  it("el checklist primero, después lo de la preventa sin repetir títulos", () => {
    const r = itemsDeLaSeccionDeCasos({
      checklist: [{ title: "Rescate", description: "x", price: "$1" }],
      preventa: [
        { title: "rescate", detail: "y", price: "" },
        { title: "Otro", detail: "z", price: "" },
      ],
      sugeridos: [sugerido],
    });
    expect(r.origen).toBe("checklist");
    expect(r.items.map((i) => i.title)).toEqual(["Rescate", "Otro"]);
  });

  it("solo con la preventa, sus casos", () => {
    const r = itemsDeLaSeccionDeCasos({ checklist: [], preventa: [{ title: "Otro", detail: "z", price: "" }], sugeridos: [sugerido] });
    expect(r).toMatchObject({ origen: "preventa", items: [{ title: "Otro" }] });
  });

  it("sin nada elegido, los sugeridos de la biblioteca, sin precio", () => {
    const r = itemsDeLaSeccionDeCasos({ checklist: [], preventa: [], sugeridos: [sugerido] });
    expect(r.origen).toBe("sugeridos");
    expect(r.items[0]).toEqual({ title: sugerido.titulo, detail: sugerido.promesa, price: "" });
    expect(preambuloDeCasos(r.origen, r.items)).toContain("sin afirmar que el prospecto ya los eligió");
  });

  it("sin nada, la sección queda vacía y el preámbulo no dice nada", () => {
    const r = itemsDeLaSeccionDeCasos({ checklist: [], preventa: [], sugeridos: [] });
    expect(r).toEqual({ items: [], origen: "ninguno" });
    expect(preambuloDeCasos(r.origen, r.items)).toBeNull();
  });
});
