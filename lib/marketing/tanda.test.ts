/**
 * lib/marketing/tanda.test.ts — la fecha de la próxima tanda que se muestra (viernes 6:00, hora de Costa Rica).
 */
import { describe, expect, it } from "vitest";
import { fechaCorta, proximaTanda } from "./tanda";

/** Hora de Costa Rica (UTC−6, sin horario de verano) → Date. */
const cr = (iso: string) => new Date(`${iso}-06:00`);

describe("proximaTanda", () => {
  it("un domingo, el viernes que viene", () => {
    expect(proximaTanda(cr("2026-10-04T10:00:00"), "2026-10-02")).toEqual({
      dateKey: "2026-10-09",
      etiqueta: "vie 9 oct, 6:00",
      pendienteHoy: false,
    });
  });

  it("un viernes antes de las 6:00, hoy", () => {
    expect(proximaTanda(cr("2026-10-09T05:30:00"), "2026-10-02").dateKey).toBe("2026-10-09");
  });

  it("un viernes que ya corrió, el de la semana siguiente", () => {
    expect(proximaTanda(cr("2026-10-09T08:00:00"), "2026-10-09").dateKey).toBe("2026-10-16");
  });

  it("un viernes pasadas las 6:00 sin correr: hoy, y lo dice", () => {
    const p = proximaTanda(cr("2026-10-09T09:00:00"), "2026-10-02");
    expect(p.dateKey).toBe("2026-10-09");
    expect(p.pendienteHoy).toBe(true);
  });

  it("un sábado, seis días después; cruza el mes", () => {
    expect(proximaTanda(cr("2026-10-31T12:00:00"), "2026-10-30").dateKey).toBe("2026-11-06");
  });
});

describe("fechaCorta", () => {
  it("día de la semana, día y mes abreviados", () => {
    expect(fechaCorta("2026-08-06")).toBe("jue 6 ago");
  });
});
