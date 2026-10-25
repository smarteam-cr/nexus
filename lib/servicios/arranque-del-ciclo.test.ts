/**
 * lib/servicios/arranque-del-ciclo.test.ts — el kickoff anterior al servicio y la exploración del ciclo (M1 y M2 del
 * roadmap, 2026-10-24).
 */
import { describe, expect, it } from "vitest";
import { avisoSinExploracionDelCiclo, kickoffAnteriorAlServicio, lecturasDelCiclo } from "./arranque-del-ciclo";
import { PLANTILLA_DEL_KICKOFF_RECURRENTE } from "@/lib/entregables/registro";

describe("la exploración del ciclo", () => {
  const lecturas = {
    "meet:a": { fecha: "2026-07-10T15:00:00Z", en: "2026-07-10T18:00:00Z" },
    "meet:b": { fecha: "2026-10-20T15:00:00Z", en: "2026-10-20T18:00:00Z" },
    // Sin fecha de la reunión: cuenta cuándo se leyó.
    "documento:c": { en: "2026-10-22T10:00:00Z" },
    "meet:rara": { fecha: "no es una fecha", en: "tampoco" },
  };

  it("en el primer ciclo cuenta toda lectura con fecha", () => {
    expect(lecturasDelCiclo(lecturas, null)).toBe(3);
  });

  it("desde el cierre del ciclo anterior, solo lo de este ciclo", () => {
    expect(lecturasDelCiclo(lecturas, new Date("2026-10-01T00:00:00Z"))).toBe(2);
    expect(lecturasDelCiclo(lecturas, new Date("2026-11-01T00:00:00Z"))).toBe(0);
  });

  it("sin exploración, cero", () => {
    expect(lecturasDelCiclo({}, null)).toBe(0);
  });

  it("el aviso del diagnóstico nombra el ciclo y lo que falta", () => {
    expect(avisoSinExploracionDelCiclo(1)).toMatch(/ciclo 1/);
    expect(avisoSinExploracionDelCiclo(1)).toMatch(/ninguna reunión leída/);
  });
});

describe("el kickoff anterior al servicio", () => {
  const delServicio = PLANTILLA_DEL_KICKOFF_RECURRENTE;
  it("RC Inmobiliaria: generado en julio, sin plantilla anotada → anterior", () => {
    expect(kickoffAnteriorAlServicio({ conContenido: true, plantillaId: null, plantillaDelServicio: delServicio })).toBe(true);
  });
  it("generado con la plantilla de siempre después del 17 oct → también anterior", () => {
    expect(kickoffAnteriorAlServicio({ conContenido: true, plantillaId: "kickoff", plantillaDelServicio: delServicio })).toBe(true);
  });
  it("con la plantilla del servicio → al día", () => {
    expect(kickoffAnteriorAlServicio({ conContenido: true, plantillaId: delServicio, plantillaDelServicio: delServicio })).toBe(false);
  });
  it("vacío → no se avisa: se genera, no se regenera", () => {
    expect(kickoffAnteriorAlServicio({ conContenido: false, plantillaId: null, plantillaDelServicio: delServicio })).toBe(false);
  });
});
