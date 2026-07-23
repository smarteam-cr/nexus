/**
 * lib/timeline/proposal-deltas.test.ts — deltas por ítem de la propuesta de cronograma.
 *
 * Lo que estos tests FIJAN (el bug de Wherex): la propuesta del handoff es solo estructura de
 * fases sin `tasks` — eso JAMÁS puede leerse como "borrar tareas". Y una propuesta idéntica a lo
 * existente produce cero deltas (no-op → no molesta al CSE).
 */
import { test, expect } from "vitest";
import { computeProposalDeltas, describeChange, buildPhaseOrder } from "./proposal-deltas";

const cur = (over: Partial<Parameters<typeof computeProposalDeltas>[0][number]> = {}) => ({
  id: "ph1",
  name: "Configuración",
  durationWeeks: 4,
  startWeek: null,
  sessionCount: 3,
  notes: null,
  activityType: "CONFIGURACION",
  ...over,
});

test("propuesta idéntica → cero deltas (no-op)", () => {
  const current = [cur(), cur({ id: "ph2", name: "Adopción", activityType: "ADOPCION" })];
  const proposal = { anchorStartDate: null, phases: current.map((p) => ({ ...p })) };
  expect(computeProposalDeltas(current, proposal, null)).toEqual([]);
});

test("fase sin id → ADD_PHASE; con cambio de duración → MODIFY_PHASE con from/to", () => {
  const current = [cur()];
  const proposal = {
    anchorStartDate: null,
    phases: [
      { ...cur(), durationWeeks: 6 }, // 4 → 6
      { name: "Integración SAP", durationWeeks: 3, startWeek: null, sessionCount: 2, notes: null },
    ],
  };
  const deltas = computeProposalDeltas(current, proposal, null);
  expect(deltas).toHaveLength(2);
  expect(deltas[0]).toMatchObject({
    kind: "MODIFY_PHASE",
    phaseId: "ph1",
    changes: [{ field: "durationWeeks", from: 4, to: 6 }],
  });
  expect(deltas[1]).toMatchObject({ kind: "ADD_PHASE", key: "add:1" });
});

test("`tasks` ausente o presente en la propuesta NO produce deltas de tareas", () => {
  const current = [cur()];
  // Aunque una propuesta trajera tasks (no debería), el helper es phase-level: las ignora.
  const proposal = { anchorStartDate: null, phases: [{ ...cur(), tasks: [] }] };
  expect(computeProposalDeltas(current, proposal, null)).toEqual([]);
});

test("fase propuesta con id que ya no existe (borrada por humano) → delta descartado", () => {
  const proposal = { anchorStartDate: null, phases: [cur({ id: "muerta" })] };
  expect(computeProposalDeltas([], proposal, null)).toEqual([]);
});

test("anchor nuevo (derivado del kickoff) → SET_ANCHOR; anchor igual → nada", () => {
  const current = [cur()];
  const same = { anchorStartDate: "2026-05-19T00:00:00.000Z", phases: [cur()] };
  expect(computeProposalDeltas(current, same, "2026-05-19")).toEqual([]);
  const set = computeProposalDeltas(current, same, null);
  expect(set).toEqual([{ key: "anchor", kind: "SET_ANCHOR", from: null, to: "2026-05-19" }]);
});

test("describeChange redacta la sugerencia principal", () => {
  expect(describeChange({ field: "durationWeeks", from: 4, to: 6 })).toBe("4 → 6 semanas");
  expect(describeChange({ field: "name", from: "A", to: "B" })).toBe("renombrar a «B»");
});

// ── Asperezas corregidas ─────────────────────────────────────────────────────────────────

test("una fase nueva sabe DÓNDE va (después de la fase previa de la propuesta)", () => {
  const a = cur({ id: "a", name: "Sales Hub" });
  const b = cur({ id: "b", name: "Service Hub" });
  const proposal = {
    anchorStartDate: null,
    phases: [{ ...a }, { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null }, { ...b }],
  };
  const [d] = computeProposalDeltas([a, b], proposal, null);
  expect(d).toMatchObject({ kind: "ADD_PHASE", afterPhaseId: "a", afterPhaseName: "Sales Hub" });
});

test("una fase nueva AL PRINCIPIO no tiene ancla previa", () => {
  const a = cur({ id: "a" });
  const proposal = {
    anchorStartDate: null,
    phases: [{ name: "Semana 0", durationWeeks: 1, sessionCount: null, notes: null }, { ...a }],
  };
  const [d] = computeProposalDeltas([a], proposal, null);
  expect(d).toMatchObject({ kind: "ADD_PHASE", afterPhaseId: null, afterPhaseName: null });
});

test("reordenar las MISMAS fases produce un delta (antes se perdía en silencio)", () => {
  const a = cur({ id: "a", name: "A" });
  const b = cur({ id: "b", name: "B" });
  const proposal = { anchorStartDate: null, phases: [{ ...b }, { ...a }] };
  const deltas = computeProposalDeltas([a, b], proposal, null);
  expect(deltas).toEqual([
    { key: "reorder", kind: "REORDER_PHASES", ids: ["b", "a"], names: ["B", "A"] },
  ]);
  expect(computeProposalDeltas([a, b], { anchorStartDate: null, phases: [{ ...a }, { ...b }] }, null)).toEqual([]);
});

test("buildPhaseOrder: la fase aceptada cae en su lugar, no al final", () => {
  const a = cur({ id: "a" });
  const b = cur({ id: "b" });
  const nueva = { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null };
  const proposal = { anchorStartDate: null, phases: [{ ...a }, nueva, { ...b }] };
  expect(buildPhaseOrder([a, b], proposal, new Set(["add:1"]))).toEqual([
    { kind: "existing", id: "a" },
    { kind: "new", key: "add:1", phase: nueva },
    { kind: "existing", id: "b" },
  ]);
});

test("buildPhaseOrder: reorden + fase nueva se resuelven juntos, sin pisarse", () => {
  const a = cur({ id: "a" });
  const b = cur({ id: "b" });
  const nueva = { name: "N", durationWeeks: 1, sessionCount: null, notes: null };
  const proposal = { anchorStartDate: null, phases: [{ ...b }, nueva, { ...a }] };
  expect(buildPhaseOrder([a, b], proposal, new Set(["reorder", "add:1"]))).toEqual([
    { kind: "existing", id: "b" },
    { kind: "new", key: "add:1", phase: nueva },
    { kind: "existing", id: "a" },
  ]);
  expect(buildPhaseOrder([a, b], proposal, new Set(["add:1"]))).toEqual([
    { kind: "existing", id: "a" },
    { kind: "existing", id: "b" },
    { kind: "new", key: "add:1", phase: nueva },
  ]);
});

test("buildPhaseOrder: dos fases nuevas consecutivas conservan su orden relativo", () => {
  const a = cur({ id: "a" });
  const n1 = { name: "N1", durationWeeks: 1, sessionCount: null, notes: null };
  const n2 = { name: "N2", durationWeeks: 1, sessionCount: null, notes: null };
  const proposal = { anchorStartDate: null, phases: [{ ...a }, n1, n2] };
  expect(buildPhaseOrder([a], proposal, new Set(["add:1", "add:2"]))).toEqual([
    { kind: "existing", id: "a" },
    { kind: "new", key: "add:1", phase: n1 },
    { kind: "new", key: "add:2", phase: n2 },
  ]);
});
