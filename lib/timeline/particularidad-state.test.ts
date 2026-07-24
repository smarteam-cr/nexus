/**
 * lib/timeline/particularidad-state.test.ts — guard del doble conteo.
 *
 * Lo que congela: una SUGERENCIA nunca se cuenta como desviación real. Si alguien invierte el
 * filtro o lo borra, el corrimiento del cronograma vuelve a inflarse con propuestas que nadie
 * aprobó (el bug de "13 semanas mostradas, 8 reales") — y ese defecto es silencioso: no rompe
 * nada, solo muestra un número equivocado en la cara del cliente.
 *
 * El caso de `undefined` es el otro lado del riesgo: las filas históricas y los snapshots
 * publicados NO traen el campo, y tratarlas como sugerencias las borraría de cronogramas ya
 * entregados. Por eso solo un `true` explícito marca una sugerencia.
 */
import { describe, expect, it } from "vitest";
import {
  esConfirmada,
  esSugerencia,
  partitionByValidation,
} from "./particularidad-state";
import { summarizeParticularidades } from "./particularidades-summary";

describe("esConfirmada / esSugerencia", () => {
  it("needsValidation=true ⇒ sugerencia", () => {
    expect(esSugerencia({ needsValidation: true })).toBe(true);
    expect(esConfirmada({ needsValidation: true })).toBe(false);
  });

  it("needsValidation=false ⇒ confirmada", () => {
    expect(esConfirmada({ needsValidation: false })).toBe(true);
    expect(esSugerencia({ needsValidation: false })).toBe(false);
  });

  it("SIN el campo (fila histórica / snapshot viejo) ⇒ CONFIRMADA, no sugerencia", () => {
    // Fail-open deliberado: lo contrario haría desaparecer particularidades ya publicadas.
    expect(esConfirmada({})).toBe(true);
    expect(esConfirmada({ needsValidation: null })).toBe(true);
    expect(esSugerencia({})).toBe(false);
  });
});

describe("partitionByValidation", () => {
  const filas = [
    { id: "a", needsValidation: false },
    { id: "b", needsValidation: true },
    { id: "c" },
    { id: "d", needsValidation: true },
  ];

  it("separa en dos grupos sin perder ni duplicar filas", () => {
    const { confirmadas, sugerencias } = partitionByValidation(filas);
    expect(confirmadas.map((r) => r.id)).toEqual(["a", "c"]);
    expect(sugerencias.map((r) => r.id)).toEqual(["b", "d"]);
    expect(confirmadas.length + sugerencias.length).toBe(filas.length);
  });

  it("lista vacía → dos grupos vacíos", () => {
    expect(partitionByValidation([])).toEqual({ confirmadas: [], sugerencias: [] });
  });
});

describe("una sugerencia NO infla el corrimiento de semanas", () => {
  // El escenario exacto que motivó el filtro: 8 semanas reales de atraso + una sugerencia de 5
  // esperando revisión. Sin la partición, el cronograma diría 13.
  const todas = [
    { party: "CLIENTE", kind: "ATRASO", weeksImpact: 5, needsValidation: false },
    { party: "SMARTEAM", kind: "ATRASO", weeksImpact: 3, needsValidation: false },
    { party: "CLIENTE", kind: "ATRASO", weeksImpact: 5, needsValidation: true }, // sugerida
  ];

  it("el total se calcula SOLO con las confirmadas", () => {
    const { confirmadas, sugerencias } = partitionByValidation(todas);
    expect(summarizeParticularidades(confirmadas).totalWeeks).toBe(8);
    expect(sugerencias).toHaveLength(1);
    // Y la prueba de que el filtro es lo que importa: sin él, el número sale mal.
    expect(summarizeParticularidades(todas).totalWeeks).toBe(13);
  });

  it("al APROBARLA (needsValidation → false) recién ahí suma", () => {
    const aprobada = todas.map((p) => ({ ...p, needsValidation: false }));
    const { confirmadas } = partitionByValidation(aprobada);
    expect(summarizeParticularidades(confirmadas).totalWeeks).toBe(13);
  });
});
