import { describe, expect, it } from "vitest";
import { cabosParaElChat, codigosCitados, hiloCerrado, normalizarCodigo, revisarHilo, seccionesDelHilo } from "./revisar-hilo";

const COMPLETO = {
  objetivos: { objetivos: [{ id: "OBJ-01", tipo: "cuantitativo", titulo: "Conversión" }, { id: "OBJ-02", tipo: "cualitativo", titulo: "Un registro" }] },
  problema: {
    sintomas: [{ id: "S1", titulo: "Leads sin seguimiento" }, { id: "S2", titulo: "Conversión desconocida" }],
    causas: [{ id: "F1", titulo: "Sin CRM", explica: "S1, S2" }],
    consecuencias: [{ titulo: "Pauta sin retorno", por: "F1" }],
  },
  preguntas: { preguntas: [{ pregunta: "¿Cuántos matriculan?", objetivos: "OBJ-01" }, { pregunta: "¿Dónde está cada lead?", objetivos: "OBJ-02" }] },
  acciones: { acciones: [{ id: "AC-01", accion: "Un CRM con registro único", ataca: "F1", mueve: "OBJ-01, OBJ-02", alcance: "dentro" }] },
  herramientas: { herramientas: [{ herramienta: "Pipelines", paraQue: "Seguir cada lead", acciones: "AC-01" }] },
  alcance_acordado: { grupos: [{ titulo: "Sales Hub", items: [{ texto: "Pipeline de leads", acciones: "AC-01" }] }], fuera: [] },
};

describe("revisarHilo", () => {
  it("un hilo completo no tiene cabos sueltos", () => {
    expect(revisarHilo(COMPLETO)).toEqual([]);
    expect(cabosParaElChat([])).toBe("");
    expect(hiloCerrado([])).toBe(true);
  });

  it("borrar una causa deja al síntoma sin explicar y a la consecuencia y la acción citando algo que no existe", () => {
    const r = revisarHilo({ ...COMPLETO, problema: { ...COMPLETO.problema, causas: [] } });
    expect(r.map((c) => c.texto)).toEqual([
      "El síntoma S1 no lo explica ninguna causa.",
      "El síntoma S2 no lo explica ninguna causa.",
      "La consecuencia «Pauta sin retorno» cita F1, que no existe.",
      "La acción AC-01 ataca F1, que no existe.",
    ]);
    expect(r.every((c) => c.bloquea)).toBe(true);
  });

  it("una causa sin síntomas, una pregunta sin objetivo y un objetivo sin pregunta (este último, aviso)", () => {
    const r = revisarHilo({
      ...COMPLETO,
      problema: { ...COMPLETO.problema, causas: [{ id: "F1", titulo: "x", explica: "S1, S2" }, { id: "F2", titulo: "y", explica: "" }] },
      acciones: { acciones: [{ id: "AC-01", accion: "a", ataca: "F1, F2", mueve: "OBJ-01, OBJ-02" }] },
      preguntas: { preguntas: [{ pregunta: "¿Cuántos?", objetivos: "OBJ-01" }, { pregunta: "¿Y esto?", objetivos: "" }] },
    });
    const textos = r.map((c) => c.texto);
    expect(textos).toContain("La causa F2 no dice qué síntoma explica.");
    expect(textos).toContain("La pregunta «¿Y esto?» no dice qué objetivo la responde.");
    const sinPregunta = r.find((c) => c.texto === "El objetivo OBJ-02 no tiene ninguna pregunta de negocio.");
    expect(sinPregunta?.bloquea).toBe(false);
  });

  it("códigos repetidos y variantes de escritura", () => {
    expect(normalizarCodigo("obj-1")).toBe(normalizarCodigo("OBJ-01"));
    expect(normalizarCodigo("ac1")).toBe(normalizarCodigo("AC-01"));
    expect(codigosCitados("OBJ 01 y OBJ-04", "OBJ")).toEqual(["OBJ1", "OBJ4"]);
    expect(codigosCitados("AC-01, AC 3", "AC")).toEqual(["AC1", "AC3"]);
    const r = revisarHilo({ ...COMPLETO, problema: { ...COMPLETO.problema, sintomas: [...COMPLETO.problema.sintomas, { id: "S1", titulo: "dup" }] } });
    expect(r.map((c) => c.texto)).toContain("El código S1 está repetido 2 veces.");
  });

  it("un diagnóstico viejo (sin hilo) no inventa cabos", () => {
    expect(revisarHilo({})).toEqual([]);
  });
});

