/**
 * Etapa 0 del plan maestro (22 nov, ./conversacion.ts): un «gracias» o un «ok» no se ofrece guardar, y después de guardar
 * la conversación sigue sin repetir lo ya guardado en la nota siguiente.
 */
import { describe, expect, it } from "vitest";
import {
  comoSeLee,
  esCortesia,
  loQueConto,
  notaDeLaConversacion,
  paraPreguntar,
  paraSeguirDespuesDeGuardar,
  rondasDePreguntas,
  YA_QUEDO_GUARDADO,
  type MensajeDeLaConversacion,
} from "./conversacion";

describe("esCortesia", () => {
  it.each(["gracias", "Gracias!", "muchas gracias, Nexus", "ok", "Ok, gracias", "listo", "Perfecto 👍", "👍", "👍🏽", "dale", "de acuerdo", "entendido.", "Súper, gracias", "muy bien"])(
    "«%s» es cortesía",
    (t) => expect(esCortesia(t)).toBe(true),
  );

  it.each([
    "Ok, pierden 40 mil al mes",
    "Listo el contrato: firman en enero",
    "gracias a la nueva gerente ya tienen presupuesto",
    "Nexus",
    "de",
    "",
    "Perfecto, el gerente decide",
    "bien, pero no tienen CRM",
  ])("«%s» no es cortesía", (t) => expect(esCortesia(t)).toBe(false));
});

describe("comoSeLee con un «gracias»", () => {
  it("al empezar o después de una respuesta, es cortesía", () => {
    expect(comoSeLee([{ de: "persona", texto: "gracias" }])).toBe("cortesia");
    const m: MensajeDeLaConversacion[] = [
      { de: "persona", texto: "¿Qué dijeron de la cobranza?", es: "consulta" },
      { de: "nexus", texto: "La hacen a mano.", es: "respuesta" },
      { de: "persona", texto: "ok, gracias" },
    ];
    expect(comoSeLee(m)).toBe("cortesia");
  });

  it("si contesta lo que Nexus preguntó, un «ok» cuenta (es un sí)", () => {
    expect(comoSeLee([{ de: "persona", texto: "Pierden 40 mil" }, { de: "nexus", texto: "¿Es al mes?" }, { de: "persona", texto: "ok" }])).toBe("contar");
  });

  it("los botones mandan sobre la cortesía", () => {
    expect(comoSeLee([{ de: "persona", texto: "gracias" }], { contar: true })).toBe("contar");
  });
});

describe("seguir después de guardar", () => {
  const guardada: MensajeDeLaConversacion[] = [
    { de: "persona", texto: "Pierden 40 mil al mes en cartera" },
    { de: "nexus", texto: "¿Es al mes?" },
    { de: "persona", texto: "Sí, al mes" },
  ];

  it("lo contado queda marcado como guardado y Nexus lo deja dicho, una sola vez", () => {
    const m = paraSeguirDespuesDeGuardar(guardada);
    expect(m.map((x) => x.es)).toEqual(["guardado", undefined, "guardado", "cortesia"]);
    expect(m[m.length - 1].texto).toBe(YA_QUEDO_GUARDADO);
    expect(paraSeguirDespuesDeGuardar(m)).toHaveLength(m.length);
  });

  it("la nota siguiente lleva solo lo nuevo, y lo guardado no respalda sus cambios", () => {
    const m = [...paraSeguirDespuesDeGuardar(guardada), { de: "persona" as const, texto: "El gerente decide en enero" }];
    expect(loQueConto(m)).toEqual(["El gerente decide en enero"]);
    expect(notaDeLaConversacion(m)).toBe("El gerente decide en enero");
  });

  it("la nota nueva arranca con sus rondas de preguntas, y un «gracias» no gasta ninguna", () => {
    expect(rondasDePreguntas(guardada)).toBe(1);
    const m = [...paraSeguirDespuesDeGuardar(guardada), { de: "persona" as const, texto: "gracias", es: "cortesia" as const }, { de: "nexus" as const, texto: "Con gusto.", es: "cortesia" as const }];
    expect(rondasDePreguntas(m)).toBe(0);
    expect(rondasDePreguntas([...m, { de: "persona", texto: "El gerente decide" }, { de: "nexus", texto: "¿Cuándo?" }])).toBe(1);
  });

  it("después de «Guardado. ¿Algo más?», lo que escribe no se lee como respuesta a una pregunta de Nexus", () => {
    const m = [...paraSeguirDespuesDeGuardar(guardada), { de: "persona" as const, texto: "¿Qué dijeron de la cobranza?" }];
    expect(comoSeLee(m)).toBe("pregunta");
  });

  it("«¿Era una pregunta?» no se ofrece sobre un «gracias» ni sobre lo guardado", () => {
    expect(paraPreguntar([{ de: "persona", texto: "gracias", es: "cortesia" }])).toBeNull();
    expect(paraPreguntar([{ de: "persona", texto: "Pierden 40 mil", es: "guardado" }])).toBeNull();
  });
});
