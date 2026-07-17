/**
 * lib/timeline/weeks.test.ts
 *
 * Tests del predicado UNIFICADO de atraso (overduePlannedEnd + isOverdueByDate) — la única
 * fuente de "¿esta tarea está atrasada?" que comparten el Gantt interno, la vista externa,
 * client-blockers y el panel de cartera (summary.ts). Criterio: por FECHA (fin planeado de
 * la semana < hoy) y ORTOGONAL al estado, excluyendo DONE/SUSPENDED (resueltas).
 */
import { test, expect } from "vitest";
import { overduePlannedEnd, isOverdueByDate, addWeeks } from "./weeks";

// Anchor lunes 1 jun 2026 (UTC).
const ANCHOR = "2026-06-01T00:00:00.000Z";

test("overduePlannedEnd = anchor + (absWeek+1) semanas (convención fin-de-semana)", () => {
  // Fase start 0, weekIndex 0 → absWeek 0 → fin = anchor + 1 semana.
  expect(overduePlannedEnd(ANCHOR, 0, 0)?.toISOString()).toBe("2026-06-08T00:00:00.000Z");
  // Fase start 2, weekIndex 1 → absWeek 3 → fin = anchor + 4 semanas.
  expect(overduePlannedEnd(ANCHOR, 2, 1)?.toISOString()).toBe(addWeeks(ANCHOR, 4).toISOString());
});

test("overduePlannedEnd sin anchor → null", () => {
  expect(overduePlannedEnd(null, 0, 0)).toBeNull();
  expect(overduePlannedEnd(undefined, 3, 2)).toBeNull();
});

test("isOverdueByDate: fin planeado pasó y PENDING → atrasada", () => {
  const plannedEnd = overduePlannedEnd(ANCHOR, 0, 0); // 8 jun
  const now = new Date("2026-07-01T00:00:00.000Z");
  expect(isOverdueByDate(plannedEnd, now, "PENDING")).toBe(true);
  expect(isOverdueByDate(plannedEnd, now, "IN_PROGRESS")).toBe(true);
});

test("isOverdueByDate: DONE y SUSPENDED nunca están atrasadas (resueltas)", () => {
  const plannedEnd = overduePlannedEnd(ANCHOR, 0, 0);
  const now = new Date("2026-07-01T00:00:00.000Z");
  expect(isOverdueByDate(plannedEnd, now, "DONE")).toBe(false);
  expect(isOverdueByDate(plannedEnd, now, "SUSPENDED")).toBe(false);
});

test("isOverdueByDate: fin planeado en el futuro → no atrasada", () => {
  const plannedEnd = overduePlannedEnd(ANCHOR, 10, 0); // fin = anchor + 11 semanas
  const now = new Date("2026-07-01T00:00:00.000Z");
  expect(isOverdueByDate(plannedEnd, now, "PENDING")).toBe(false);
});

test("isOverdueByDate: null (sin anchor / sin montar) → false", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  expect(isOverdueByDate(null, now, "PENDING")).toBe(false);
  expect(isOverdueByDate(overduePlannedEnd(ANCHOR, 0, 0), null, "PENDING")).toBe(false);
});

test("isOverdueByDate: borde de día — atrasada al pasar el instante de fin, no antes", () => {
  const plannedEnd = overduePlannedEnd(ANCHOR, 0, 0)!; // 2026-06-08T00:00:00Z
  // Un instante ANTES del fin planeado → aún no atrasada.
  expect(isOverdueByDate(plannedEnd, new Date("2026-06-07T23:59:59.000Z"), "PENDING")).toBe(false);
  // Justo en el fin planeado (no estrictamente menor) → aún no atrasada.
  expect(isOverdueByDate(plannedEnd, new Date("2026-06-08T00:00:00.000Z"), "PENDING")).toBe(false);
  // Un instante DESPUÉS → atrasada.
  expect(isOverdueByDate(plannedEnd, new Date("2026-06-08T00:00:01.000Z"), "PENDING")).toBe(true);
});
