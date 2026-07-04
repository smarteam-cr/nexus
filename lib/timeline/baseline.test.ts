/**
 * lib/timeline/baseline.test.ts
 *
 * Tests de las partes PURAS del baseline (D.3): buildBaselineSnapshot y planFingerprint.
 * (freezeBaselineOnPublish es DB-coupled → fuera de alcance acá.)
 *
 * NOTA: para testear el fingerprint se agregó `export` a planFingerprint en baseline.ts
 * (función pura interna, sin cambio de comportamiento — único cambio permitido).
 *
 * Casos:
 *   A) Estructura del snapshot: metadata de fases y tareas copiada 1:1, startWeek
 *      normalizado a null, anchorStartDate en ISO.
 *   B) Fechas planned absolutas con fases CONTIGUAS: fase N arranca donde terminó la
 *      anterior; tarea = inicio de fase + weekIndex, dura 1 semana (vía lib/timeline/weeks.ts).
 *   C) startWeek explícito (fases en paralelo): la fase arranca ahí y la siguiente
 *      contigua arranca al fin de ESA (cursor avanza).
 *   D) Sin anchor: anchorStartDate null y TODAS las fechas planned null.
 *   E) Firmeza FIRM: 0 needsValidation → firmPct 1, label FIRM; agentUntouchedPhases
 *      cuenta fases source=AGENT (no tareas).
 *   F) Firmeza MIXED: redondeo a 3 decimales y borde exacto 0.5 → MIXED (el corte es < 0.5).
 *   G) Firmeza WEAK: 0 tareas → firmPct null + WEAK; mayoría needsValidation → WEAK.
 *   H) planFingerprint determinista: mismo plan → mismo hash aunque cambie el orden de
 *      claves, el `status` (fase y tarea) o startWeek undefined vs null.
 *   I) planFingerprint discrimina: cambia lo vendido (needsValidation, durationWeeks,
 *      anchor, orden de fases) → hash distinto.
 *
 * Correr: `npx vitest run lib/timeline/baseline.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { buildBaselineSnapshot, planFingerprint } from "./baseline";
import type { BaselineSnapshot } from "./baseline";
import { addWeeks } from "@/lib/timeline/weeks";

const ANCHOR = new Date("2026-08-03T00:00:00.000Z");
const ANCHOR_ISO = ANCHOR.toISOString();

/** Semana absoluta `w` desde el anchor, en ISO — misma convención que weeks.ts. */
const week = (w: number) => addWeeks(ANCHOR_ISO, w).toISOString();

type PhaseInput = Parameters<typeof buildBaselineSnapshot>[1][number];
type TaskInput = PhaseInput["tasks"][number];

function makeTask(over: Partial<TaskInput> = {}): TaskInput {
  return {
    id: "t1",
    title: "Configurar pipeline",
    weekIndex: 0,
    order: 0,
    source: "AGENT",
    needsValidation: false,
    status: "PENDING",
    ...over,
  };
}

function makePhase(over: Partial<PhaseInput> = {}): PhaseInput {
  return {
    id: "p1",
    name: "Kickoff",
    order: 0,
    durationWeeks: 2,
    startWeek: null,
    sessionCount: 2,
    activityType: "CONFIGURACION",
    source: "AGENT",
    status: "PENDING",
    tasks: [],
    ...over,
  };
}

/** Clon profundo con las claves de cada objeto en orden INVERSO (mismo contenido). */
function reverseKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reverseKeys) as T;
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).reverse()) {
      out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return v;
}

test("A — estructura: metadata de fase y tarea copiada 1:1, startWeek→null, anchor en ISO", () => {
  const { snapshot } = buildBaselineSnapshot(ANCHOR, [
    makePhase({
      id: "ph-a",
      name: "Exploración",
      order: 3,
      durationWeeks: 1,
      startWeek: undefined, // sin inicio explícito → el snapshot lo normaliza a null
      sessionCount: null,
      activityType: "EXPLORACION",
      source: "MODIFIED",
      status: "IN_PROGRESS",
      tasks: [
        makeTask({
          id: "tk-a",
          title: "Levantar requerimientos",
          weekIndex: 0,
          order: 5,
          source: "HUMAN",
          needsValidation: true,
          status: "DONE",
        }),
      ],
    }),
  ]);

  expect(snapshot.anchorStartDate).toBe(ANCHOR_ISO);
  expect(snapshot.phases).toHaveLength(1);
  const p = snapshot.phases[0];
  expect(p).toMatchObject({
    id: "ph-a",
    name: "Exploración",
    order: 3,
    durationWeeks: 1,
    startWeek: null, // undefined normalizado
    sessionCount: null,
    activityType: "EXPLORACION",
    source: "MODIFIED",
    status: "IN_PROGRESS",
  });
  expect(p.tasks).toHaveLength(1);
  expect(p.tasks[0]).toMatchObject({
    id: "tk-a",
    title: "Levantar requerimientos",
    weekIndex: 0,
    order: 5,
    source: "HUMAN",
    needsValidation: true,
    status: "DONE",
  });
});

