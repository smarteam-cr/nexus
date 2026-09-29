import { describe, expect, it } from "vitest";
import { cabosParaElChat, codigosCitados, normalizarCodigo, revisarHilo } from "./revisar-hilo";

const COMPLETO = {
  objetivos: { objetivos: [{ id: "OBJ-01", tipo: "cuantitativo", titulo: "Conversión" }, { id: "OBJ-02", tipo: "cualitativo", titulo: "Un registro" }] },
  problema: {
    sintomas: [{ id: "S1", titulo: "Leads sin seguimiento" }, { id: "S2", titulo: "Conversión desconocida" }],
    causas: [{ id: "F1", titulo: "Sin CRM", explica: "S1, S2" }],
    consecuencias: [{ titulo: "Pauta sin retorno", por: "F1" }],
  },
  preguntas: { preguntas: [{ pregunta: "¿Cuántos matriculan?", objetivos: "OBJ-01" }, { pregunta: "¿Dónde está cada lead?", objetivos: "OBJ-02" }] },
};

describe("revisarHilo", () => {
  it("un hilo completo no tiene cabos sueltos", () => {
    expect(revisarHilo(COMPLETO)).toEqual([]);
    expect(cabosParaElChat([])).toBe("");
  });

  it("borrar una causa deja al síntoma sin explicar y a la consecuencia citando algo que no existe", () => {
    const r = revisarHilo({ ...COMPLETO, problema: { ...COMPLETO.problema, causas: [] } });
    expect(r.map((c) => c.texto)).toEqual([
      "El síntoma S1 no lo explica ninguna causa.",
      "El síntoma S2 no lo explica ninguna causa.",
      "La consecuencia «Pauta sin retorno» cita F1, que no existe.",
    ]);
  });

  it("una causa sin síntomas, una pregunta sin objetivo y un objetivo sin pregunta", () => {
    const r = revisarHilo({
      ...COMPLETO,
      problema: { ...COMPLETO.problema, causas: [{ id: "F1", titulo: "x", explica: "S1, S2" }, { id: "F2", titulo: "y", explica: "" }] },
      preguntas: { preguntas: [{ pregunta: "¿Cuántos?", objetivos: "OBJ-01" }, { pregunta: "¿Y esto?", objetivos: "" }] },
    }).map((c) => c.texto);
    expect(r).toContain("La causa F2 no dice qué síntoma explica.");
    expect(r).toContain("La pregunta «¿Y esto?» no dice qué objetivo la responde.");
    expect(r).toContain("El objetivo OBJ-02 no tiene ninguna pregunta de negocio.");
  });

  it("códigos repetidos y variantes de escritura", () => {
    expect(normalizarCodigo("obj-1")).toBe(normalizarCodigo("OBJ-01"));
    expect(codigosCitados("OBJ 01 y OBJ-04", "OBJ")).toEqual(["OBJ1", "OBJ4"]);
    const r = revisarHilo({ ...COMPLETO, problema: { ...COMPLETO.problema, sintomas: [...COMPLETO.problema.sintomas, { id: "S1", titulo: "dup" }] } });
    expect(r.map((c) => c.texto)).toContain("El código S1 está repetido 2 veces.");
  });

  it("un diagnóstico viejo (sin hilo) no inventa cabos", () => {
    expect(revisarHilo({})).toEqual([]);
  });
});
