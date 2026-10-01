/**
 * lib/exploraciones/test-de-marketing.test.ts — la dirección del resultado del test se lee bien, y
 * sus dimensiones de la escala anterior caen en las de hoy.
 *
 * El enlace de ejemplo se arma acá igual que lo arma el test (escala-diagnostico, stepper.js
 * `construirPayload` + lib/urlstate.js): JSON comprimido con lz-string después del `#`.
 */
import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { leerLoLeido } from "./lo-leido";
import { leerResultadoDelTest } from "./test-de-marketing";

function enlace(payload: unknown): string {
  return `https://dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#${compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

const PAYLOAD = {
  v: 1,
  area: "ventas",
  contexto: { industria: "Software", dominio: "ejemplo.com", empresa: "" },
  dims: {
    procesos: { nivel: 2, nivelKey: "inicial", puntaje: 30 },
    tecnologia: { nivel: 3, nivelKey: "funcional", puntaje: 50 },
    datos: { nivel: 1, nivelKey: "deficiente", puntaje: 10 },
    equipo: { nivel: 2 },
    express: { nivel: 2 },
    tailor: { nivel: 3 },
    amplify: { nivel: 2 },
    evolve: { nivel: 1 },
  },
  qa: [
    { dim: "datos", name: "Datos", pares: [{ q: "¿Confías en tus números?", a: "No, cada vendedor lleva su Excel" }, { q: "Matiz que agregaste", a: "La verdad no sé bien" }] },
    { dim: "procesos", name: "Procesos", pares: [{ q: "¿Hay proceso?", a: "Cada quien a su manera" }] },
  ],
  fecha: "2026-09-25T18:00:00.000Z",
};

describe("el resultado del test de marketing", () => {
  it("las 8 dimensiones caen en las de hoy, por posición, con su nivel", () => {
    const r = leerResultadoDelTest(enlace(PAYLOAD))!;
    expect(r.areaId).toBe("1");
    expect(r.fecha).toBe("2026-09-25");
    expect(r.respuestas.map((x) => `${x.dimensionId}:${x.nivel}`)).toEqual([
      "1.1:I",
      "1.2:F",
      "1.3:D",
      "1.4:I",
      "1.5:I",
      "1.6:F",
      "1.7:I",
      "1.8:D",
    ]);
  });

  it("la respuesta elegida y el matiz llegan con su dimensión", () => {
    const r = leerResultadoDelTest(enlace(PAYLOAD))!;
    expect(r.respuestas.find((x) => x.dimensionId === "1.3")).toMatchObject({
      respuesta: "No, cada vendedor lleva su Excel",
      matiz: "La verdad no sé bien",
    });
    expect(r.respuestas.find((x) => x.dimensionId === "1.1")).toMatchObject({ respuesta: "Cada quien a su manera", matiz: null });
  });

  it("las áreas cambiaron de número: marketing es la 2 y servicio la 3", () => {
    expect(leerResultadoDelTest(enlace({ ...PAYLOAD, area: "marketing" }))!.areaId).toBe("2");
    expect(leerResultadoDelTest(enlace({ ...PAYLOAD, area: "servicio" }))!.respuestas[0].dimensionId).toBe("3.1");
  });

  it("lo que no es un resultado del test no se lee: otra versión, otra página, basura", () => {
    expect(leerResultadoDelTest(enlace({ ...PAYLOAD, v: 2 }))).toBeNull();
    expect(leerResultadoDelTest("https://dev.smarteamcr.com/diagnostico-rendimiento/index.html#abc")).toBeNull();
    expect(leerResultadoDelTest("https://dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#no-es-lz")).toBeNull();
    expect(leerResultadoDelTest(null)).toBeNull();
  });
});

describe("leerLoLeido (la foto que guarda el agente)", () => {
  it("se queda con lo que tiene forma y deja afuera lo demás", () => {
    const resultado = leerResultadoDelTest(enlace(PAYLOAD))!;
    const foto = leerLoLeido({
      tests: [{ contacto: "Ana", resultado }, { contacto: "Sin resultado" }, "basura"],
      agenda: [{ id: "m1", titulo: "Revisión del diagnóstico", inicio: "2026-10-02T15:00:00.000Z" }, { id: 3 }],
      correosSinPermiso: 4,
      leidoEn: "2026-10-01T12:00:00.000Z",
    });
    expect(foto.tests).toHaveLength(1);
    expect(foto.tests[0].resultado.respuestas).toHaveLength(resultado.respuestas.length);
    expect(foto.agenda).toEqual([{ id: "m1", titulo: "Revisión del diagnóstico", inicio: "2026-10-02T15:00:00.000Z" }]);
    expect(foto.correosSinPermiso).toBe(4);
  });

  it("sin foto (exploración que el agente todavía no leyó): todo vacío", () => {
    expect(leerLoLeido(null)).toEqual({ tests: [], agenda: [], correosSinPermiso: 0, leidoEn: null });
  });
});
