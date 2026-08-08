import { describe, it, expect } from "vitest";
import { elegirImpersonado, esRecursoDeCalendario } from "./elegir-impersonado";

/**
 * lib/google/elegir-impersonado.test.ts — A QUIÉN SE IMPERSONA, COMO TABLA.
 * Decisión de Elías (2026-08-08): cuando la reunión la creó el cliente, Nexus la lee a
 * través de un miembro NUESTRO invitado — siempre.
 */

const INTERNO_A = "asalas@smarteamcr.com";
const INTERNO_B = "bcenteno@smarteamcr.com";
const CLIENTE = "gerente@wherex.cl";

describe("elegirImpersonado — la tabla", () => {
  it("organizador del equipo → él, sin mirar a nadie más", () => {
    expect(elegirImpersonado(INTERNO_A, [CLIENTE, INTERNO_B])).toBe(INTERNO_A);
  });

  it("organizador CLIENTE → el primer participante interno (el caso de las ~267)", () => {
    expect(elegirImpersonado(CLIENTE, [CLIENTE, INTERNO_A])).toBe(INTERNO_A);
  });

  it("organizador SALA → el primer participante interno (la sala con 25 docs y 0 leídos)", () => {
    expect(elegirImpersonado("c_abc123@group.calendar.google.com", [INTERNO_A, CLIENTE])).toBe(INTERNO_A);
    expect(elegirImpersonado("sala-1@resource.calendar.google.com", [INTERNO_B])).toBe(INTERNO_B);
  });

  it("determinismo: con dos internos gana SIEMPRE el mismo (alfabético)", () => {
    /* Idempotencia del reintento: la misma sesión elige siempre a la misma persona, así que
       el diagnóstico de un fallo es reproducible y no cambia de cuenta a mitad de camino. */
    expect(elegirImpersonado(CLIENTE, [INTERNO_B, INTERNO_A])).toBe(INTERNO_A);
    expect(elegirImpersonado(CLIENTE, [INTERNO_A, INTERNO_B])).toBe(INTERNO_A);
  });

  it("reunión 100% externa → null (fallo con procedencia, no «sin contenido»)", () => {
    expect(elegirImpersonado(CLIENTE, [CLIENTE, "otro@wherex.cl"])).toBeNull();
    expect(elegirImpersonado(null, [])).toBeNull();
  });

  it("sin organizador pero con un interno invitado → el interno", () => {
    expect(elegirImpersonado(null, [CLIENTE, INTERNO_A])).toBe(INTERNO_A);
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(elegirImpersonado("  ASalas@Smarteamcr.com ", [])).toBe(INTERNO_A);
  });

  it("una sala del PROPIO dominio tampoco se impersona", () => {
    /* Ser "del dominio" no la vuelve una cuenta de usuario: la delegación no la cubre. */
    expect(elegirImpersonado("c_x@group.calendar.google.com", ["c_y@group.calendar.google.com"])).toBeNull();
  });
});

describe("candidatosImpersonables — la lista para el fallback de auth", () => {
  it("organizador nuestro primero, después internos alfabéticos, sin repetidos", async () => {
    const { candidatosImpersonables } = await import("./elegir-impersonado");
    expect(candidatosImpersonables(INTERNO_B, [INTERNO_A, INTERNO_B, CLIENTE])).toEqual([
      INTERNO_B,
      INTERNO_A,
    ]);
    expect(candidatosImpersonables(CLIENTE, [INTERNO_B, INTERNO_A])).toEqual([INTERNO_A, INTERNO_B]);
    expect(candidatosImpersonables(CLIENTE, [CLIENTE])).toEqual([]);
  });

  it("elegirImpersonado ES el primero de la lista — una sola fuente de orden", async () => {
    /* Si divergieran, el criterio de rescate y el pipeline elegirían distinta cuenta para la
       misma sesión y la idempotencia se rompe. */
    const { candidatosImpersonables } = await import("./elegir-impersonado");
    for (const [org, parts] of [
      [INTERNO_A, [CLIENTE, INTERNO_B]],
      [CLIENTE, [INTERNO_B, INTERNO_A]],
      [null, []],
    ] as const) {
      expect(elegirImpersonado(org, parts)).toBe(candidatosImpersonables(org, parts)[0] ?? null);
    }
  });
});

describe("esRecursoDeCalendario", () => {
  it("reconoce los dos sabores de recurso", () => {
    expect(esRecursoDeCalendario("c_abc@group.calendar.google.com")).toBe(true);
    expect(esRecursoDeCalendario("sala@resource.calendar.google.com")).toBe(true);
    expect(esRecursoDeCalendario("asalas@smarteamcr.com")).toBe(false);
  });
});
