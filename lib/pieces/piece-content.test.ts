import { describe, expect, it, vi } from "vitest";

// El helper es SERVER-ONLY (importa prisma para su cargador); acá se prueba SOLO el
// núcleo puro del criterio, así que el cliente no hace falta.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const { deriveCanvasesConContenido, seededSectionKeys } = await import("./piece-content");

const base = {
  seccionesConBloques: [] as Array<{ canvasId: string; key: string }>,
  canvasesConBloqueGenerado: [] as string[],
  timelineTieneFases: false,
};

describe("qué cuenta como contenido de una pieza", () => {
  it("el bloque SEMILLA del cierre NO alcanza: la pieza sigue vacía", () => {
    // Ésta es la razón de ser del criterio. Diagnóstico/Planificación/Exploración/
    // Desarrollo/Implementación nacen con un CARD HUMAN en `cierre`; contarlo daba punto
    // verde y CTA "Regenerar" en piezas recién creadas y vacías.
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "c1", slug: "diagnosis" }],
      seccionesConBloques: [{ canvasId: "c1", key: "cierre" }],
    });
    expect(r.has("c1")).toBe(false);
  });

  it("el Kickoff recién creado tampoco: equipo/horarios/canales también son semilla", () => {
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "k", slug: "kickoff" }],
      seccionesConBloques: [
        { canvasId: "k", key: "equipo" },
        { canvasId: "k", key: "horarios" },
        { canvasId: "k", key: "canales" },
        { canvasId: "k", key: "cierre" },
      ],
    });
    expect(r.has("k")).toBe(false);
  });

  it("un bloque generado por IA sí cuenta, esté en la sección que esté", () => {
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "k", slug: "kickoff" }],
      seccionesConBloques: [{ canvasId: "k", key: "cierre" }],
      canvasesConBloqueGenerado: ["k"],
    });
    expect(r.has("k")).toBe(true);
  });

  it("lo que el CSE escribe a mano en una sección no sembrada también cuenta", () => {
    // "Generada" en la fila significa "ya está hecho": si el CSE la llenó a mano, decirle
    // "todavía sin contenido" es mentirle.
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "e", slug: "exploration" }],
      seccionesConBloques: [{ canvasId: "e", key: "ya_sabemos" }],
    });
    expect(r.has("e")).toBe(true);
  });

  it("un canvas suelto del CSE no tiene semilla: cualquier bloque es suyo", () => {
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "x", slug: null }],
      seccionesConBloques: [{ canvasId: "x", key: "cierre" }],
    });
    expect(r.has("x")).toBe(true);
  });
});

describe("el Cronograma es la excepción: su contenido no vive en bloques", () => {
  it("con fases está generado, aunque no tenga ninguna sección", () => {
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "t", slug: "timeline" }],
      timelineTieneFases: true,
    });
    expect(r.has("t")).toBe(true);
  });

  it("sin fases sigue vacío", () => {
    const r = deriveCanvasesConContenido({
      ...base,
      canvases: [{ id: "t", slug: "timeline" }],
    });
    expect(r.has("t")).toBe(false);
  });
});

describe("las keys sembradas salen de la definición de la pieza", () => {
  it("kickoff siembra las curadas; timeline no siembra nada", () => {
    expect([...seededSectionKeys("kickoff")].sort()).toEqual([
      "canales",
      "cierre",
      "equipo",
      "horarios",
    ]);
    expect(seededSectionKeys("timeline").size).toBe(0);
    expect(seededSectionKeys(null).size).toBe(0);
  });
});
