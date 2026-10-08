/**
 * lib/escala/datos/pantalla.test.ts — cada cambio de la bitácora, dicho para leerse.
 */
import { describe, expect, it } from "vitest";
import { dondeEsta, paraMostrar } from "./pantalla";
import { fechaYHora, versionSiguiente } from "./reglas";

const EDICIONES = new Map([["ecommerce-retail", "Ecommerce y retail"]]);

describe("la bitácora en la pantalla", () => {
  it("cada ancla en palabras", () => {
    expect(dondeEsta("1.7.F1", "criterio", EDICIONES)).toBe("Criterio 1.7.F1");
    expect(dondeEsta("1.7", "dimension", EDICIONES)).toBe("Dimensión 1.7");
    expect(dondeEsta("edicion:ecommerce-retail/1.7.F1", "criterio", EDICIONES)).toBe("Edición Ecommerce y retail · criterio 1.7.F1");
    expect(dondeEsta("edicion:ecommerce-retail", "edicion", EDICIONES)).toBe("Edición Ecommerce y retail");
    expect(dondeEsta("texto:Parte 2 — Cómo se aplica / Cómo se leen los criterios", "texto", EDICIONES)).toBe("Texto · Parte 2 — Cómo se aplica / Cómo se leen los criterios");
    expect(dondeEsta("encabezado:version", "encabezado", EDICIONES)).toBe("Encabezado · version");
  });

  it("un criterio nuevo se lee sin la forma del archivo", () => {
    const c = paraMostrar(
      { ancla: "1.7.F20", tipoDeAncla: "criterio", accion: "agregado", campo: null, antes: null, despues: "- Cada deal tiene dueño. `[1.7.F20 · declarado]`" },
      EDICIONES,
    );
    expect(c).toEqual({ ancla: "1.7.F20", donde: "Criterio 1.7.F20", accion: "agregado", campo: null, antes: null, despues: "Cada deal tiene dueño. [1.7.F20 · declarado]" });
  });

  it("de un cambio largo, el pedazo; y el campo en palabras", () => {
    const largo = "Los deals estancados se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada vendedor.";
    const c = paraMostrar({ ancla: "1.7.F1", tipoDeAncla: "criterio", accion: "cambiado", campo: "texto", antes: largo, despues: largo.replace("vendedor.", "vendedor (en 14 días).") }, EDICIONES);
    expect(c.antes).toMatch(/^…/);
    expect(c.despues).toMatch(/\(en 14 días\)\.$/);
    expect(paraMostrar({ ancla: "1.7.F", tipoDeAncla: "nivel", accion: "cambiado", campo: "frase", antes: "a", despues: "b" }, EDICIONES).campo).toBe("frase del nivel");
  });

  it("la fecha, en hora de Costa Rica y siempre igual (servidor y navegador)", () => {
    expect(fechaYHora("2026-10-08T22:02:00Z")).toBe("8 oct, 16:02");
    expect(fechaYHora("2026-01-01T03:05:00Z")).toBe("31 dic, 21:05");
  });

  it("la versión que sigue sube el número del medio", () => {
    expect(versionSiguiente("8.7.0")).toBe("8.8.0");
    expect(versionSiguiente("8.7.3")).toBe("8.8.0");
    expect(versionSiguiente(null)).toBe("1.0.0");
  });
});
