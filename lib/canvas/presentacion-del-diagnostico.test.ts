import { describe, expect, it } from "vitest";
import { fechaEnPalabras, hoyEnCostaRica, leerPresentacion, leerPresentacionDetectada } from "./presentacion-del-diagnostico";

/* Las reglas de la pregunta (las cuatro piezas, quién responde, el estado) se prueban en lib/presentaciones/reglas.test.ts.
   Acá queda lo propio del diagnóstico: la fecha que lee Nexus en una reunión y el Json viejo que lee la migración. */

describe("lo propio del diagnóstico en la fecha de presentación", () => {
  it("lo que dice el modelo se valida: fecha real, después de la reunión y no muy lejos", () => {
    expect(leerPresentacionDetectada({ fecha: "2026-10-09", cita: "el viernes" }, "2026-10-05")).toEqual({ fecha: "2026-10-09", cita: "el viernes" });
    expect(leerPresentacionDetectada({ fecha: "2026-10-01", cita: "x" }, "2026-10-05")).toBeNull();
    expect(leerPresentacionDetectada({ fecha: "2027-06-01", cita: "x" }, "2026-10-05")).toBeNull();
    expect(leerPresentacionDetectada({ fecha: "2026-02-30", cita: "x" }, "2026-01-05")).toBeNull();
    expect(leerPresentacionDetectada({ fecha: "2026-10-09", cita: "" }, "2026-10-05")).toBeNull();
  });

  it("el Json viejo se lee tolerante: null, basura o lo que dejó la pantalla de antes", () => {
    expect(leerPresentacion(null)).toEqual({ v: 1, fecha: null });
    expect(leerPresentacion("x")).toEqual({ v: 1, fecha: null });
    const viejo = leerPresentacion({
      v: 1,
      fecha: "2026-10-10",
      fijadaPor: "cse@x",
      fijadaEn: "2026-10-07T15:00:00.000Z",
      descartadasPor: [{ fecha: "2026-10-09", por: "cse@x", en: "2026-10-07T14:00:00.000Z" }],
    });
    expect(viejo.fecha).toBe("2026-10-10");
    expect(viejo.descartadasPor).toHaveLength(1);
  });

  it("las fechas se dicen en palabras y hoy es el de Costa Rica", () => {
    expect(fechaEnPalabras("2026-10-08")).toBe("jueves 8 de octubre");
    expect(hoyEnCostaRica(new Date("2026-10-08T03:00:00.000Z"))).toBe("2026-10-07");
  });
});