test("B — fechas planned contiguas: fase 2 arranca al fin de fase 1; tarea = inicio de fase + weekIndex, dura 1 semana", () => {
  const { snapshot } = buildBaselineSnapshot(ANCHOR, [
    makePhase({ id: "p1", durationWeeks: 2 }),
    makePhase({
      id: "p2",
      order: 1,
      durationWeeks: 3,
      tasks: [makeTask({ id: "t1", weekIndex: 1 })],
    }),
  ]);

  const [p1, p2] = snapshot.phases;
  expect(p1.plannedStart).toBe(week(0));
  expect(p1.plannedEnd).toBe(week(2));
  expect(p2.plannedStart).toBe(week(2)); // contigua: arranca donde terminó p1
  expect(p2.plannedEnd).toBe(week(5));
  // tarea en semana relativa 1 de p2 → semana absoluta 3; ventana de 1 semana
  expect(p2.tasks[0].plannedStart).toBe(week(3));
  expect(p2.tasks[0].plannedEnd).toBe(week(4));
});

test("C — startWeek explícito: la fase paralela arranca ahí y la siguiente contigua arranca al fin de ESA", () => {
  const { snapshot } = buildBaselineSnapshot(ANCHOR, [
    makePhase({ id: "p1", durationWeeks: 4 }),
    makePhase({ id: "p2", order: 1, durationWeeks: 2, startWeek: 1 }), // solapa con p1
    makePhase({ id: "p3", order: 2, durationWeeks: 1 }), // contigua a p2, NO a p1
  ]);

  const [p1, p2, p3] = snapshot.phases;
  expect(p1.plannedStart).toBe(week(0));
  expect(p1.plannedEnd).toBe(week(4));
  expect(p2.startWeek).toBe(1); // el inicio explícito se congela
  expect(p2.plannedStart).toBe(week(1));
  expect(p2.plannedEnd).toBe(week(3));
  // el cursor avanza al fin de p2 → p3 arranca en la semana 3 (no en la 4)
  expect(p3.plannedStart).toBe(week(3));
  expect(p3.plannedEnd).toBe(week(4));
});

test("D — sin anchor: anchorStartDate null y todas las fechas planned null", () => {
  const { snapshot } = buildBaselineSnapshot(null, [
    makePhase({ tasks: [makeTask()] }),
  ]);

  expect(snapshot.anchorStartDate).toBeNull();
  const p = snapshot.phases[0];
  expect(p.plannedStart).toBeNull();
  expect(p.plannedEnd).toBeNull();
  expect(p.tasks[0].plannedStart).toBeNull();
  expect(p.tasks[0].plannedEnd).toBeNull();
});

test("E — firmeza FIRM: 0 needsValidation → firmPct 1; agentUntouchedPhases cuenta fases AGENT", () => {
  const { firmness } = buildBaselineSnapshot(ANCHOR, [
    makePhase({
      id: "p1",
      source: "AGENT",
      tasks: [makeTask({ id: "t1" }), makeTask({ id: "t2", order: 1 })],
    }),
    makePhase({ id: "p2", order: 1, source: "MODIFIED", tasks: [makeTask({ id: "t3" })] }),
    makePhase({ id: "p3", order: 2, source: "HUMAN" }),
  ]);

  expect(firmness.taskCount).toBe(3);
  expect(firmness.needsValidationCount).toBe(0);
  expect(firmness.firmPct).toBe(1);
  expect(firmness.label).toBe("FIRM");
  expect(firmness.agentUntouchedPhases).toBe(1); // solo p1 es source=AGENT
});

