/**
 * lib/jobs/turno-por-hora.test.ts — el turno de cada hora de las copias de Odoo y Mercury y del cobro de lo pagado.
 *
 * Correr: `npx vitest run lib/jobs/turno-por-hora.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { retenidoHoy, turnoDeLaHora, turnoRetenido, ULTIMA_HORA_DE_FINANZAS } from "./turno-por-hora";

describe("turno de cada hora", () => {
  it("la clave es el día y la hora de Costa Rica, con dos cifras", () => {
    expect(turnoDeLaHora("2026-10-21", 7)).toBe("2026-10-21T07");
    expect(turnoDeLaHora("2026-10-21", 16)).toBe("2026-10-21T16");
  });

  it("⚠ pasadas las 19 la clave sigue siendo la de las 19: de noche corre una vez, no cada hora", () => {
    /* La edición que lo pone en rojo: sacar el tope. Un servidor caído todo el día correría cada hora hasta medianoche. */
    expect(ULTIMA_HORA_DE_FINANZAS).toBe(19);
    expect(turnoDeLaHora("2026-10-21", 20)).toBe("2026-10-21T19");
    expect(turnoDeLaHora("2026-10-21", 23)).toBe("2026-10-21T19");
  });

  it("retenido cierra el día entero y solo ese día", () => {
    expect(retenidoHoy(turnoRetenido("2026-10-21"), "2026-10-21")).toBe(true);
    expect(retenidoHoy(turnoRetenido("2026-10-20"), "2026-10-21")).toBe(false);
    expect(retenidoHoy("2026-10-21T09", "2026-10-21")).toBe(false);
    expect(retenidoHoy(null, "2026-10-21")).toBe(false);
    /* Un retenido nunca coincide con la clave de una hora: el claim de la hora no lo pisa sin mirarlo antes. */
    expect(turnoRetenido("2026-10-21")).not.toBe(turnoDeLaHora("2026-10-21", 9));
  });
});
