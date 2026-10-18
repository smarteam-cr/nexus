import { describe, it, expect } from "vitest";
import { GRUPO_ENTREGABLES, GRUPO_HERRAMIENTAS, grupoDelRiel, ordenarPorGrupo } from "./grupos-del-riel";
import { buildPieceRows } from "./dropdown-rows";

describe("los dos grupos del riel (decisión 11)", () => {
  it("entregables: Kickoff, Diagnóstico, Planificación, Integraciones y Entrega", () => {
    for (const s of ["kickoff", "diagnosis", "planning", "tech-requirements", "delivery"]) expect(grupoDelRiel(s)).toBe(GRUPO_ENTREGABLES);
  });

  it("herramientas: Cronograma, Cuestionarios, Exploración, Handoff, Ejecución y los canvases sueltos", () => {
    for (const s of ["timeline", "questionnaires", "exploration", "handoff", "implementation", "custom:abc"]) expect(grupoDelRiel(s)).toBe(GRUPO_HERRAMIENTAS);
  });

  it("las herramientas van primero y cada grupo conserva el orden de presentación", () => {
    const filas = buildPieceRows([], { sinCanvas: { questionnaires: "vacia" } });
    expect(ordenarPorGrupo(filas).map((f) => f.slug)).toEqual([
      "timeline",
      "questionnaires",
      "exploration",
      "implementation",
      "kickoff",
      "diagnosis",
      "planning",
      "tech-requirements",
      "delivery",
    ]);
  });
});
