/**
 * lib/timeline/semanas-en-los-consumidores.test.ts — una tarea de varias semanas en cada lugar que calcula su fin
 * (2026-11-19). Cada caso compara la MISMA tarea con una semana y con tres: con una, vence; con tres, todavía no.
 * Si un consumidor vuelve a sumar `weekIndex + 1` por su cuenta, su caso se pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { collectClientBlockers } from "./client-blockers";
import { buildTaskSnapshotEntries } from "./baseline";
import { addWeeks } from "./weeks";
import { computeProjectSummary } from "@/lib/portfolio/summary";

describe("lo que debe el cliente (client-blockers)", () => {
  // Arranque lunes 1 jun; hoy 1 jul = semana absoluta 4.
  const ANCHOR = "2026-06-01T00:00:00.000Z";
  const HOY = new Date("2026-07-01T12:00:00");
  const fases = (semanas: number | null) => [
    { order: 0, durationWeeks: 6, name: "Fase", tasks: [{ title: "Mandar la base", weekIndex: 2, semanas, party: "CLIENTE", status: "PENDING" }] },
  ];

  it("una tarea de una semana en la S2 ya venció; de tres (S2 a S4) todavía no", () => {
    expect(collectClientBlockers(fases(null), ANCHOR, HOY)).toHaveLength(1);
    expect(collectClientBlockers(fases(3), ANCHOR, HOY)).toHaveLength(0);
  });

  it("con dos semanas (S2 y S3) vence al final de la S3 y el atraso se cuenta desde ahí", () => {
    const [b] = collectClientBlockers(fases(2), ANCHOR, HOY);
    expect(b.dueDateIso).toBe(addWeeks(ANCHOR, 4).toISOString());
    expect(b.weeksLate).toBe(1);
  });
});

describe("la promesa congelada (línea base)", () => {
  it("el fin planeado de una tarea de tres semanas es el de la tercera", () => {
    const A = "2026-08-03T00:00:00.000Z";
    const base = { title: "Tarea", order: 0, source: "HUMAN" as const, needsValidation: false, status: "PENDING" as const };
    const [una, tres] = buildTaskSnapshotEntries(A, 2, [
      { ...base, id: "una", weekIndex: 1 },
      { ...base, id: "tres", weekIndex: 1, semanas: 3 },
    ]);
    expect(una.plannedStart).toBe(addWeeks(A, 3).toISOString());
    expect(una.plannedEnd).toBe(addWeeks(A, 4).toISOString());
    expect(tres.plannedStart).toBe(addWeeks(A, 3).toISOString());
    expect(tres.plannedEnd).toBe(addWeeks(A, 6).toISOString());
  });
});

describe("la cartera (portfolio/summary)", () => {
  const resumen = (semanas: number | null) =>
    computeProjectSummary({
      status: "active",
      anchorStartDate: new Date("2026-06-01"),
      phases: [
        {
          id: "p1", name: "Fase", status: "IN_PROGRESS", order: 0, durationWeeks: 8, actualStart: null, actualEnd: null,
          tasks: [{ id: "t1", status: "IN_PROGRESS", weekIndex: 1, semanas, actualStart: null, actualEnd: null, needsValidation: false }],
        },
      ],
      baseline: null,
      lastProgressAt: null,
      healthOverride: null,
      now: new Date("2026-06-21T00:00:00Z"), // semana 2 en curso
    });

  it("una tarea de una semana en la S1 está atrasada el 21 jun; la misma de tres semanas, no", () => {
    expect(resumen(null).overdueTasks).toBe(1);
    expect(resumen(3).overdueTasks).toBe(0);
  });
});
