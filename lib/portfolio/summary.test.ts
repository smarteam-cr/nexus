/**
 * lib/portfolio/summary.test.ts
 *
 * Tests del MOTOR de cartera (computeProjectSummary, puro). Casos:
 *   A) baseline + tareas/fase agregadas post-baseline → el diff de alcance cuenta bien.
 *   B) sin baseline → alcance "no medible" (sin línea base).
 *   C) fase con plannedEnd pasado y no DONE → atrasada (riesgo).
 *   D) override de salud prevalece sobre la derivada.
 *   E) SUSPENDED fuera del denominador.
 *   F) fase DONE no ensucia con tareas PENDING vencidas.
 *
 * Correr: `npm test` (Vitest, proyecto unit).
 */
import { test, expect } from "vitest";
import { computeProjectSummary } from "./summary";
import type { BaselineSnapshot } from "@/lib/timeline/baseline";

const NOW = new Date("2026-06-21T00:00:00Z");
const d = (s: string) => new Date(s);

test("A — baseline + agregados: diff de alcance y avance correctos", () => {
  const baseline = {
    snapshot: {
      anchorStartDate: "2026-06-01",
      phases: [
        {
          id: "p1", durationWeeks: 2, plannedEnd: "2026-06-15",
          tasks: [
            { id: "t1", plannedEnd: "2026-06-08" },
            { id: "t2", plannedEnd: "2026-06-15" },
          ],
        },
      ],
    } as unknown as BaselineSnapshot,
    firmnessLabel: "FIRM",
  };
  const s = computeProjectSummary({
    status: "active",
    anchorStartDate: d("2026-06-01"),
    phases: [
      {
        id: "p1", name: "Kickoff", status: "PENDING", order: 0, durationWeeks: 2, actualStart: null, actualEnd: null,
        tasks: [
          { id: "t1", status: "DONE", weekIndex: 0, actualStart: d("2026-06-02"), actualEnd: d("2026-06-20"), needsValidation: false },
          { id: "t2", status: "PENDING", weekIndex: 1, actualStart: null, actualEnd: null, needsValidation: false },
          { id: "t3", status: "PENDING", weekIndex: 1, actualStart: null, actualEnd: null, needsValidation: false },
        ],
      },
      {
        id: "p2", name: "Set-up", status: "PENDING", order: 1, durationWeeks: 1, actualStart: null, actualEnd: null,
        tasks: [{ id: "t4", status: "PENDING", weekIndex: 0, actualStart: null, actualEnd: null, needsValidation: false }],
      },
    ],
    baseline,
    lastProgressAt: null,
    healthOverride: null,
    now: NOW,
  });
  expect(s.scope.measurable).toBe(true);
  expect(s.scope.addedTasks).toBe(2); // t3, t4
  expect(s.scope.addedPhases).toBe(1); // p2
  expect(s.scope.weeksDelta).toBe(1); // 3 - 2
  expect(s.scope.exceeded).toBe(true);
  expect(Math.abs(s.progress.pct - 0.25) < 1e-9).toBeTruthy(); // 1/4 tareas DONE
});

test("B — sin baseline: alcance no medible", () => {
  const s = computeProjectSummary({
    status: "active",
    anchorStartDate: d("2026-06-01"),
    phases: [{ id: "x1", name: "Discovery", status: "IN_PROGRESS", order: 0, durationWeeks: 2, actualStart: d("2026-06-19"), actualEnd: null, tasks: [] }],
    baseline: null,
    lastProgressAt: null,
    healthOverride: null,
    now: NOW,
  });
  expect(s.scope.measurable).toBe(false);
  expect(s.hasBaseline).toBe(false);
});

