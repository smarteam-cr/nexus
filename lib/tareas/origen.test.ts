import { describe, expect, it } from "vitest";
import { textoDeQuienesEstuvieron } from "./origen";

describe("textoDeQuienesEstuvieron (P5)", () => {
  it("los nombres de la casa y cuántos de afuera, en una frase", () => {
    expect(textoDeQuienesEstuvieron({ nombres: ["Lidia", "Andrés"], deAfuera: 2 })).toBe("Estuvieron Lidia, Andrés y 2 de afuera");
    expect(textoDeQuienesEstuvieron({ nombres: ["Lidia"], deAfuera: 1 })).toBe("Estuvieron Lidia y 1 de afuera");
    expect(textoDeQuienesEstuvieron({ nombres: ["Lidia", "Andrés"], deAfuera: 0 })).toBe("Estuvieron Lidia y Andrés");
    expect(textoDeQuienesEstuvieron({ nombres: [], deAfuera: 0 })).toBe("");
  });
  it("con muchos de la casa, los primeros cuatro y cuántos más", () => {
    expect(textoDeQuienesEstuvieron({ nombres: ["A", "B", "C", "D", "E", "F"], deAfuera: 0 })).toBe("Estuvieron A, B, C, D y 2 más de la casa");
  });
});
