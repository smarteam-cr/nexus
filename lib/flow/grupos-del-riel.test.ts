import { describe, it, expect } from "vitest";
import { conOrdenDelGrupo, GRUPO_ENTREGABLES, GRUPO_HERRAMIENTAS, grupoDelRiel, ordenarPorGrupo } from "./grupos-del-riel";
import { buildPieceRows } from "./dropdown-rows";

describe("las copias de un tipo (artefactos, etapa V3)", () => {
  it("van en el grupo de su tipo, y los tipos nuevos en el de su clase", () => {
    expect(grupoDelRiel("adoption-plan")).toEqual(GRUPO_ENTREGABLES);
    const filas = [
      { slug: "copia:a", tipo: "planning" },
      { slug: "copia:b", tipo: "exploration" },
    ];
    expect(ordenarPorGrupo(filas).map((f) => f.slug)).toEqual(["copia:b", "copia:a"]);
  });
});

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

  it("⛔ el orden que dejó la persona manda adentro de cada grupo, mezclando tipos; lo que no está va al final de su grupo", () => {
    const filas = [
      { slug: "timeline" },
      { slug: "exploration" },
      { slug: "kickoff" },
      { slug: "planning" },
      { slug: "copia:p2", tipo: "planning" },
      { slug: "copia:a1", tipo: "adoption-plan" },
      { slug: "delivery" },
    ];
    // La persona puso la copia de adopción arriba del kickoff; el cronograma debajo de la exploración. La entrega no está.
    const orden = ["copia:a1", "kickoff", "copia:p2", "planning", "exploration", "timeline"];
    expect(ordenarPorGrupo(filas, orden).map((f) => f.slug)).toEqual([
      "exploration",
      "timeline",
      "copia:a1",
      "kickoff",
      "copia:p2",
      "planning",
      "delivery",
    ]);
    // Sin orden guardado, el de siempre tal cual.
    expect(ordenarPorGrupo(filas).map((f) => f.slug)).toEqual(["timeline", "exploration", "kickoff", "planning", "copia:p2", "copia:a1", "delivery"]);
  });

  it("arrastrar en un grupo no mueve el otro: sus claves van primero y las demás se conservan, sin repetir", () => {
    const antes = ["exploration", "timeline", "kickoff", "planning"];
    expect(conOrdenDelGrupo(antes, ["planning", "kickoff", "planning"])).toEqual(["planning", "kickoff", "exploration", "timeline"]);
    const filas = [{ slug: "timeline" }, { slug: "exploration" }, { slug: "kickoff" }, { slug: "planning" }];
    expect(ordenarPorGrupo(filas, conOrdenDelGrupo(antes, ["planning", "kickoff"])).map((f) => f.slug)).toEqual(["exploration", "timeline", "planning", "kickoff"]);
  });
});
