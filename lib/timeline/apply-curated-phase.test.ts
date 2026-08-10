import { describe, it, expect } from "vitest";
import { normalizeCuratedTasks } from "./apply-curated-phase";

describe("normalizeCuratedTasks", () => {
  it("descarta entradas sin título", () => {
    const out = normalizeCuratedTasks([{ title: "" }, { title: "  " }, {}], 3, new Set());
    expect(out).toEqual([]);
  });

  it("clampea weekIndex al rango [0, durationWeeks)", () => {
    const out = normalizeCuratedTasks(
      [
        { title: "A", weekIndex: -5 },
        { title: "B", weekIndex: 99 },
      ],
      3,
      new Set(),
    );
    expect(out.map((t) => t.weekIndex)).toEqual([0, 2]);
  });

  it("order incremental por semana (recalculado desde la posición del array)", () => {
    const out = normalizeCuratedTasks(
      [
        { title: "A", weekIndex: 0 },
        { title: "B", weekIndex: 0 },
        { title: "C", weekIndex: 1 },
      ],
      2,
      new Set(),
    );
    expect(out.map((t) => [t.weekIndex, t.order])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it("descarta el id si no pertenece a esta fase (anti-alucinación)", () => {
    const out = normalizeCuratedTasks(
      [{ id: "ajena-a-otra-fase", title: "A" }, { id: "propia", title: "B" }],
      1,
      new Set(["propia"]),
    );
    expect(out.map((t) => t.id)).toEqual([undefined, "propia"]);
  });

  it("party/type/status inválidos caen a su fallback (null/null/PENDING)", () => {
    const out = normalizeCuratedTasks(
      [{ title: "A", party: "inventado", type: "inventado", status: "inventado" }],
      1,
      new Set(),
    );
    expect(out[0].party).toBeNull();
    expect(out[0].type).toBeNull();
    expect(out[0].status).toBe("PENDING");
  });

  it("party/type/status válidos se normalizan a mayúscula", () => {
    const out = normalizeCuratedTasks(
      [{ title: "A", party: "cliente", type: "session", status: "done" }],
      1,
      new Set(),
    );
    expect(out[0].party).toBe("CLIENTE");
    expect(out[0].type).toBe("SESSION");
    expect(out[0].status).toBe("DONE");
  });

  it("notes vacías o solo whitespace se guardan como null", () => {
    const out = normalizeCuratedTasks([{ title: "A", notes: "   " }, { title: "B", notes: "algo" }], 1, new Set());
    expect(out.map((t) => t.notes)).toEqual([null, "algo"]);
  });
});
