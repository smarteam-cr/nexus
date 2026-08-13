import { describe, expect, it } from "vitest";
import { buildPieceRows, type CanvasParaFila } from "./dropdown-rows";

const c = (over: Partial<CanvasParaFila> & { slug: string | null }): CanvasParaFila => ({
  id: `id-${over.slug ?? "custom"}`,
  name: over.slug ?? "Sin nombre",
  ...over,
});

const slugs = (rows: ReturnType<typeof buildPieceRows>) => rows.map((r) => r.slug);
const de = (rows: ReturnType<typeof buildPieceRows>, slug: string) =>
  rows.find((r) => r.slug === slug)!;

describe("el desplegable muestra el FLUJO, no solo lo que existe", () => {
  it("un proyecto sin ninguna pieza igual lista las 7 del recorrido", () => {
    // Ésta es la razón de ser del cambio: antes, una pieza que el proyecto no tenía era
    // indistinguible de una que no existe en Nexus. El CSE no podía saber que el
    // Diagnóstico era una opción.
    const rows = buildPieceRows([]);
    expect(slugs(rows)).toEqual([
      "kickoff",
      "exploration",
      "diagnosis",
      "timeline",
      "planning",
      "tech-requirements",
      "implementation",
      "delivery",
    ]);
    expect(rows.every((r) => r.state === "por_activar")).toBe(true);
    expect(rows.every((r) => r.canvasId === null)).toBe(true);
  });

  it("el HANDOFF no está: tiene su propia sección arriba del panel", () => {
    expect(slugs(buildPieceRows([]))).not.toContain("handoff");
  });

  it("distingue generada de vacía por el contenido, no por que exista la fila", () => {
    const rows = buildPieceRows([
      c({ slug: "kickoff", name: "Kickoff", hasContent: true }),
      c({ slug: "diagnosis", name: "Diagnóstico", hasContent: false }),
    ]);
    expect(de(rows, "kickoff").state).toBe("generada");
    expect(de(rows, "diagnosis").state).toBe("vacia");
    expect(de(rows, "planning").state).toBe("por_activar");
  });

  it("cada pieza trae su agente para el CTA de generar", () => {
    const rows = buildPieceRows([]);
    expect(de(rows, "kickoff").agent?.agentId).toBe("agent-kickoff-canvas");
    expect(de(rows, "exploration").agent?.async).toBe(true);
    // El cronograma tiene su propio CTA dentro del canvas (conoce fases y publicación),
    // así que acá no trae agente: no se dispara desde el desplegable.
    expect(de(rows, "timeline").agent).toBeNull();
  });

  it("respeta el orden del flujo, no el de creación en la base", () => {
    const rows = buildPieceRows([
      c({ slug: "tech-requirements", name: "Desarrollo" }),
      c({ slug: "kickoff", name: "Kickoff" }),
      c({ slug: "exploration", name: "Exploración" }),
    ]);
    expect(slugs(rows).indexOf("kickoff")).toBeLessThan(slugs(rows).indexOf("exploration"));
    expect(slugs(rows).indexOf("exploration")).toBeLessThan(
      slugs(rows).indexOf("tech-requirements"),
    );
  });

  it("usa el rótulo del registro, no el nombre guardado en la base", () => {
    // Es la promesa de F1: renombrar una pieza es cambiar su rótulo en un solo lugar.
    // Si el desplegable leyera `name`, los canvases viejos seguirían con el nombre viejo.
    const rows = buildPieceRows([c({ slug: "kickoff", name: "Nombre viejo en la base" })]);
    expect(de(rows, "kickoff").label).toBe("Kickoff");
  });
});

describe("los canvases sueltos del CSE", () => {
  it("van al final y no desaparecen", () => {
    const rows = buildPieceRows([
      c({ slug: null, id: "cx", name: "Notas de la reunión", hasContent: true }),
      c({ slug: "kickoff", name: "Kickoff" }),
    ]);
    const ultima = rows[rows.length - 1];
    expect(ultima.label).toBe("Notas de la reunión");
    expect(ultima.canvasId).toBe("cx");
    expect(ultima.agent).toBeNull();
    expect(ultima.state).toBe("generada");
  });

  it("no se confunden con una pieza del flujo aunque se llamen igual", () => {
    const rows = buildPieceRows([c({ slug: null, id: "cy", name: "Diagnóstico" })]);
    // La fila de la PIEZA sigue estando y sigue por activar; el canvas suelto es otro.
    expect(de(rows, "diagnosis").state).toBe("por_activar");
    expect(rows.filter((r) => r.label === "Diagnóstico")).toHaveLength(2);
  });
});
