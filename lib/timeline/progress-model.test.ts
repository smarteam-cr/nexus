/**
 * lib/timeline/progress-model.test.ts
 *
 * Lo que se fija: el número nuevo tiene que poder EXPLICARSE. Cada caso de acá es una pregunta
 * que el CSE podría hacer mirando la pantalla ("¿por qué dice 40% si hice la mitad de las
 * tareas?") y su respuesta aritmética.
 */
import { describe, test, expect } from "vitest";
import { computeWeightedProgress, resolvedTaskCounts } from "./progress-model";

const t = (status: string, weekIndex = 0) => ({ status, weekIndex });
const AHORA = new Date("2026-07-26T00:00:00.000Z");
/** 10 semanas antes de AHORA. */
const HACE_10_SEMANAS = new Date("2026-05-17T00:00:00.000Z");

describe("resolvedTaskCounts: la regla ÚNICA que unifica las tres fórmulas", () => {
  /* El caso exacto que las hacía divergir: la cartera decía 62% y el Gantt 70% del mismo
     proyecto, porque uno sacaba las suspendidas del denominador y el otro las contaba como
     hechas Y en el denominador. */
  test("las suspendidas salen del numerador Y del denominador", () => {
    const tasks = [...Array(5).fill(t("DONE")), ...Array(2).fill(t("SUSPENDED")), ...Array(3).fill(t("PENDING"))];
    const c = resolvedTaskCounts(tasks);
    expect(c).toEqual({ total: 10, suspended: 2, done: 5, resolved: 7, denominator: 8 });
    expect(c.done / c.denominator).toBeCloseTo(0.625); // ni 0.5 ni 0.7
  });

  test("sin tareas devuelve ceros, no revienta", () => {
    expect(resolvedTaskCounts([])).toEqual({ total: 0, suspended: 0, done: 0, resolved: 0, denominator: 0 });
  });
});

describe("el peso es la duración de la fase, no la cantidad de tareas", () => {
  /* La razón de ser del módulo: con conteo plano estos dos proyectos daban el MISMO número,
     y no están ni cerca del mismo lugar. */
  test("una fase corta terminada no vale lo mismo que una larga terminada", () => {
    const corta = computeWeightedProgress({
      phases: [
        { status: "DONE", durationWeeks: 1, tasks: [t("DONE"), t("DONE")] },
        { status: "PENDING", durationWeeks: 8, tasks: [t("PENDING"), t("PENDING")] },
      ],
      anchorStartDate: null,
      now: AHORA,
    });
    const larga = computeWeightedProgress({
      phases: [
        { status: "PENDING", durationWeeks: 1, tasks: [t("PENDING"), t("PENDING")] },
        { status: "DONE", durationWeeks: 8, tasks: [t("DONE"), t("DONE")] },
      ],
      anchorStartDate: null,
      now: AHORA,
    });
    // Conteo plano: los dos serían 2/4 = 50%. Ponderado: 1/9 vs 8/9.
    expect(corta.pct).toBeCloseTo(1 / 9);
    expect(larga.pct).toBeCloseTo(8 / 9);
  });

  test("media fase hecha aporta medio peso", () => {
    const r = computeWeightedProgress({
      phases: [{ status: "IN_PROGRESS", durationWeeks: 4, tasks: [t("DONE"), t("PENDING")] }],
      anchorStartDate: null,
      now: AHORA,
    });
    expect(r.weightTotal).toBe(4);
    expect(r.weightDone).toBe(2);
    expect(r.pct).toBe(0.5);
  });
});

describe("fases sin tareas: 12 de los 32 cronogramas de la base", () => {
  test("se resuelven por su propio estado, no se descartan", () => {
    const r = computeWeightedProgress({
      phases: [
        { status: "DONE", durationWeeks: 3 },
        { status: "PENDING", durationWeeks: 1 },
      ],
      anchorStartDate: null,
      now: AHORA,
    });
    expect(r.pct).toBe(0.75);
    expect(r.phasesWithoutDetail).toBe(2);
  });

  /* IN_PROGRESS no dice CUÁNTO. Inventar un 50% en la pantalla de avance es exactamente lo que
     hace que nadie le crea al resto de los números. */
  test("IN_PROGRESS sin tareas no aporta un medio inventado", () => {
    const r = computeWeightedProgress({
      phases: [{ status: "IN_PROGRESS", durationWeeks: 2 }],
      anchorStartDate: null,
      now: AHORA,
    });
    expect(r.pct).toBe(0);
  });

  test("una fase con TODAS sus tareas suspendidas está terminada", () => {
    const r = computeWeightedProgress({
      phases: [{ status: "PENDING", durationWeeks: 2, tasks: [t("SUSPENDED"), t("SUSPENDED")] }],
      anchorStartDate: null,
      now: AHORA,
    });
    expect(r.pct).toBe(1); // no queda nada por hacer ahí
  });
});

