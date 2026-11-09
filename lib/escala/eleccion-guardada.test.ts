/**
 * lib/escala/eleccion-guardada.test.ts — las áreas elegidas en La escala sobreviven a recargar, por exploración y por
 * navegador, y lo guardado se lee con tolerancia.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cargarLaEleccion, claveDeLaEleccion, guardarLaEleccion, leerLaEleccion, textoDeLaEleccion } from "./eleccion-guardada";

const AREAS = ["1", "2", "3"];

describe("leer lo guardado", () => {
  it("⛔ ida y vuelta: las áreas, en su orden, y la principal", () => {
    const e = { elegidas: ["1", "2"], principalId: "1" };
    expect(leerLaEleccion(textoDeLaEleccion(e), AREAS)).toEqual(e);
  });

  it("⛔ soltar todas también se recuerda", () => {
    expect(leerLaEleccion(textoDeLaEleccion({ elegidas: [], principalId: null }), AREAS)).toEqual({ elegidas: [], principalId: null });
  });

  it("descarta áreas que ya no existen y repetidas; la principal solo si quedó elegida", () => {
    expect(leerLaEleccion(JSON.stringify({ elegidas: ["2", "9", "2", 4], principalId: "9" }), AREAS)).toEqual({ elegidas: ["2"], principalId: null });
  });

  it("lo ilegible, de otra forma, o con áreas que ya no existe ninguna: la de entrada (null)", () => {
    expect(leerLaEleccion(null, AREAS)).toBeNull();
    expect(leerLaEleccion("{roto", AREAS)).toBeNull();
    expect(leerLaEleccion(JSON.stringify({ areas: ["1"] }), AREAS)).toBeNull();
    expect(leerLaEleccion(JSON.stringify(["1"]), AREAS)).toBeNull();
    expect(leerLaEleccion(JSON.stringify({ elegidas: ["8", "9"], principalId: "8" }), AREAS)).toBeNull();
  });

  it("una clave por lugar y por exploración", () => {
    expect(claveDeLaEleccion("preventa", "a")).not.toBe(claveDeLaEleccion("preventa", "b"));
    expect(claveDeLaEleccion("preventa", "a")).not.toBe(claveDeLaEleccion("cuenta", "a"));
  });
});

describe("el navegador", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("⛔ lo guardado en una exploración vuelve al recargar, y no se cruza con otra", () => {
    const memoria = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v) },
    });
    guardarLaEleccion(claveDeLaEleccion("preventa", "exp-1"), { elegidas: ["1", "2"], principalId: "1" });
    expect(cargarLaEleccion(claveDeLaEleccion("preventa", "exp-1"), AREAS)).toEqual({ elegidas: ["1", "2"], principalId: "1" });
    expect(cargarLaEleccion(claveDeLaEleccion("preventa", "exp-2"), AREAS)).toBeNull();
  });

  it("sin almacenamiento (lanza), no se rompe: no recuerda nada", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("lleno");
        },
      },
    });
    expect(() => guardarLaEleccion("k", { elegidas: ["1"], principalId: null })).not.toThrow();
    expect(cargarLaEleccion("k", AREAS)).toBeNull();
  });
});
