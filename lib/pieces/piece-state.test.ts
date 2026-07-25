import { describe, expect, it } from "vitest";
import { resolvePieceStates, proposedPieces, type CanvasParaEstado } from "./piece-state";

const canvas = (over: Partial<CanvasParaEstado> = {}): CanvasParaEstado => ({
  id: "c1",
  slug: "exploration",
  name: "Exploración",
  disabledAt: null,
  ...over,
});

const de = (states: ReturnType<typeof resolvePieceStates>, slug: string) =>
  states.find((s) => s.slug === slug)!;

describe("estado de las piezas de un proyecto", () => {
  it("un canvas presente y sin apagar está ON", () => {
    const s = resolvePieceStates({ tags: [], canvases: [canvas()] });
    expect(de(s, "exploration").state).toBe("on");
    expect(de(s, "exploration").canvasId).toBe("c1");
  });

  it("un canvas con disabledAt está OFF y conserva quién/cuándo/por qué", () => {
    const s = resolvePieceStates({
      tags: [],
      canvases: [
        canvas({
          disabledAt: new Date("2026-07-24T10:00:00Z"),
          disabledBy: "egonzalez@smarteamcr.com",
          disabledReason: "Este servicio no lleva exploración",
        }),
      ],
    });
    const e = de(s, "exploration");
    expect(e.state).toBe("off");
    expect(e.disabledAt).toBe("2026-07-24T10:00:00.000Z");
    expect(e.disabledBy).toBe("egonzalez@smarteamcr.com");
    expect(e.disabledReason).toBe("Este servicio no lleva exploración");
    // Lo importante de OFF: el canvas SIGUE EXISTIENDO. Apagar no borra.
    expect(e.canvasId).toBe("c1");
  });

  it("sin canvas y sin tags que la pidan, la pieza está AUSENTE (no propuesta)", () => {
    const s = resolvePieceStates({ tags: ["sales_hub"], canvases: [] });
    expect(de(s, "tech-requirements").state).toBe("absent");
    expect(proposedPieces(s)).toEqual([]);
  });

  it("un tag técnico PROPONE la pieza de requerimientos — sin backfill ni columna", () => {
    // Es el bug de los 13 proyectos: la condición se evaluaba una sola vez, durante el
    // handoff. Derivada, el aviso aparece la primera vez que alguien abre el proyecto.
    const s = resolvePieceStates({ tags: ["sales_hub", "custom_dev"], canvases: [] });
    const t = de(s, "tech-requirements");
    expect(t.state).toBe("proposed");
    expect(t.proposedByTags).toEqual(["custom_dev"]);
    expect(proposedPieces(s).map((p) => p.slug)).toEqual(["tech-requirements"]);
  });

  it("quitar el tag hace desaparecer la propuesta SOLA, sin escribir nada", () => {
    // La razón entera de derivar en vez de guardar. Con columnas habría que colgar la
    // expiración de los cuatro caminos que escriben tags — y uno ya se olvida hoy (la
    // rama "adjuntar" de POST /api/handoffs no propaga tags).
    const antes = resolvePieceStates({ tags: ["custom_dev"], canvases: [] });
    const despues = resolvePieceStates({ tags: [], canvases: [] });
    expect(de(antes, "tech-requirements").state).toBe("proposed");
    expect(de(despues, "tech-requirements").state).toBe("absent");
  });

  it("quitar el tag NO propone apagar una pieza que ya tiene contenido", () => {
    // La regla es de una sola dirección: el contenido es trabajo real. Si el CSE la
    // quiere apagar, el gestor está ahí — el sistema no lo sugiere.
    const s = resolvePieceStates({
      tags: [],
      canvases: [canvas({ id: "c9", slug: "tech-requirements", name: "Desarrollo" })],
    });
    expect(de(s, "tech-requirements").state).toBe("on");
  });

  it("un canvas sin slug resuelve por su nombre histórico (pre-migración)", () => {
    const s = resolvePieceStates({
      tags: [],
      canvases: [canvas({ slug: null, name: "Kickoff" })],
    });
    expect(de(s, "kickoff").state).toBe("on");
  });

  it("un canvas custom del CSE no es ninguna pieza y no altera el estado de nadie", () => {
    const s = resolvePieceStates({
      tags: [],
      canvases: [canvas({ id: "cx", slug: null, name: "Notas de la reunión" })],
    });
    expect(s.every((p) => p.canvasId === null)).toBe(true);
  });

  it("lista solo piezas de PROYECTO: la información del cliente y el business case quedan fuera", () => {
    // client-info es de ámbito cliente (dos proyectos la comparten: apagarla en uno
    // dejaría ciego al otro) y business-case tiene N canvases con el mismo slug.
    const slugs = resolvePieceStates({ tags: [], canvases: [] }).map((p) => p.slug);
    expect(slugs).not.toContain("client-info");
    expect(slugs).not.toContain("business-case");
    expect(slugs).toContain("kickoff");
  });

  it("el Kickoff NO es apagable (decisión de negocio 2026-07-24)", () => {
    // Se lista igual, pero sin interruptor: apagarlo arrastraría el semáforo de la
    // cartera, la etapa del proyecto y las alarmas del cronograma.
    const s = resolvePieceStates({ tags: [], canvases: [] });
    expect(de(s, "kickoff").optional).toBe(false);
    expect(de(s, "handoff").optional).toBe(false);
  });
});