test("F — firmeza MIXED: redondeo a 3 decimales; el borde exacto 0.5 es MIXED (corte < 0.5)", () => {
  // 3 tareas, 1 needsValidation → 1 - 1/3 = 0.667 (redondeado a 3 decimales)
  const tercio = buildBaselineSnapshot(ANCHOR, [
    makePhase({
      tasks: [
        makeTask({ id: "t1", needsValidation: true }),
        makeTask({ id: "t2", order: 1 }),
        makeTask({ id: "t3", order: 2 }),
      ],
    }),
  ]).firmness;
  expect(tercio.firmPct).toBe(0.667);
  expect(tercio.label).toBe("MIXED");

  // 2 tareas, 1 needsValidation → firmPct exactamente 0.5 → NO es < 0.5 → MIXED
  const mitad = buildBaselineSnapshot(ANCHOR, [
    makePhase({
      tasks: [makeTask({ id: "t1", needsValidation: true }), makeTask({ id: "t2", order: 1 })],
    }),
  ]).firmness;
  expect(mitad.firmPct).toBe(0.5);
  expect(mitad.label).toBe("MIXED");
});

test("G — firmeza WEAK: sin tareas → firmPct null + WEAK; mayoría needsValidation → WEAK", () => {
  const sinTareas = buildBaselineSnapshot(ANCHOR, [makePhase()]).firmness;
  expect(sinTareas.taskCount).toBe(0);
  expect(sinTareas.needsValidationCount).toBe(0);
  expect(sinTareas.firmPct).toBeNull();
  expect(sinTareas.label).toBe("WEAK");

  // 3 tareas, 2 needsValidation → firmPct 0.333 < 0.5 → WEAK
  const mayoria = buildBaselineSnapshot(ANCHOR, [
    makePhase({
      tasks: [
        makeTask({ id: "t1", needsValidation: true }),
        makeTask({ id: "t2", order: 1, needsValidation: true }),
        makeTask({ id: "t3", order: 2 }),
      ],
    }),
  ]).firmness;
  expect(mayoria.firmPct).toBe(0.333);
  expect(mayoria.label).toBe("WEAK");
});

test("H — planFingerprint determinista: mismo plan → mismo hash con claves reordenadas, status distinto o startWeek undefined", () => {
  const { snapshot } = buildBaselineSnapshot(ANCHOR, [
    makePhase({
      id: "p1",
      tasks: [makeTask({ id: "t1" }), makeTask({ id: "t2", order: 1, needsValidation: true })],
    }),
    makePhase({ id: "p2", order: 1, durationWeeks: 3, startWeek: 1 }),
  ]);
  const base = planFingerprint(snapshot);

  // 1) claves en otro orden (p. ej. snapshot deserializado de la DB) → mismo hash
  expect(planFingerprint(reverseKeys(snapshot))).toBe(base);

  // 2) `status` es EJECUCIÓN, no promesa: cambiarlo en fase y tarea no altera el hash
  const conAvance: BaselineSnapshot = JSON.parse(JSON.stringify(snapshot));
  conAvance.phases[0].status = "DONE";
  conAvance.phases[0].tasks[0].status = "IN_PROGRESS";
  conAvance.phases[0].tasks[1].status = "SUSPENDED";
  expect(planFingerprint(conAvance)).toBe(base);

  // 3) startWeek ausente (snapshot viejo sin el campo) ≡ startWeek null
  const sinStartWeek: BaselineSnapshot = JSON.parse(JSON.stringify(snapshot));
  delete (sinStartWeek.phases[0] as Partial<BaselineSnapshot["phases"][number]>).startWeek; // p1 lo tenía en null
  expect(planFingerprint(sinStartWeek)).toBe(base);
});

test("I — planFingerprint discrimina: cambiar lo vendido (needsValidation, duración, anchor, orden de fases) cambia el hash", () => {
  const phases = [
    makePhase({ id: "p1", tasks: [makeTask({ id: "t1" })] }),
    makePhase({ id: "p2", order: 1, durationWeeks: 3 }),
  ];
  const base = planFingerprint(buildBaselineSnapshot(ANCHOR, phases).snapshot);

  const clone = () => JSON.parse(JSON.stringify(buildBaselineSnapshot(ANCHOR, phases).snapshot)) as BaselineSnapshot;

  const nv = clone();
  nv.phases[0].tasks[0].needsValidation = true;
  expect(planFingerprint(nv)).not.toBe(base);

  const dur = clone();
  dur.phases[1].durationWeeks = 4;
  expect(planFingerprint(dur)).not.toBe(base);

  const otroAnchor = planFingerprint(
    buildBaselineSnapshot(new Date("2026-08-10T00:00:00.000Z"), phases).snapshot,
  );
  expect(otroAnchor).not.toBe(base);

  // el ORDEN del array de fases es parte de la promesa (JSON.stringify preserva orden de arrays)
  const invertido = clone();
  invertido.phases.reverse();
  expect(planFingerprint(invertido)).not.toBe(base);
});
