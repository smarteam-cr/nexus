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

test("fase agregada + anchor movido → une los tres fragmentos", () => {
  /* Agregar una fase de 2 semanas Y mover el arranque 7 días corre el cierre 21 días: desde la
     Tanda J la publicación lo dice, en vez de dejar al cliente atando cabos. */
  const prev = data({ phases: [phase("A")], anchorStartDate: "2026-06-01T00:00:00.000Z" });
  const next = data({ phases: [phase("A"), phase("B")], anchorStartDate: "2026-06-08T00:00:00.000Z" });
  expect(suggestPublishReason(prev, next)).toBe(
    "Se agregó 1 fase, se movió la fecha de arranque y se corrió la fecha de cierre 21 días.",
  );
});

/**
 * ── EL AGUJERO QUE LA TANDA J CIERRA ────────────────────────────────────────
 * Alargar una fase no cambia ids de fase, ni claves de tarea, ni el arranque: pasaba por TODOS
 * los diffs de conjunto sin dejar rastro. El CSE abría el modal con la sugerencia vacía y el
 * cliente recibía el plan corrido sin explicación.
 */
test("alargar una fase mueve el cierre — antes de la Tanda J esto devolvía \"\"", () => {
  const prev = data({ phases: [{ ...phase("A"), durationWeeks: 2 }] });
  const next = data({ phases: [{ ...phase("A"), durationWeeks: 5 }] });
  expect(suggestPublishReason(prev, next)).toBe("Se corrió la fecha de cierre 21 días.");
});

test("acortar una fase se anuncia como adelanto, no como corrimiento", () => {
  const prev = data({ phases: [{ ...phase("A"), durationWeeks: 5 }] });
  const next = data({ phases: [{ ...phase("A"), durationWeeks: 2 }] });
  expect(suggestPublishReason(prev, next)).toBe("Se adelantó la fecha de cierre 21 días.");
});

test("el MISMO día de calendario en dos ISO distintos no genera ningún fragmento", () => {
  /* La comparación era por string del ISO completo, así que un re-guardado que normalizara el
     formato inventaba «se movió la fecha de arranque» sobre un plan idéntico. */
  const prev = data({ phases: [phase("A")], anchorStartDate: "2026-06-01" });
  const next = data({ phases: [phase("A")], anchorStartDate: "2026-06-01T00:00:00.000Z" });
  expect(suggestPublishReason(prev, next)).toBe("");
});

test("una fase en PARALELO que cabe adentro del plan no mueve el cierre", () => {
  const prev = data({ phases: [{ ...phase("A"), durationWeeks: 6 }] });
  const next = data({
    phases: [{ ...phase("A"), durationWeeks: 6 }, { ...phase("B"), durationWeeks: 3, startWeek: 0 }],
  });
  // Se anuncia la fase nueva, pero NO un corrimiento que no ocurrió.
  expect(suggestPublishReason(prev, next)).toBe("Se agregó 1 fase.");
});

test("mezcla: tarea agregada + particularidad visible", () => {
  const prev = data({ phases: [phase("A", [{ title: "T1", weekIndex: 0 }])], particularidades: [] });
  const next = data({
    phases: [phase("A", [{ title: "T1", weekIndex: 0 }, { title: "T2", weekIndex: 1 }])],
    particularidades: [part("Solicitud X", "2026-07-01T00:00:00.000Z")],
  });
  expect(suggestPublishReason(prev, next)).toBe("Se agregó 1 tarea y se hizo visible 1 particularidad.");
});
