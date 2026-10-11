import { describe, expect, it } from "vitest";
import {
  diagnosticoParaLaEntrega,
  esFormatoDeObjetivos,
  estadoDelObjetivo,
  leerDesafioDelDiagnostico,
  leerObjetivosDelDiagnostico,
  normalizarCodigo,
  normalizarObjetivosPropuestos,
} from "./objetivos";

const DIAG = leerObjetivosDelDiagnostico({
  objetivos: [
    { id: "OBJ-01", tipo: "cuantitativo", titulo: "Conocer la conversión por proyecto", medida: "Tasa por proyecto", resultado: "r1" },
    { id: "obj-2", tipo: "cualitativo", titulo: "Ningún proyecto ve registros de otro", medida: "" },
    { id: "OBJ-01", titulo: "duplicado" },
    { id: "OBJ-03", titulo: "" },
  ],
});

describe("los objetivos del diagnóstico", () => {
  it("se leen en orden, con el código normalizado y sin duplicados ni vacíos", () => {
    expect(DIAG.map((o) => o.id)).toEqual(["OBJ-01", "OBJ-02"]);
    expect(DIAG[0].resultado).toBe("R1");
  });

  it("normaliza códigos", () => {
    expect(normalizarCodigo("obj 7")).toBe("OBJ-07");
    expect(normalizarCodigo("R03")).toBe("R3");
  });

  it("el estado desconocido es «por medir»", () => {
    expect(estadoDelObjetivo("Logrado")).toBe("alcanzado");
    expect(estadoDelObjetivo("en camino")).toBe("en_camino");
    expect(estadoDelObjetivo("quizás")).toBe("por_medir");
  });
});

describe("normalizarObjetivosPropuestos", () => {
  it("la lista y los títulos los pone el diagnóstico; la IA no inventa objetivos", () => {
    const out = normalizarObjetivosPropuestos({
      delDiagnostico: DIAG,
      delAgente: [
        { id: "OBJ-02", titulo: "otro nombre", estado: "alcanzado", evidencia: "Lo confirmó Ana el 3 oct" },
        { id: "OBJ-09", titulo: "inventado", estado: "alcanzado", evidencia: "x" },
      ],
      confirmados: [],
    });
    expect(out.map((o) => o.id)).toEqual(["OBJ-01", "OBJ-02"]);
    expect(out[0]).toMatchObject({ estado: "por_medir", evidencia: "" });
    expect(out[1]).toMatchObject({ titulo: "Ningún proyecto ve registros de otro", estado: "alcanzado" });
  });

  it("«alcanzado» sin evidencia baja a «por medir»", () => {
    const out = normalizarObjetivosPropuestos({
      delDiagnostico: DIAG,
      delAgente: [{ id: "OBJ-01", titulo: "x", estado: "alcanzado", evidencia: "" }],
      confirmados: [],
    });
    expect(out[0].estado).toBe("por_medir");
  });

  it("lo que el CSE ya aceptó no vuelve como propuesta", () => {
    const out = normalizarObjetivosPropuestos({
      delDiagnostico: DIAG,
      delAgente: [],
      confirmados: [{ id: "OBJ-01", titulo: "Conocer la conversión", estado: "alcanzado", evidencia: "y" }],
    });
    expect(out.map((o) => o.id)).toEqual(["OBJ-02"]);
  });

  it("sin diagnóstico, queda lo que propuso la IA", () => {
    const out = normalizarObjetivosPropuestos({
      delDiagnostico: [],
      delAgente: [{ id: "R1", titulo: "Bajar el tiempo de respuesta", estado: "en camino", evidencia: "z" }],
      confirmados: [],
    });
    expect(out).toEqual([{ id: "R1", titulo: "Bajar el tiempo de respuesta", estado: "en_camino", evidencia: "z" }]);
  });
});

describe("el desafío y el formato", () => {
  it("lee la pregunta y las situaciones; sin nada, null", () => {
    expect(leerDesafioDelDiagnostico({ intro: "¿Por qué…?", items: [{ title: "Le hablan igual a todos", detail: "d" }, { title: "" }] }))
      .toEqual({ pregunta: "¿Por qué…?", situaciones: [{ title: "Le hablan igual a todos", detail: "d" }] });
    expect(leerDesafioDelDiagnostico({ intro: "", items: [] })).toBeNull();
  });

  it("una sección vieja (prosa) no está en el formato de objetivos", () => {
    expect(esFormatoDeObjetivos({ intro: "", items: [{ title: "a" }] })).toBe(false);
    expect(esFormatoDeObjetivos({ intro: "", objetivosPropuestos: [] })).toBe(true);
  });

  it("el bloque del mensaje nombra el desafío y cada objetivo con su código", () => {
    const t = diagnosticoParaLaEntrega({ desafio: { pregunta: "¿Por qué?", situaciones: [{ title: "A", detail: "B" }] }, objetivos: DIAG });
    expect(t).toContain("DESAFÍO DEL DIAGNÓSTICO:");
    expect(t).toContain("- OBJ-01 · cuantitativo · Conocer la conversión por proyecto");
    expect(diagnosticoParaLaEntrega({ desafio: null, objetivos: [] })).toBe("");
  });
});
