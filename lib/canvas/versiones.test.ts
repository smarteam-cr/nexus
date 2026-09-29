import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { huellaDe, leerSecciones, tieneContenido, type SeccionDeVersion } from "./versiones";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const seccion = (key: string, data: unknown): SeccionDeVersion => ({
  key,
  label: key,
  order: 0,
  titleOverride: null,
  eyebrowOverride: null,
  blocks: data === null ? [] : [{ blockType: "CARD", content: null, data, order: 0, colSpan: 4, colStart: null, rowSpan: 4, source: "AGENT", status: "CONFIRMED" }],
});

describe("la foto de un documento", () => {
  it("la huella depende del contenido: igual contenido, igual huella; cambia una coma, cambia", () => {
    const a = [seccion("escala", { areas: [{ area: "Ventas", base: "Inicial" }] })];
    const b = [seccion("escala", { areas: [{ area: "Ventas", base: "Inicial" }] })];
    const c = [seccion("escala", { areas: [{ area: "Ventas", base: "Funcional" }] })];
    expect(huellaDe(a)).toBe(huellaDe(b));
    expect(huellaDe(a)).not.toBe(huellaDe(c));
  });

  it("un documento sin bloques no tiene nada que perder", () => {
    expect(tieneContenido([seccion("x", null)])).toBe(false);
    expect(tieneContenido([seccion("x", null), seccion("y", { a: 1 })])).toBe(true);
  });

  it("leerSecciones tolera basura", () => {
    expect(leerSecciones(null)).toEqual([]);
    expect(leerSecciones({})).toEqual([]);
  });
});

describe("⭐ todo documento que la IA reescribe guarda la foto ANTES de escribir", () => {
  /* La falla que esto cuida es de OMISIÓN: un runner nuevo que pisa bloques sin foto vuelve a
     dejar al CSE sin forma de recuperar lo que había (el caso de la Escala del diagnóstico). */
  const RUNNERS = [
    "lib/canvas/diagnostico-generate.ts",
    "lib/canvas/exploracion-generate.ts",
    "lib/canvas/planificacion-generate.ts",
    "lib/canvas/implementacion-generate.ts",
    "lib/canvas/entrega-generate.ts",
    "lib/canvas/desarrollo-generate.ts",
  ];

  it("cada runner llama a la foto antes de su primer borrado de bloques", () => {
    for (const rel of RUNNERS) {
      const src = leer(rel);
      const foto = src.indexOf("await guardarVersionDelDocumento(");
      const borrado = src.indexOf("canvasBlock.deleteMany(");
      expect(foto, `${rel} no guarda la foto`).toBeGreaterThan(-1);
      expect(foto, `${rel} guarda la foto DESPUÉS de empezar a borrar`).toBeLessThan(borrado);
    }
  });

  it("el kickoff y el handoff (en analyze) también", () => {
    const src = leer("app/api/clients/[id]/analyze/route.ts");
    expect((src.match(/await guardarVersionDelDocumento\(targetCanvasId/g) ?? []).length).toBe(2);
  });

  it("⛔ el diagnóstico ya no BORRA sus secciones retiradas: las oculta (la Entrega lee la Escala)", () => {
    const src = leer("lib/canvas/diagnostico-generate.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/canvasSection\.deleteMany/);
    expect(src).toContain("patchSectionEntry(");
  });
});
