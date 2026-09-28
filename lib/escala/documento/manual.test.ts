/**
 * lib/escala/documento/manual.test.ts — por qué está congelada, leído del manual publicado.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { leerCongelamiento } from "./manual";

describe("leerCongelamiento", () => {
  it("el resumen y las reglas, con sus negritas", () => {
    const manual = [
      "# Manual",
      "",
      "## La escala está congelada",
      "",
      "La versión 9.9.9 no cambia hasta usarla.",
      "",
      "Mientras tanto:",
      "",
      "- **Solo se corrige** lo que impide usarla.",
      "- **Todo lo demás se anota.**",
      "",
      "## Otra cosa",
      "",
      "- No es de acá.",
    ].join("\n");
    expect(leerCongelamiento(manual)).toEqual({
      resumen: "La versión 9.9.9 no cambia hasta usarla.",
      reglas: ["**Solo se corrige** lo que impide usarla.", "**Todo lo demás se anota.**"],
    });
  });

  it("sin manual o sin la sección, nada (la pantalla no lo muestra)", () => {
    expect(leerCongelamiento(null)).toBeNull();
    expect(leerCongelamiento("# Manual\n\n## Otra cosa\n\nTexto.")).toBeNull();
  });

  it("el manual real dice por qué está congelada y cuándo se descongela", () => {
    const c = leerCongelamiento(leerArchivoDeLaEscala("manual"));
    expect(c?.resumen).toMatch(/no cambia/);
    expect(c?.reglas.length).toBeGreaterThanOrEqual(3);
    expect(c?.reglas.some((r) => /descongela/i.test(r))).toBe(true);
  });
});
