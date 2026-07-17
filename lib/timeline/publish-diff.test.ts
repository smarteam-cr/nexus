/**
 * lib/timeline/publish-diff.test.ts
 *
 * Tests de suggestPublishReason — diff determinista entre el snapshot publicado y el próximo.
 */
import { test, expect } from "vitest";
import { suggestPublishReason } from "./publish-diff";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";

const phase = (id: string, tasks: Array<{ title: string; weekIndex: number }> = []) => ({
  id, name: id, order: 0, durationWeeks: 2, startWeek: null, sessionCount: null, notes: null,
  activityType: null, tasks,
});
const part = (title: string, occurredAt: string) => ({
  kind: "ATRASO", party: "CLIENTE", title, detail: null, weeksImpact: 1, phaseId: null, occurredAt,
});
const data = (over: Partial<ExternalTimelineData> = {}): ExternalTimelineData => ({
  exists: true, anchorStartDate: "2026-06-01T00:00:00.000Z", phases: [], particularidades: [], ...over,
});

test("prev null → sin sugerencia", () => {
  expect(suggestPublishReason(null, data())).toBe("");
});

test("sin cambios → sin sugerencia", () => {
  const d = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }])] });
  expect(suggestPublishReason(d, d)).toBe("");
});

test("tarea agregada", () => {
  const prev = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }])] });
  const next = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }, { title: "T2", weekIndex: 1 }])] });
  expect(suggestPublishReason(prev, next)).toBe("Se agregó 1 tarea.");
});

test("2 tareas quitadas (plural)", () => {
  const prev = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }, { title: "T2", weekIndex: 1 }, { title: "T3", weekIndex: 2 }])] });
  const next = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }])] });
  expect(suggestPublishReason(prev, next)).toBe("Se quitaron 2 tareas.");
});

test("particularidad visibilizada", () => {
  const prev = data({ particularidades: [] });
  const next = data({ particularidades: [part("Se atrasó la base", "2026-07-01T00:00:00.000Z")] });
  expect(suggestPublishReason(prev, next)).toBe("Se hizo visible 1 particularidad.");
});

test("particularidad ocultada", () => {
  const prev = data({ particularidades: [part("Se atrasó la base", "2026-07-01T00:00:00.000Z")] });
  const next = data({ particularidades: [] });
  expect(suggestPublishReason(prev, next)).toBe("Se ocultó 1 particularidad.");
});

test("fase agregada + anchor movido → une con 'y'", () => {
  const prev = data({ phases: [phase("A")], anchorStartDate: "2026-06-01T00:00:00.000Z" });
  const next = data({ phases: [phase("A"), phase("B")], anchorStartDate: "2026-06-08T00:00:00.000Z" });
  expect(suggestPublishReason(prev, next)).toBe("Se agregó 1 fase y se movió la fecha de arranque.");
});

test("mezcla: tarea agregada + particularidad visible", () => {
  const prev = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }])], particularidades: [] });
  const next = data({
    phases: [phase("A", [{ title: "T1", weekIndex: 0 }, { title: "T2", weekIndex: 1 }])],
    particularidades: [part("Solicitud X", "2026-07-01T00:00:00.000Z")],
  });
  expect(suggestPublishReason(prev, next)).toBe("Se agregó 1 tarea y se hizo visible 1 particularidad.");
});
