/**
 * lib/exploraciones/versiones-del-area.test.ts — la foto de la página de un área (23 nov): toma solo lo de esa área, y
 * volver a una versión reemplaza solo eso (la revisión del 23 nov: un filtro mal hecho borraría otra área o el Resumen).
 */
import { describe, expect, it } from "vitest";
import { contenidoConLaFoto, esTextoDelArea, fotoDelArea, huellaDelArea } from "./versiones-del-area";

const CONTENIDO = {
  descripcionesDeLaEscala: {
    "1": { texto: "Ventas, antes", origen: "mano", firma: "f1", at: "2026-11-20T10:00:00.000Z", por: null },
    "10": { texto: "Otra área", origen: "agente", firma: "f10", at: "2026-11-20T10:00:00.000Z", por: null },
  },
  textosDelRadar: { "1.3": { texto: "Radar de 1.3", nivel: "D" }, "1.30": { texto: "Radar de 1.30", nivel: "F" }, "10.3": { texto: "Radar de 10.3", nivel: "D" } },
  textosDeLaPagina: {
    "area.1.titulo.casos": "Lo que haríamos",
    "area.10.titulo.casos": "Lo de la otra",
    "detalle.1.3.abc": "Priorizar el registro",
    "detalle.1.30.abc": "De la 1.30",
    "resumen.bajada.x1": "La bajada del Resumen",
  },
  otraCosa: { se: "queda" },
} as never;

describe("la foto de la página de un área", () => {
  it("toma solo lo del área 1: no el área 10, ni la dimensión 1.30 de otra área, ni el Resumen", () => {
    const f = fotoDelArea(CONTENIDO, "1", ["1.3"]);
    expect(f.descripcion?.texto).toBe("Ventas, antes");
    expect(Object.keys(f.textosDelRadar)).toEqual(["1.3"]);
    expect(Object.keys(f.textosDeLaPagina).sort()).toEqual(["area.1.titulo.casos", "detalle.1.3.abc"]);
    expect(esTextoDelArea("area.10.titulo.casos", "1", ["1.3"])).toBe(false);
  });

  it("volver a una versión reemplaza solo lo del área y deja lo demás igual", () => {
    const vieja = { areaId: "1", descripcion: null, textosDelRadar: {}, textosDeLaPagina: { "area.1.titulo.casos": "El título de antes" } };
    const nuevo = contenidoConLaFoto(CONTENIDO, vieja, ["1.3"]) as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(nuevo.descripcionesDeLaEscala)).toEqual(["10"]);
    expect(Object.keys(nuevo.textosDelRadar).sort()).toEqual(["1.30", "10.3"]);
    expect(nuevo.textosDeLaPagina).toEqual({
      "area.10.titulo.casos": "Lo de la otra",
      "detalle.1.30.abc": "De la 1.30",
      "resumen.bajada.x1": "La bajada del Resumen",
      "area.1.titulo.casos": "El título de antes",
    });
    expect(nuevo.otraCosa).toEqual({ se: "queda" });
  });

  it("la huella no cambia por la fecha o la firma de la descripción: solo por lo escrito", () => {
    const a = fotoDelArea(CONTENIDO, "1", ["1.3"]);
    const b = { ...a, descripcion: { ...a.descripcion!, at: "2026-11-23T00:00:00.000Z", firma: "otra" } };
    expect(huellaDelArea(b)).toBe(huellaDelArea(a));
    expect(huellaDelArea({ ...a, textosDeLaPagina: {} })).not.toBe(huellaDelArea(a));
  });
});
