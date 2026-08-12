/**
 * lib/timeline/delivery-sessions.test.ts — CUÁNDO EL NÚMERO DE SESIONES ES COMPARTIDO.
 *
 * El caso real (Wherex, 2026-08-11): «Desarrollo / Integración» e «Integraciones» ocupaban la
 * MISMA ventana (S1-S5) y cada una mostraba "17 ses". Leído de corrido parece un error de
 * cálculo; es la consecuencia correcta de dos fases pisadas — que además, ahí, eran la misma
 * fase duplicada.
 *
 * ⚠ Lo que este archivo NO prueba, a propósito: que las sesiones se repartan entre las fases
 * sin repetirse. Se intentó ("gana la ventana más corta") y el remedio era peor: una fase de 4
 * semanas cuyas semanas están todas cubiertas por fases más cortas quedaba en CERO sesiones
 * teniendo 22 tareas, y un 0 se lee como "acá no se hizo nada". El número por fase se queda
 * como está —"esto ocurrió mientras la fase corría", cierto para las dos— y lo que se agrega
 * es DECIR con quién lo comparte.
 *
 * Correr: `npx vitest run lib/timeline/delivery-sessions.test.ts --project unit`.
 */
import { describe, test, expect } from "vitest";
import { ventanasCompartidas, nombresDeFasesSolapadas, type VentanaDeFase } from "./delivery-sessions";

const v = (id: string, start: number, end: number): VentanaDeFase => ({ id, start, end });

describe("ventanasCompartidas", () => {
  test("fases contiguas NO comparten nada (tocarse por el borde no es solaparse)", () => {
    // a termina en S2 (exclusivo) y b arranca en S2: ninguna semana en común.
    const m = ventanasCompartidas([v("a", 0, 2), v("b", 2, 4)]);
    expect(m.get("a")).toEqual([]);
    expect(m.get("b")).toEqual([]);
  });

  test("⚠ ventanas IDÉNTICAS (el caso Wherex) → cada una nombra a la otra", () => {
    const m = ventanasCompartidas([v("desarrollo", 1, 5), v("integraciones", 1, 5)]);
    expect(m.get("desarrollo")).toEqual(["integraciones"]);
    expect(m.get("integraciones")).toEqual(["desarrollo"]);
  });

  test("solape PARCIAL de una sola semana también cuenta", () => {
    const m = ventanasCompartidas([v("a", 0, 3), v("b", 2, 5)]);
    expect(m.get("a")).toEqual(["b"]);
  });

  test("una fase adentro de otra: las dos se marcan", () => {
    const m = ventanasCompartidas([v("larga", 0, 10), v("corta", 3, 4)]);
    expect(m.get("larga")).toEqual(["corta"]);
    expect(m.get("corta")).toEqual(["larga"]);
  });

  test("tres fases pisadas: cada una lista a las OTRAS DOS, nunca a sí misma", () => {
    const m = ventanasCompartidas([v("a", 0, 5), v("b", 0, 5), v("c", 0, 5)]);
    expect(m.get("a")).toEqual(["b", "c"]);
    expect(m.get("b")).toEqual(["a", "c"]);
    expect(m.get("c")).toEqual(["a", "b"]);
  });

  test("una fase sola vuelve con lista vacía, no ausente (la UI no tiene que chequear undefined)", () => {
    const m = ventanasCompartidas([v("sola", 0, 2)]);
    expect(m.get("sola")).toEqual([]);
  });

  test("sin fases → mapa vacío, no revienta", () => {
    expect(ventanasCompartidas([]).size).toBe(0);
  });
});

describe("nombresDeFasesSolapadas", () => {
  test("resuelve las ventanas desde durationWeeks/startWeek y devuelve NOMBRES", () => {
    // Contiguas por default: Semana 0 (S0-S1) → Base (S1-S3). Sin solape.
    // «Integraciones» arranca explícitamente en S1 y dura 2 → S1-S3: pisa a «Base» entera.
    const fases = [
      { id: "p0", name: "Semana 0", durationWeeks: 1, startWeek: null },
      { id: "p1", name: "Base", durationWeeks: 2, startWeek: null },
      { id: "p2", name: "Integraciones", durationWeeks: 2, startWeek: 1 },
    ];
    const m = nombresDeFasesSolapadas(fases);
    expect(m.get("p0")).toEqual([]);
    expect(m.get("p1")).toEqual(["Integraciones"]);
    expect(m.get("p2")).toEqual(["Base"]);
  });

  test("dos fases con el MISMO nombre duplicado se nombran igual (no se filtra el ruido)", () => {
    // Si el cronograma tiene dos «Integraciones», el aviso lo dice tal cual: es la señal.
    const fases = [
      { id: "a", name: "Integraciones", durationWeeks: 2, startWeek: 0 },
      { id: "b", name: "Integraciones", durationWeeks: 2, startWeek: 0 },
    ];
    expect(nombresDeFasesSolapadas(fases).get("a")).toEqual(["Integraciones"]);
  });
});
