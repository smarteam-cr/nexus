import { describe, expect, it } from "vitest";
import {
  conPropuesta,
  descartarPropuesta,
  estadoDeLaPresentacion,
  fechaEnPalabras,
  fijarFecha,
  hoyEnCostaRica,
  leerPresentacion,
  leerPresentacionDetectada,
  marcarListo,
  sinFecha,
  usarPropuesta,
  PRESENTACION_VACIA,
} from "./presentacion-del-diagnostico";

const AHORA = "2026-10-07T15:00:00.000Z";
const REUNION = { id: "s1", titulo: "Seguimiento", fecha: "2026-10-05" };

describe("la fecha de presentación del diagnóstico", () => {
  it("sin nada guardado, todavía no se respondió", () => {
    expect(estadoDeLaPresentacion(leerPresentacion(null), "2026-10-07")).toBe("sin-responder");
    expect(estadoDeLaPresentacion(sinFecha(PRESENTACION_VACIA, "cse@x", AHORA), "2026-10-07")).toBe("sin-fecha");
  });

  it("se pide reconfirmar desde dos días antes y hasta una semana después", () => {
    const p = fijarFecha(PRESENTACION_VACIA, "2026-10-10", "cse@x", AHORA);
    expect(estadoDeLaPresentacion(p, "2026-10-07")).toBe("con-fecha");
    expect(estadoDeLaPresentacion(p, "2026-10-08")).toBe("por-reconfirmar");
    expect(estadoDeLaPresentacion(p, "2026-10-17")).toBe("por-reconfirmar");
    expect(estadoDeLaPresentacion(p, "2026-10-18")).toBe("con-fecha");
  });

  it("listo vale para SU fecha: si la fecha cambia, se vuelve a pedir", () => {
    const listo = marcarListo(fijarFecha(PRESENTACION_VACIA, "2026-10-10", "cse@x", AHORA), "2026-10-10", "cse@x", AHORA);
    expect(estadoDeLaPresentacion(listo, "2026-10-09")).toBe("listo");
    const corrida = fijarFecha(listo, "2026-10-14", "cse@x", AHORA);
    expect(corrida.listo).toBeNull();
    expect(estadoDeLaPresentacion(corrida, "2026-10-13")).toBe("por-reconfirmar");
  });

  it("marcar listo con otra fecha la reconfirma ahí", () => {
    const p = marcarListo(fijarFecha(PRESENTACION_VACIA, "2026-10-10", "cse@x", AHORA), "2026-10-12", "cse@x", AHORA);
    expect(p.fecha).toBe("2026-10-12");
    expect(p.listo?.fecha).toBe("2026-10-12");
  });

  it("una propuesta de una reunión se usa, se descarta, y no se repite", () => {
    const con = conPropuesta(PRESENTACION_VACIA, { fecha: "2026-10-09", cita: "el diagnóstico lo vemos el viernes", reunion: REUNION }, AHORA);
    expect(con?.propuesta?.fecha).toBe("2026-10-09");
    const usada = usarPropuesta(con!, "cse@x", AHORA);
    expect(usada?.fecha).toBe("2026-10-09");
    expect(usada?.propuesta).toBeNull();
    expect(usada?.fuente).toContain("Seguimiento");
    // La misma fecha ya fijada no se vuelve a proponer.
    expect(conPropuesta(usada!, { fecha: "2026-10-09", cita: "x", reunion: REUNION }, AHORA)).toBeNull();
    const descartada = descartarPropuesta(con!);
    expect(conPropuesta(descartada, { fecha: "2026-10-09", cita: "x", reunion: REUNION }, AHORA)).toBeNull();
  });

  it("lo que dice el modelo se valida: fecha real, después de la reunión y no muy lejos", () => {
    expect(leerPresentacionDetectada({ fecha: "2026-10-09", cita: "el viernes" }, "2026-10-05")).toEqual({ fecha: "2026-10-09", cita: "el viernes" });
    expect(leerPresentacionDetectada({ fecha: "2026-10-01", cita: "x" }, "2026-10-05")).toBeNull();
    expect(leerPresentacionDetectada({ fecha: "2027-06-01", cita: "x" }, "2026-10-05")).toBeNull();
    expect(leerPresentacionDetectada({ fecha: "2026-02-30", cita: "x" }, "2026-01-05")).toBeNull();
    expect(leerPresentacionDetectada({ fecha: "2026-10-09", cita: "" }, "2026-10-05")).toBeNull();
  });

  it("descartar la fecha propuesta anota quién y cuándo, y no se vuelve a proponer", () => {
    const con = conPropuesta(PRESENTACION_VACIA, { fecha: "2026-10-09", cita: "el viernes", reunion: REUNION }, AHORA)!;
    const descartada = descartarPropuesta(con, "CSE@x", AHORA);
    expect(descartada.descartadasPor).toEqual([{ fecha: "2026-10-09", por: "cse@x", en: AHORA }]);
    expect(descartada.descartadas).toEqual(["2026-10-09"]);
    expect(conPropuesta(descartada, { fecha: "2026-10-09", cita: "x", reunion: REUNION }, AHORA)).toBeNull();
    // Se guarda y se vuelve a leer igual.
    expect(leerPresentacion(JSON.parse(JSON.stringify(descartada))).descartadasPor).toEqual(descartada.descartadasPor);
    // Sin quién (llamadas viejas), descarta igual sin anotar.
    expect(descartarPropuesta(con).descartadasPor).toBeUndefined();
  });

  it("las fechas se dicen en palabras y hoy es el de Costa Rica", () => {
    expect(fechaEnPalabras("2026-10-08")).toBe("jueves 8 de octubre");
    expect(hoyEnCostaRica(new Date("2026-10-08T03:00:00.000Z"))).toBe("2026-10-07");
  });
});
