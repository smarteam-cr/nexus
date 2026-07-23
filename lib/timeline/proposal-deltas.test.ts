/**
 * lib/timeline/proposal-deltas.test.ts — deltas por ítem de la propuesta de cronograma.
 *
 * Lo que estos tests FIJAN (el bug de Wherex): la propuesta del handoff es solo estructura de
 * fases sin `tasks` — eso JAMÁS puede leerse como "borrar tareas". Y una propuesta idéntica a lo
 * existente produce cero deltas (no-op → no molesta al CSE).
 */
import { test, expect } from "vitest";
import { computeProposalDeltas, describeChange } from "./proposal-deltas";

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