describe("las acciones cierran el hilo (2026-10-02)", () => {
  it("una acción sin causa o sin objetivo impide presentar", () => {
    const r = revisarHilo({ ...COMPLETO, acciones: { acciones: [{ id: "AC-01", accion: "a", ataca: "", mueve: "" }] } });
    const textos = r.filter((c) => c.bloquea).map((c) => c.texto);
    expect(textos).toContain("La acción AC-01 no dice qué causa ataca.");
    expect(textos).toContain("La acción AC-01 no dice qué objetivo mueve.");
    expect(hiloCerrado(r)).toBe(false);
  });

  it("un problema sin acción impide presentar: la causa que ninguna acción ataca", () => {
    const r = revisarHilo({
      ...COMPLETO,
      problema: { ...COMPLETO.problema, causas: [...COMPLETO.problema.causas, { id: "F2", titulo: "Sin dueño", explica: "S1" }] },
    });
    const cabo = r.find((c) => c.texto === "La causa F2 no tiene ninguna acción que la ataque.");
    expect(cabo?.bloquea).toBe(true);
  });

  it("sin acciones, toda causa queda sin acción (un diagnóstico de antes del contrato no se presenta así)", () => {
    const r = revisarHilo({ ...COMPLETO, acciones: undefined });
    expect(r.filter((c) => c.bloquea).map((c) => c.texto)).toEqual(["La causa F1 no tiene ninguna acción que la ataque."]);
  });

  it("una acción citando un objetivo que no existe impide presentar", () => {
    const r = revisarHilo({ ...COMPLETO, acciones: { acciones: [{ id: "AC-01", accion: "a", ataca: "F1", mueve: "OBJ-01, OBJ-09" }] } });
    expect(r.find((c) => c.texto === "La acción AC-01 mueve OBJ9, que no existe.")?.bloquea).toBe(true);
  });

  it("avisos, sin bloquear: objetivo que nada mueve, acción «dentro» fuera del alcance, herramienta con AC inexistente", () => {
    const r = revisarHilo({
      ...COMPLETO,
      acciones: { acciones: [{ id: "AC-01", accion: "a", ataca: "F1", mueve: "OBJ-01", alcance: "dentro" }, { id: "AC-02", accion: "b", ataca: "F1", mueve: "OBJ-01", alcance: "dentro" }] },
      herramientas: { herramientas: [{ herramienta: "Workflows", acciones: "AC-07" }] },
    });
    const avisos = r.filter((c) => !c.bloquea).map((c) => c.texto);
    expect(avisos).toContain("El objetivo OBJ-02 no lo mueve ninguna acción.");
    expect(avisos).toContain("La acción AC-02 está dentro del alcance pero no aparece en «Alcance acordado».");
    expect(avisos).toContain("La herramienta «Workflows» cita AC7, que no existe.");
    expect(hiloCerrado(r)).toBe(true);
  });

  it("una acción «fuera» no tiene que aparecer en lo incluido", () => {
    const r = revisarHilo({
      ...COMPLETO,
      acciones: { acciones: [...COMPLETO.acciones.acciones, { id: "AC-02", accion: "Fase 2", ataca: "F1", mueve: "OBJ-01", alcance: "fuera" }] },
    });
    expect(r).toEqual([]);
  });

  it("seccionesDelHilo arma las seis desde un lector por key, y el chat marca los avisos", () => {
    const s = seccionesDelHilo((k) => (COMPLETO as Record<string, Record<string, unknown>>)[k]);
    expect(Object.keys(s).sort()).toEqual(["acciones", "alcance_acordado", "herramientas", "objetivos", "preguntas", "problema"]);
    const texto = cabosParaElChat(revisarHilo({ ...COMPLETO, herramientas: { herramientas: [{ herramienta: "X", acciones: "AC-09" }] } }));
    expect(texto).toContain("(aviso)");
  });
});
