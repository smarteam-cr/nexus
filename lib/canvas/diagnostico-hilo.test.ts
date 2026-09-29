import { describe, expect, it } from "vitest";
import { ordenarObjetivosDelDiagnostico } from "./diagnostico-hilo";

/* El caso REAL de FUNDAUNA (2026-09-28): cuantitativos 01 y 06, cualitativos 02-05 y 07-08. */
const FUNDAUNA = [
  {
    key: "objetivos",
    data: {
      intro: "",
      objetivos: [
        { id: "OBJ-01", tipo: "cuantitativo", titulo: "Conversión" },
        { id: "OBJ-02", tipo: "cualitativo", titulo: "Centralizar" },
        { id: "OBJ-03", tipo: "cualitativo", titulo: "Call center" },
        { id: "OBJ-06", tipo: "cuantitativo", titulo: "Embudo" },
        { id: "OBJ-07", tipo: "cualitativo", titulo: "Visibilidad" },
      ],
    },
  },
  { key: "preguntas", data: { preguntas: [{ pregunta: "¿Cuántos leads?", objetivos: "OBJ-06, OBJ-02" }] } },
  { key: "gap_analysis", data: { retos: [{ title: "x", detail: "Para OBJ-06 y OBJ-07 hace falta…" }] } },
];

describe("los objetivos del diagnóstico quedan en orden", () => {
  it("cuantitativos primero, cualitativos después, numerados seguidos", () => {
    const [obj] = ordenarObjetivosDelDiagnostico(FUNDAUNA);
    const lista = (obj.data as { objetivos: Array<{ id: string; titulo: string }> }).objetivos;
    expect(lista.map((o) => `${o.id} ${o.titulo}`)).toEqual([
      "OBJ-01 Conversión",
      "OBJ-02 Embudo",
      "OBJ-03 Centralizar",
      "OBJ-04 Call center",
      "OBJ-05 Visibilidad",
    ]);
  });

  it("las menciones en otras secciones siguen apuntando al MISMO objetivo", () => {
    const [, preguntas, gap] = ordenarObjetivosDelDiagnostico(FUNDAUNA);
    // El viejo OBJ-06 (Embudo) es ahora OBJ-02; el viejo OBJ-02 (Centralizar) es OBJ-03.
    expect((preguntas.data as { preguntas: Array<{ objetivos: string }> }).preguntas[0].objetivos).toBe("OBJ-02, OBJ-03");
    expect(JSON.stringify(gap.data)).toContain("Para OBJ-02 y OBJ-05 hace falta");
  });

  it("no toca lo que recibe, y sin objetivos devuelve todo igual", () => {
    const copia = JSON.stringify(FUNDAUNA);
    ordenarObjetivosDelDiagnostico(FUNDAUNA);
    expect(JSON.stringify(FUNDAUNA)).toBe(copia);
    const sin = [{ key: "problema", data: { sintomas: [] } }];
    expect(ordenarObjetivosDelDiagnostico(sin)).toEqual(sin);
  });

  it("tolera códigos sin guion y un número repetido", () => {
    const r = ordenarObjetivosDelDiagnostico([
      { key: "objetivos", data: { objetivos: [{ id: "OBJ3", tipo: "cualitativo" }, { id: "OBJ-3", tipo: "cuantitativo" }] } },
      { key: "preguntas", data: { preguntas: [{ objetivos: "OBJ-3" }] } },
    ]);
    const ids = (r[0].data as { objetivos: Array<{ id: string; tipo: string }> }).objetivos.map((o) => `${o.id}:${o.tipo}`);
    expect(ids).toEqual(["OBJ-01:cuantitativo", "OBJ-02:cualitativo"]);
    expect(JSON.stringify(r[1].data)).toContain("OBJ-02");
  });
});
