/**
 * lib/escala/posicion.test.ts — la posición en la Escala que comparten los cuatro documentos.
 *
 * Correr: `npx vitest run lib/escala/posicion.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  esPosicionLegada,
  leerPosicion,
  nombreDeNivel,
  posicionParaLaEntrega,
  posicionParaPrompt,
  textoDeVentana,
  valorDeNivel,
  ventanaDeRemedicion,
  POSICION_VACIA,
} from "./posicion";

const area = (over: Record<string, string> = {}) => ({
  area: "Ventas",
  base: "Funcional",
  basePiso: "1.3 Datos — la etapa se llena a mano",
  produccion: "Inicial",
  produccionPiso: "1.6 Priorización de Leads — nadie decide a quién llamar primero",
  brecha: "Base más alta que producción: la conversación es de adopción.",
  cercania: "Base operativa cerca de Eficiente",
  meta: "Funcional",
  ...over,
});

describe("el nivel se reconoce por su nombre, en los dos idiomas", () => {
  it("nombres, cifras y grafías", () => {
    expect(valorDeNivel("Funcional")).toBe(3);
    expect(valorDeNivel("3 · Funcional")).toBe(3);
    expect(valorDeNivel("Óptimo")).toBe(5);
    expect(valorDeNivel("optimo")).toBe(5);
    expect(valorDeNivel("Functional")).toBe(3);
    expect(valorDeNivel("2/5")).toBe(2);
    expect(valorDeNivel("")).toBeNull();
    expect(valorDeNivel(undefined)).toBeNull();
  });

  it("⚠ «deficiente» no se confunde con «eficiente», ni «ineficiente» con un nivel", () => {
    expect(valorDeNivel("Deficiente")).toBe(1);
    expect(valorDeNivel("ineficiente")).toBeNull();
  });

  it("la cifra vuelve a la grafía exacta del reglamento", () => {
    expect(nombreDeNivel(5)).toBe("Óptimo");
    expect(nombreDeNivel(0)).toBeNull();
  });
});

describe("leerPosicion", () => {
  it("devuelve las áreas con nivel y descarta las filas sin ninguno", () => {
    const p = leerPosicion({
      intro: "Hola",
      areas: [area(), area({ area: "Marketing", base: "", produccion: "" }), { area: "" }],
      remedicion: "a los 60 días",
    });
    expect(p?.areas.map((a) => a.area)).toEqual(["Ventas"]);
    expect(p?.remedicion).toBe("a los 60 días");
  });

  it("una capa sola alcanza: la otra puede no tener evidencia", () => {
    expect(leerPosicion({ areas: [area({ base: "" })] })?.areas).toHaveLength(1);
  });

  it("sin áreas con nivel no hay posición", () => {
    expect(leerPosicion({ intro: "texto", areas: [] })).toBeNull();
    expect(leerPosicion(null)).toBeNull();
  });

  it("⛔ un diagnóstico de antes de la 5.2 se reconoce como legado y NO se traduce", () => {
    const viejo = { metrics: [{ value: "2/5", label: "Ventas — Inicial" }] };
    expect(esPosicionLegada(viejo)).toBe(true);
    // Otra vara: presentarlo como punto de partida en 5.2 sería afirmar algo que nadie midió.
    expect(leerPosicion(viejo)).toBeNull();
    expect(esPosicionLegada({ areas: [area()], metrics: [{ value: "2/5", label: "x" }] })).toBe(false);
  });
});

describe("la Entrega: punto de partida, meta y remedición, sin nivel nuevo", () => {
  const entrega = new Date("2026-09-15T00:00:00Z");

  it("la remedición va entre 60 y 90 días después de entregar", () => {
    const v = ventanaDeRemedicion(entrega);
    expect(v.desde.toISOString().slice(0, 10)).toBe("2026-11-14");
    expect(v.hasta.toISOString().slice(0, 10)).toBe("2026-12-14");
    expect(textoDeVentana(v)).toBe("Entre el 14 de noviembre de 2026 y el 14 de diciembre de 2026");
    expect(textoDeVentana(v, "en")).toBe("Between November 14, 2026 and December 14, 2026");
  });

  it("copia lo que midió el diagnóstico y no deja la cercanía, que ya es vieja", () => {
    const diag = leerPosicion({ areas: [area()] });
    const p = posicionParaLaEntrega(diag, entrega);
    expect(p.areas[0].base).toBe("Funcional");
    expect(p.areas[0].meta).toBe("Funcional");
    expect(p.areas[0].cercania).toBe("");
    expect(p.remedicion).toContain("Entre el 14 de noviembre de 2026");
    expect(p.intro).toContain("no se declara hoy");
  });

  it("sin diagnóstico medido, la sección queda vacía (y se apaga sola)", () => {
    expect(posicionParaLaEntrega(null, entrega)).toEqual(POSICION_VACIA);
  });
});

describe("posicionParaPrompt", () => {
  it("dice capa por capa, con el piso, la brecha y la meta", () => {
    const texto = posicionParaPrompt(leerPosicion({ areas: [area({ base: "" })] })!);
    expect(texto).toContain("Ventas: base operativa sin nivel; producción Inicial (piso: 1.6 Priorización de Leads");
    expect(texto).toContain("Brecha: Base más alta");
    expect(texto).toContain("Meta con el proyecto: Funcional");
  });
});
