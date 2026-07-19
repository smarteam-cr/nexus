import { describe, expect, it } from "vitest";
import { parseRunError } from "./run-error";

describe("parseRunError", () => {
  it("extrae el error humanizado del contrato de markError", () => {
    expect(parseRunError(JSON.stringify({ error: "Sin créditos en la API." }))).toBe(
      "Sin créditos en la API.",
    );
  });

  it("cae al mensaje genérico con output vacío, null o no-JSON", () => {
    const generico = parseRunError(null);
    expect(generico).toMatch(/no pudo completar/);
    expect(parseRunError(undefined)).toBe(generico);
    expect(parseRunError("{}")).toBe(generico);
    expect(parseRunError("no soy json")).toBe(generico);
  });

  it("ignora un error vacío o de tipo raro", () => {
    expect(parseRunError(JSON.stringify({ error: "   " }))).toMatch(/no pudo completar/);
    expect(parseRunError(JSON.stringify({ error: 42 }))).toMatch(/no pudo completar/);
  });

  it("no confunde un output de contenido (cards) con un error", () => {
    expect(parseRunError(JSON.stringify({ cards: [{ title: "x" }] }))).toMatch(/no pudo completar/);
  });
});
