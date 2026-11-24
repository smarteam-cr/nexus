import { describe, expect, it } from "vitest";
import { devolverALaCaja, textoConLoDictado } from "./caja";

describe("lo dictado se suma a la caja del chat", () => {
  it("con la caja vacía, la frase empieza con mayúscula", () => {
    expect(textoConLoDictado("", "pierden cuarenta mil al mes")).toBe("Pierden cuarenta mil al mes");
  });

  it("cierra con punto lo escrito antes de sumar otra oración", () => {
    expect(textoConLoDictado("Marco habló con el gerente", "dice que es urgente")).toBe("Marco habló con el gerente. Dice que es urgente");
  });

  it("no repite el signo si lo escrito ya termina en uno", () => {
    expect(textoConLoDictado("¿Qué dijeron de la cobranza? ", "y del WhatsApp")).toBe("¿Qué dijeron de la cobranza? Y del WhatsApp");
  });

  it("una frase vacía no cambia nada", () => {
    expect(textoConLoDictado("Hola", "   ")).toBe("Hola");
  });

  it("respeta el largo máximo", () => {
    expect(textoConLoDictado("abc", "defgh", 6)).toBe("abc. D");
  });
});

describe("⛔ un envío que falla no borra lo que se escribió mientras Nexus pensaba", () => {
  it("sin nada escrito después, vuelve lo que se mandó", () => {
    expect(devolverALaCaja("Pierden US$ 40.000 al mes", "")).toBe("Pierden US$ 40.000 al mes");
    expect(devolverALaCaja("Pierden US$ 40.000 al mes", "   ")).toBe("Pierden US$ 40.000 al mes");
  });

  it("con algo escrito después, van los dos: primero lo que se mandó", () => {
    expect(devolverALaCaja("Pierden US$ 40.000 al mes", "Y el gerente decide")).toBe("Pierden US$ 40.000 al mes\n\nY el gerente decide");
  });

  it("⛔ no corta aunque pase del largo máximo: la caja lo avisa y no deja enviar", () => {
    expect(devolverALaCaja("x".repeat(450), "y".repeat(200))).toHaveLength(652);
  });
});
