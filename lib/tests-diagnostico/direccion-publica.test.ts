/**
 * lib/tests-diagnostico/direccion-publica.test.ts — la dirección de las páginas públicas del test (O6): lo que mide la
 * campaña pasa de la entrada al área, y los datos de la persona nunca se quedan en una página que carga píxeles.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { consultaConIndustria, consultaLimpia, estaLimpia, industriaDelTest, sufijo } from "./direccion-publica";

describe("lo que se queda en la dirección", () => {
  it("lo de campaña y la versión pasan; los datos de la persona no", () => {
    const q = { utm_source: "li", utm_campaign: "q4", gclid: "g", fbclid: "f", hsa_ad: "1", _hsenc: "x", v: "marketing", email: "ana@acme.com", nombre: "Ana", empresa: "Acme" };
    expect(Object.fromEntries(consultaLimpia(q))).toEqual({ utm_source: "li", utm_campaign: "q4", gclid: "g", fbclid: "f", hsa_ad: "1", _hsenc: "x", v: "marketing" });
    expect(estaLimpia(q)).toBe(false);
  });

  it("la entrada además lee el área", () => {
    expect(Object.fromEntries(consultaLimpia({ area: "ventas", email: "x" }, ["area"]))).toEqual({ area: "ventas" });
    expect(estaLimpia({ area: "ventas", utm_source: "li" }, ["area"])).toBe(true);
    expect(estaLimpia({ area: "ventas" })).toBe(false);
  });

  it("una clave repetida o muy larga no está limpia (se redirige a la versión corta)", () => {
    expect(estaLimpia({ utm_source: ["a", "b"] })).toBe(false);
    expect(estaLimpia({ utm_source: "x".repeat(301) })).toBe(false);
    expect(consultaLimpia({ utm_source: ["a", "b"] }).get("utm_source")).toBe("a");
  });

  it("sin nada, limpia y sin sufijo", () => {
    expect(estaLimpia({})).toBe(true);
    expect(sufijo(consultaLimpia({}))).toBe("");
    expect(sufijo(consultaLimpia({ utm_source: "li" }))).toBe("?utm_source=li");
  });

  it("la industria se queda solo si es de la lista de Smarteam (u «Otra»)", () => {
    expect(industriaDelTest("Agrícola")).toBe("Agrícola");
    expect(industriaDelTest("Otra")).toBe("Otra");
    expect(industriaDelTest("<script>")).toBeNull();
    expect(industriaDelTest(undefined)).toBeNull();
    const buena = consultaConIndustria({ industria: "Agrícola", utm_source: "li" });
    expect(buena.limpia).toBe(true);
    expect(Object.fromEntries(buena.pasa)).toEqual({ utm_source: "li", industria: "Agrícola" });
    const mala = consultaConIndustria({ industria: "Inventada", email: "ana@acme.com" });
    expect(mala.limpia).toBe(false);
    expect(mala.industria).toBeNull();
    expect(sufijo(mala.pasa)).toBe("");
    expect(consultaConIndustria({}).limpia).toBe(true);
  });

  it("⛔ las dos páginas que cargan píxeles redirigen a la dirección limpia antes de armarse", () => {
    const raiz = process.cwd();
    for (const f of ["app/external/test/page.tsx", "app/external/test/[area]/page.tsx"]) {
      const fuente = fs.readFileSync(path.join(raiz, f), "utf8");
      expect(fuente, f).toMatch(/if \(!(consultaConIndustria\(q\)\.)?limpia\)/);
      expect(fuente, f).toMatch(/redirect\(/);
    }
  });
});
