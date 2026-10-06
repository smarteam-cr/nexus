/**
 * lib/escala/responsable.test.ts — quién decide cómo evoluciona la escala.
 * (Venía de lib/escala/comentarios/reglas.test.ts, retirado el 2026-10-05.)
 */
import { describe, expect, it } from "vitest";
import { esResponsable, RESPONSABLES_DE_LA_ESCALA } from "./responsable";

describe("el responsable de la escala", () => {
  it("es Elías, por correo (no por rol): sin distinguir mayúsculas", () => {
    expect(RESPONSABLES_DE_LA_ESCALA).toEqual(["egonzalez@smarteamcr.com"]);
    expect(esResponsable("EGonzalez@SmarteamCR.com ")).toBe(true);
    expect(esResponsable("cse@smarteamcr.com")).toBe(false);
    expect(esResponsable(null)).toBe(false);
    expect(esResponsable("")).toBe(false);
  });
});
