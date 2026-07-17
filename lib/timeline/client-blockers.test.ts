/**
 * lib/timeline/client-blockers.test.ts
 *
 * Tests de collectClientBlockers (pura) — deriva las tareas del CLIENTE atrasadas para la
 * sección "pendientes del cliente" al pie del cronograma (interno + externo). El criterio de
 * atraso es el mismo `isOverdueByDate` del Gantt (fin planeado de la semana < hoy, no DONE/SUSPENDED).
 * Casos:
 *   1) CLIENTE vencida y no hecha → incluida, con weeksLate y dueDateIso correctos.
 *   2) CLIENTE en el futuro → NO (aún no vence).
 *   3) CLIENTE DONE / SUSPENDED → NO (resuelta).
 *   4) SMARTEAM / AMBOS / null vencida → NO (solo CLIENTE).
 *   5) now null (SSR) o anchor null → [] (no hay "hoy" contra el cual medir).
 *   6) Orden por weeksLate desc (peor primero).
 *   7) Fases en paralelo (startWeek) → absWeek/weeksLate correctos.
 */
import { test, expect } from "vitest";
import { collectClientBlockers, type BlockerPhaseLike, type BlockerTaskLike } from "./client-blockers";

// Anchor lunes 1 jun 2026 (UTC). "Hoy" = 1 jul 2026 → 30 días = semana absoluta 4 en curso.
const ANCHOR = "2026-06-01T00:00:00.000Z";
const NOW = new Date("2026-07-01T12:00:00"); // curWeek = floor(30/7) = 4

type Task = BlockerTaskLike & { key: string };
type Phase = BlockerPhaseLike<Task>;

const task = (key: string, weekIndex: number, party: string | null, status = "PENDING"): Task => ({
  key, title: `T-${key}`, weekIndex, party, status,
});

// Fase 0: semanas absolutas 0-1 (dur 2). Fase 1: 2-4 (dur 3). Contiguas.
const phases = (tasks0: Task[], tasks1: Task[] = []): Phase[] => [
  { order: 0, durationWeeks: 2, name: "Fase A", tasks: tasks0 },
  { order: 1, durationWeeks: 3, name: "Fase B", tasks: tasks1 },
];

test("CLIENTE vencida y no hecha → incluida con weeksLate y dueDateIso correctos", () => {
  // weekIndex 0 en Fase A → absWeek 0. curWeek 4 → weeksLate 4. dueDate = anchor + 1 semana.
  const r = collectClientBlockers(phases([task("a", 0, "CLIENTE")]), ANCHOR, NOW);
  expect(r).toHaveLength(1);
  expect(r[0].task.key).toBe("a");
  expect(r[0].phaseName).toBe("Fase A");
  expect(r[0].absWeek).toBe(0);
  expect(r[0].weeksLate).toBe(4);
  expect(r[0].dueDateIso).toBe("2026-06-08T00:00:00.000Z");
});

test("CLIENTE en el futuro → NO", () => {
  // Fase B empieza en semana 2, weekIndex 2 → absWeek 4 == curWeek (no < ) → no vencida.
  const r = collectClientBlockers(phases([], [task("b", 2, "CLIENTE")]), ANCHOR, NOW);
  expect(r).toHaveLength(0);
});

test("CLIENTE DONE o SUSPENDED → NO", () => {
  const r = collectClientBlockers(
    phases([task("done", 0, "CLIENTE", "DONE"), task("susp", 0, "CLIENTE", "SUSPENDED")]),
    ANCHOR, NOW,
  );
  expect(r).toHaveLength(0);
});

test("SMARTEAM / AMBOS / DEV / null vencida → NO (solo CLIENTE)", () => {
  const r = collectClientBlockers(
    phases([task("s", 0, "SMARTEAM"), task("am", 0, "AMBOS"), task("d", 0, "DEV"), task("n", 0, null)]),
    ANCHOR, NOW,
  );
  expect(r).toHaveLength(0);
});

test("now null o anchor null → []", () => {
  expect(collectClientBlockers(phases([task("a", 0, "CLIENTE")]), ANCHOR, null)).toEqual([]);
  expect(collectClientBlockers(phases([task("a", 0, "CLIENTE")]), null, NOW)).toEqual([]);
});

test("orden por weeksLate desc (peor primero)", () => {
  // absWeek 0 (late 4) y absWeek 3 en Fase B (late 1). El más atrasado va primero.
  const r = collectClientBlockers(
    phases([task("old", 0, "CLIENTE")], [task("recent", 1, "CLIENTE")]),
    ANCHOR, NOW,
  );
  expect(r.map((b) => b.task.key)).toEqual(["old", "recent"]);
  expect(r[0].weeksLate).toBe(4);
  expect(r[1].weeksLate).toBe(1); // Fase B start 2 + weekIndex 1 = absWeek 3; curWeek 4 → 1
});

test("fases en paralelo (startWeek) → absWeek correcto", () => {
  // Fase B con startWeek explícito 0 (paralela a A): su weekIndex 0 → absWeek 0, no 2.
  const parallel: Phase[] = [
    { order: 0, durationWeeks: 2, name: "Fase A", tasks: [] },
    { order: 1, durationWeeks: 3, startWeek: 0, name: "Fase B", tasks: [task("p", 0, "CLIENTE")] },
  ];
  const r = collectClientBlockers(parallel, ANCHOR, NOW);
  expect(r).toHaveLength(1);
  expect(r[0].absWeek).toBe(0);
  expect(r[0].weeksLate).toBe(4);
});
