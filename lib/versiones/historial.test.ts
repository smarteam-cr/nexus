/**
 * lib/versiones/historial.test.ts — cómo se arma el historial de versiones (21 nov): cuál es la actual, cuál ve el
 * cliente, el nombre de cómo nació (también en las filas de antes) y la huella.
 */
import { describe, expect, it } from "vitest";
import { armarHistorial, huellaDeContenido, tipoDeLaFila, tipoDeLoQueHabia, type FilaDeVersion } from "./historial";

const fila = (id: string, createdAt: string, huella: string, extra: Partial<FilaDeVersion> = {}): FilaDeVersion => ({
  id,
  tipo: "ia",
  origen: "Después de rehacerlo con IA",
  creadaPor: null,
  createdAt,
  huella,
  publicada: false,
  ...extra,
});

describe("armarHistorial", () => {
  const filas = [
    fila("v1", "2026-11-18T15:00:00.000Z", "h1"),
    fila("v3", "2026-11-20T22:10:00.000Z", "h3", { tipo: "publicado", origen: "Al publicar", publicada: true, creadaPor: "ana@x.test" }),
    fila("v2", "2026-11-19T23:03:00.000Z", "h2"),
  ];

  it("la más nueva primero; si es igual al documento, esa es la actual", () => {
    const h = armarHistorial(filas, { huellaActual: "h3", publicado: true });
    expect(h.map((v) => v.id)).toEqual(["v3", "v2", "v1"]);
    expect(h.filter((v) => v.esActual).map((v) => v.id)).toEqual(["v3"]);
  });

  it("con cambios sin guardar, arriba va la actual sin id, y ninguna guardada lleva «Actual»", () => {
    const h = armarHistorial(filas, { huellaActual: "otra", publicado: true });
    expect(h[0]).toMatchObject({ id: null, esActual: true, tipo: "edicion", en: null });
    expect(h.slice(1).some((v) => v.esActual)).toBe(false);
  });

  it("«Lo que ve el cliente» es la última publicada, y solo mientras siga publicado", () => {
    const conDos = [...filas, fila("v4", "2026-11-21T10:00:00.000Z", "h4", { publicada: true })];
    expect(armarHistorial(conDos, { huellaActual: "h4", publicado: true }).filter((v) => v.esLoQueVeElCliente).map((v) => v.id)).toEqual(["v4"]);
    expect(armarHistorial(conDos, { huellaActual: "h4", publicado: false }).some((v) => v.esLoQueVeElCliente)).toBe(false);
  });

  it("un documento vacío no tiene actual; uno sin versiones tiene solo la actual", () => {
    expect(armarHistorial(filas, { huellaActual: null, publicado: false }).some((v) => v.esActual)).toBe(false);
    const solo = armarHistorial([], { huellaActual: "h", publicado: false });
    expect(solo).toHaveLength(1);
    expect(solo[0].nota).toMatch(/Todavía no hay versiones/);
  });

  it("la nota que solo repite el tipo no se muestra; la que explica, sí", () => {
    const h = armarHistorial([fila("a", "2026-11-21T10:00:00.000Z", "a"), fila("b", "2026-11-21T09:00:00.000Z", "b", { tipo: "restaurado", origen: "Volvió la del 20 nov, 16:10." })], {
      huellaActual: "a",
      publicado: false,
    });
    expect(h[0].nota).toBeNull();
    expect(h[1].nota).toBe("Volvió la del 20 nov, 16:10.");
  });

  it("las corridas solo para leer se marcan", () => {
    const h = armarHistorial(filas, { huellaActual: "h3", publicado: false, soloLectura: new Set(["v1"]) });
    expect(h.find((v) => v.id === "v1")?.soloLectura).toBe(true);
    expect(h.find((v) => v.id === "v2")?.soloLectura).toBe(false);
  });
});

describe("tipoDeLaFila (las filas de antes del 21 nov no tienen tipo)", () => {
  it("se deduce del texto con que se guardaron", () => {
    expect(tipoDeLaFila(null, "Presentado al cliente (v2)")).toBe("presentado");
    expect(tipoDeLaFila(null, "Handoff congelado con el botón «Congelar»")).toBe("congelado");
    expect(tipoDeLaFila(null, "Antes de regenerar")).toBe("guardada");
    expect(tipoDeLaFila("algo-raro", "Antes de regenerar")).toBe("guardada");
    expect(tipoDeLaFila("ia", "lo que sea")).toBe("ia");
  });
});

describe("tipoDeLoQueHabia", () => {
  it("«Editado» si ya había versiones y la última es distinta; «Guardada» si no se sabe", () => {
    expect(tipoDeLoQueHabia("h1", "h2")).toBe("edicion");
    expect(tipoDeLoQueHabia(null, "h2")).toBe("guardada");
    expect(tipoDeLoQueHabia("h2", "h2")).toBe("guardada");
  });
});

describe("huellaDeContenido", () => {
  it("no depende del orden de las claves ni de las undefined, y cambia con el contenido", () => {
    expect(huellaDeContenido({ a: 1, b: [1, { c: 2 }] })).toBe(huellaDeContenido({ b: [1, { c: 2 }], a: 1, z: undefined }));
    expect(huellaDeContenido({ a: 1 })).not.toBe(huellaDeContenido({ a: 2 }));
  });
});
