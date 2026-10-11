import { describe, expect, it } from "vitest";
import { recortarTranscripcion, TOPE_DE_LA_REUNION_ENTERA } from "./recortar-transcripcion";
import { recortarLaReunion } from "@/lib/exploraciones/correo-de-seguimiento";

describe("recortarTranscripcion", () => {
  it("si la reunión no entra, se queda el principio y el final (ahí se acuerda qué sigue)", () => {
    const t = `INICIO${"x".repeat(50_000)}FINAL`;
    const r = recortarTranscripcion("notas", t, 10_000);
    expect(r.length).toBeLessThan(10_200);
    expect(r).toMatch(/^--- Notas de la reunión ---\nnotas/);
    expect(r).toMatch(/INICIO/);
    expect(r).toMatch(/FINAL$/);
    expect(r).toMatch(/\[…\]/);
  });

  it("si entra, va entera; sin notas o sin transcripción, solo lo que hay", () => {
    expect(recortarTranscripcion("", "hola")).toBe("--- Transcripción ---\nhola");
    expect(recortarTranscripcion("solo notas", "")).toBe("--- Notas de la reunión ---\nsolo notas");
    expect(recortarTranscripcion("", "")).toBe("");
  });

  it("las notas nunca pasan de un tercio del tope", () => {
    const r = recortarTranscripcion("n".repeat(9_000), "t", 9_000);
    expect(r).toContain("n".repeat(3_000));
    expect(r).not.toContain("n".repeat(3_001));
  });

  it("el tope de siempre es 40.000, y el correo de seguimiento usa esta misma función", () => {
    expect(TOPE_DE_LA_REUNION_ENTERA).toBe(40_000);
    expect(recortarLaReunion).toBe(recortarTranscripcion);
  });
});
