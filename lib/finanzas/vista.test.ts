/**
 * lib/finanzas/vista.test.ts — la vista de Finanzas de cada persona (rediseño 2026-10-03).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import { ENTRADA_DE_VISTA, vistaFinanzasDe } from "./vista";

describe("vistaFinanzasDe", () => {
  it("un SUPER_ADMIN supervisa salvo que haya elegido Dirección", () => {
    expect(vistaFinanzasDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: null })).toBe("SUPERVISA");
    expect(vistaFinanzasDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "SUPERVISA" })).toBe("SUPERVISA");
    expect(vistaFinanzasDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "DIRECCION" })).toBe("DIRECCION");
  });

  it("cualquier otro rol registra, aunque tenga un valor guardado", () => {
    expect(vistaFinanzasDe({ roleEnum: "ADMIN" })).toBe("REGISTRA");
    expect(vistaFinanzasDe({ roleEnum: "ADMIN", vistaFinanzas: "DIRECCION" })).toBe("REGISTRA");
    expect(vistaFinanzasDe({ roleEnum: null })).toBe("REGISTRA");
  });

  it("un valor raro se lee como el de por defecto", () => {
    expect(vistaFinanzasDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "OTRA" })).toBe("SUPERVISA");
  });

  it("cada vista tiene su pantalla de entrada dentro de Finanzas", () => {
    for (const href of Object.values(ENTRADA_DE_VISTA)) expect(href.startsWith("/finanzas/")).toBe(true);
    expect(ENTRADA_DE_VISTA.REGISTRA).toBe("/finanzas/pendientes");
    expect(ENTRADA_DE_VISTA.SUPERVISA).toBe("/finanzas/supervision");
    expect(ENTRADA_DE_VISTA.DIRECCION).toBe("/finanzas/equilibrio");
  });
});