test("C — fase vencida y no DONE: atrasada → EN_RIESGO", () => {
  const baseline = {
    snapshot: {
      anchorStartDate: "2026-04-01",
      phases: [{ id: "c1", durationWeeks: 4, plannedEnd: "2026-05-01", tasks: [{ id: "ct1", plannedEnd: "2026-04-24" }] }],
    } as unknown as BaselineSnapshot,
    firmnessLabel: "FIRM",
  };
  const s = computeProjectSummary({
    status: "active",
    anchorStartDate: d("2026-04-01"),
    phases: [{ id: "c1", name: "Arquitectura", status: "PENDING", order: 0, durationWeeks: 4, actualStart: null, actualEnd: null, tasks: [{ id: "ct1", status: "PENDING", weekIndex: 0, actualStart: null, actualEnd: null, needsValidation: false }] }],
    baseline,
    lastProgressAt: null,
    healthOverride: null,
    now: NOW,
  });
  expect(s.overduePhases).toBe(1);
  expect(s.overdueTasks).toBe(1);
  expect(s.worstDaysLate >= 50).toBeTruthy();
  expect(s.worstOverduePhase?.name).toBe("Arquitectura"); // la fase peor-atrasada por nombre
  expect((s.worstOverduePhase?.daysLate ?? 0) >= 50).toBeTruthy();
  expect(s.health.resolved).toBe("EN_RIESGO");
});

test("D — override prevalece sobre la derivada", () => {
  const s = computeProjectSummary({
    status: "active",
    anchorStartDate: d("2026-04-01"),
    phases: [{ id: "z1", name: "Cierre", status: "PENDING", order: 0, durationWeeks: 1, actualStart: null, actualEnd: null, tasks: [] }],
    baseline: null,
    lastProgressAt: null,
    healthOverride: "SALUDABLE",
    now: NOW,
  });
  expect(s.health.resolved).toBe("SALUDABLE");
  expect(s.health.source).toBe("override");
});

test("E — SUSPENDED: fuera del denominador del avance y no cuenta como vencida", () => {
  const baseline = {
    snapshot: {
      anchorStartDate: "2026-04-01",
      phases: [{ id: "e1", durationWeeks: 2, plannedEnd: "2026-07-01", tasks: [
        { id: "et1", plannedEnd: "2026-04-08" },
        { id: "et2", plannedEnd: "2026-04-15" },
      ] }],
    } as unknown as BaselineSnapshot,
    firmnessLabel: "FIRM",
  };
  const s = computeProjectSummary({
    status: "active",
    anchorStartDate: d("2026-04-01"),
    phases: [{ id: "e1", name: "Kickoff", status: "IN_PROGRESS", order: 0, durationWeeks: 2, actualStart: d("2026-04-02"), actualEnd: null, tasks: [
      { id: "et1", status: "DONE", weekIndex: 0, actualStart: d("2026-04-02"), actualEnd: d("2026-04-07"), needsValidation: false },
      { id: "et2", status: "SUSPENDED", weekIndex: 1, actualStart: null, actualEnd: null, needsValidation: false },
    ] }],
    baseline,
    lastProgressAt: null,
    healthOverride: null,
    now: NOW,
  });
  expect(Math.abs(s.progress.pct - 1) < 1e-9).toBeTruthy(); // 1 DONE / 1 no-suspendida = 100% (et2 fuera del denominador)
  expect(s.overdueTasks).toBe(0); // et2 suspendida: su plannedEnd pasó pero NO cuenta como vencida
});

test("F — fase DONE con tarea PENDING vencida: la guarda evita el falso atraso", () => {
  const baseline = {
    snapshot: {
      anchorStartDate: "2026-04-01",
      phases: [{ id: "f1", durationWeeks: 2, plannedEnd: "2026-04-15", tasks: [
        { id: "ft1", plannedEnd: "2026-04-15" },
      ] }],
    } as unknown as BaselineSnapshot,
    firmnessLabel: "FIRM",
  };
  const s = computeProjectSummary({
    status: "active",
    anchorStartDate: d("2026-04-01"),
    phases: [{ id: "f1", name: "Kickoff", status: "DONE", order: 0, durationWeeks: 2, actualStart: d("2026-04-02"), actualEnd: d("2026-04-20"), tasks: [
      { id: "ft1", status: "PENDING", weekIndex: 1, actualStart: null, actualEnd: null, needsValidation: false },
    ] }],
    baseline,
    lastProgressAt: null,
    healthOverride: null,
    now: NOW,
  });
  expect(s.overdueTasks).toBe(0); // la fase ya está DONE → su tarea PENDING vencida no ensucia el panel
  expect(s.overduePhases).toBe(0); // la fase DONE tampoco cuenta (guarda de fase ya existente)
});