describe("sin fases no hay número, y eso no es cero", () => {
  test("pct es null, no 0", () => {
    const r = computeWeightedProgress({ phases: [], anchorStartDate: null, now: AHORA });
    expect(r.pct).toBeNull();
    expect(r.expectedPct).toBeNull();
    expect(r.gapPct).toBeNull();
  });
});

describe("el calendario: qué esperaría hoy", () => {
  const phases = [
    { status: "DONE", durationWeeks: 5, tasks: [t("DONE"), t("DONE")] },
    { status: "PENDING", durationWeeks: 5, tasks: [t("PENDING"), t("PENDING")] },
  ];

  test("a 10 semanas de un plan de 10, el calendario esperaría el 100%", () => {
    const r = computeWeightedProgress({ phases, anchorStartDate: HACE_10_SEMANAS, now: AHORA });
    expect(r.expectedPct).toBeCloseTo(1, 2);
    expect(r.pct).toBe(0.5);
    // La única lectura honesta de "vamos mal": la mitad del plan, contra todo lo esperado.
    expect(r.gapPct).toBeCloseTo(-0.5, 2);
  });

  /* 17 de 32 cronogramas no tienen fecha de arranque. Rellenar con cero se leería como "el
     calendario no esperaba nada", que es lo contrario de "no sabemos". */
  test("sin fecha de arranque no se inventa un esperado", () => {
    const r = computeWeightedProgress({ phases, anchorStartDate: null, now: AHORA });
    expect(r.pct).toBe(0.5);
    expect(r.expectedPct).toBeNull();
    expect(r.gapPct).toBeNull();
    expect(r.overdueWeight).toBe(0); // sin calendario tampoco hay vencido
  });

  test("una fecha basura se trata como ausente, no revienta", () => {
    const r = computeWeightedProgress({ phases, anchorStartDate: "no es una fecha", now: AHORA });
    expect(r.expectedPct).toBeNull();
  });

  test("antes de arrancar, el calendario no espera nada", () => {
    const futuro = new Date("2026-09-01T00:00:00.000Z");
    const r = computeWeightedProgress({ phases, anchorStartDate: futuro, now: AHORA });
    expect(r.expectedPct).toBe(0);
    expect(r.overdueWeight).toBe(0);
  });
});

describe("lo vencido se mide en peso, no en filas", () => {
  /* 3 tareas vencidas de una fase de 1 semana pesan menos que 1 de una fase de 8. Contar filas
     hacía que el proyecto con muchas tareas cortas pareciera el más incendiado. */
  test("una fase larga sin hacer pesa más que una corta sin hacer", () => {
    const r = computeWeightedProgress({
      phases: [
        { status: "PENDING", durationWeeks: 1, tasks: [t("PENDING"), t("PENDING"), t("PENDING")] },
        { status: "PENDING", durationWeeks: 8, tasks: [t("PENDING")] },
      ],
      anchorStartDate: HACE_10_SEMANAS,
      now: AHORA,
    });
    expect(r.overdueWeight).toBeCloseTo(9, 1); // las dos vencidas enteras: 1 + 8
    expect(r.byPhase[1].weight).toBe(8);
  });

  test("lo que está hecho no cuenta como vencido aunque su ventana haya pasado", () => {
    const r = computeWeightedProgress({
      phases: [{ status: "DONE", durationWeeks: 4, tasks: [t("DONE")] }],
      anchorStartDate: HACE_10_SEMANAS,
      now: AHORA,
    });
    expect(r.overdueWeight).toBe(0);
  });
});

describe("byPhase permite explicar el número fase por fase", () => {
  test("trae peso, avance y calendario de cada una", () => {
    const r = computeWeightedProgress({
      phases: [
        { id: "f1", status: "DONE", durationWeeks: 2, tasks: [t("DONE")] },
        { id: "f2", status: "PENDING", durationWeeks: 3 },
      ],
      anchorStartDate: HACE_10_SEMANAS,
      now: AHORA,
    });
    expect(r.byPhase).toHaveLength(2);
    expect(r.byPhase[0]).toMatchObject({ id: "f1", weight: 2, donePct: 1, hasDetail: true });
    expect(r.byPhase[1]).toMatchObject({ id: "f2", weight: 3, donePct: 0, hasDetail: false });
  });
});
