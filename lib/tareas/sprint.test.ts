import { describe, expect, it } from "vitest";
import { MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT, MIN_CARACTERES_DE_CONVERSACION } from "./reglas";
import { esLecturaDelSprint, leerTambienLaConversacion, topeDeLaReunion } from "./sprint";

describe("la reunión del sprint (2026-10-27, Elías)", () => {
  it("ya no corta en 5 por persona: el tope es solo de seguridad, y muy por encima", () => {
    expect(topeDeLaReunion(null, true)).toBe(MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT);
    expect(MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT).toBeGreaterThanOrEqual(15);
  });

  it("una reunión con un cliente sigue con 3 y otra del equipo con 5", () => {
    expect(topeDeLaReunion("cliente-1", false)).toBe(3);
    expect(topeDeLaReunion("cliente-1", true)).toBe(3);
    expect(topeDeLaReunion(null, false)).toBe(5);
  });

  it("es del sprint la lectura de la serie de un equipo; la personal y la pedida a mano, no", () => {
    expect(esLecturaDelSprint({ equipo: "marketing" })).toBe(true);
    expect(esLecturaDelSprint({ equipo: null })).toBe(false);
    expect(esLecturaDelSprint(null)).toBe(false);
  });

  it("después de las notas lee la conversación, una vez, si hay una grabada", () => {
    const largo = MIN_CARACTERES_DE_CONVERSACION;
    expect(leerTambienLaConversacion({ delSprint: true, largoTranscript: largo })).toBe(true);
    expect(leerTambienLaConversacion({ delSprint: true, largoTranscript: largo, conversacion: { estado: "error", motivo: "error" } })).toBe(true);
    expect(leerTambienLaConversacion({ delSprint: false, largoTranscript: largo })).toBe(false);
    expect(leerTambienLaConversacion({ delSprint: true, largoTranscript: largo - 1 })).toBe(false);
    expect(leerTambienLaConversacion({ delSprint: true, largoTranscript: largo, conversacion: { estado: "lista" } })).toBe(false);
    expect(leerTambienLaConversacion({ delSprint: true, largoTranscript: largo, conversacion: { estado: "leyendo" } })).toBe(false);
    expect(leerTambienLaConversacion({ delSprint: true, largoTranscript: largo, conversacion: { estado: "error", motivo: "sin_turnos" } })).toBe(false);
  });
});
