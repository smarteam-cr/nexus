/**
 * lib/escala/documento/manual.test.ts — cómo cambia la escala, leído del manual publicado.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { leerComoCambia } from "./manual";

describe("leerComoCambia", () => {
  it("el título, el resumen y las reglas, con sus negritas", () => {
    const manual = [
      "# Manual",
      "",
      "## Cómo cambia la escala",
      "",
      "La escala cambia con el uso.",
      "",
      "- **El equipo comenta;** el responsable decide.",
      "- **Cada cambio es una versión nueva.**",
      "",
      "## Otra cosa",
      "",
      "- No es de acá.",
    ].join("\n");
    expect(leerComoCambia(manual)).toEqual({
      titulo: "Cómo cambia la escala",
      resumen: "La escala cambia con el uso.",
      reglas: ["**El equipo comenta;** el responsable decide.", "**Cada cambio es una versión nueva.**"],
    });
  });

  it("también lee el manual anterior (1.0.x), que producción puede tener publicado", () => {
    const viejo = "# Manual\n\n## La escala está congelada\n\nLa versión 9.9.9 no cambia.\n\nMientras tanto:\n\n- **Solo se corrige** lo que impide usarla.\n";
    expect(leerComoCambia(viejo)).toEqual({
      titulo: "La escala está congelada",
      resumen: "La versión 9.9.9 no cambia.",
      reglas: ["**Solo se corrige** lo que impide usarla."],
    });
  });

  it("sin manual o sin la sección, nada (la pantalla no lo muestra)", () => {
    expect(leerComoCambia(null)).toBeNull();
    expect(leerComoCambia("# Manual\n\n## Otra cosa\n\nTexto.")).toBeNull();
  });

  it("el manual real dice cómo cambia la escala y quién decide", () => {
    const c = leerComoCambia(leerArchivoDeLaEscala("manual"));
    expect(c?.titulo).toBe("Cómo cambia la escala");
    expect(c?.resumen).toMatch(/comentarios del equipo/);
    expect(c?.reglas.length).toBeGreaterThanOrEqual(2);
    expect(c?.reglas.some((r) => /decide/i.test(r))).toBe(true);
  });
});
