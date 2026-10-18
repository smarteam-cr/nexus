/**
 * lib/cobranza/libro/turno.test.ts — cuándo corre el cobro solo del día (2026-10-18).
 */
import { describe, expect, it } from "vitest";
import { decidirElTurno, estadoDeLaCopia, HORA_DE_INICIO, HORA_LIMITE } from "./turno";

describe("decidirElTurno", () => {
  it("con las dos copias al día corre con las dos", () => {
    expect(decidirElTurno(HORA_DE_INICIO, { ODOO: "al-dia", MERCURY: "al-dia" })).toEqual({ correr: true, fuentes: ["ODOO", "MERCURY"], atrasadas: [] });
  });

  it("antes de la hora de inicio no corre, aunque las copias estén al día", () => {
    expect(decidirElTurno(HORA_DE_INICIO - 1, { ODOO: "al-dia", MERCURY: "al-dia" }).correr).toBe(false);
  });

  it("espera a una copia atrasada hasta la hora límite", () => {
    expect(decidirElTurno(HORA_LIMITE - 1, { ODOO: "atrasada", MERCURY: "al-dia" }).correr).toBe(false);
  });

  it("pasada la hora límite cobra con la que está al día y dice cuál faltó", () => {
    expect(decidirElTurno(HORA_LIMITE, { ODOO: "atrasada", MERCURY: "al-dia" })).toEqual({ correr: true, fuentes: ["MERCURY"], atrasadas: ["ODOO"] });
  });

  it("una copia apagada en este servidor no hace esperar ni cuenta como atrasada", () => {
    expect(decidirElTurno(HORA_DE_INICIO, { ODOO: "al-dia", MERCURY: "apagada" })).toEqual({ correr: true, fuentes: ["ODOO"], atrasadas: [] });
  });
});

describe("estadoDeLaCopia", () => {
  it("al día solo si su última corrida buena es de hoy", () => {
    expect(estadoDeLaCopia(true, "2026-10-18", "2026-10-18")).toBe("al-dia");
    expect(estadoDeLaCopia(true, "2026-10-17", "2026-10-18")).toBe("atrasada");
    expect(estadoDeLaCopia(true, null, "2026-10-18")).toBe("atrasada");
    expect(estadoDeLaCopia(false, "2026-10-18", "2026-10-18")).toBe("apagada");
  });
});
