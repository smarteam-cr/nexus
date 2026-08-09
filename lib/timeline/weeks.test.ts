/**
 * lib/timeline/weeks.test.ts
 *
 * Tests del predicado UNIFICADO de atraso (overduePlannedEnd + isOverdueByDate) — la única
 * fuente de "¿esta tarea está atrasada?" que comparten el Gantt interno, la vista externa,
 * client-blockers y el panel de cartera (summary.ts). Criterio: por FECHA (fin planeado de
 * la semana < hoy) y ORTOGONAL al estado, excluyendo DONE/SUSPENDED (resueltas).
 *
 * ── Y LA ARITMÉTICA DEL CALENDARIO (Tanda J, 2026-08-08) ────────────────────
 * `computePhaseRanges` / `timelineSpan` / `totalWeeks` no tenían NI UN test, y de ellas
 * cuelgan el ancho del Gantt, las fechas planeadas del baseline, el % de avance esperado y
 * —desde esta tanda— el cierre proyectado. Alguien podía "simplificar" el `startWeek` de
 * `computePhaseRanges` y la suite entera quedaba verde mientras cuatro superficies se movían.
 */
import { describe, it, test, expect } from "vitest";
import {
  overduePlannedEnd,
  isOverdueByDate,
  addWeeks,
  computePhaseRanges,
  timelineSpan,
  totalWeeks,
  projectedEnd,
  endShiftDays,
  endShiftFragment,
  describeEndShift,
  fmtFull,
  type PhaseSpanLike,
} from "./weeks";

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

/**
 * ── LA ARITMÉTICA DEL CALENDARIO ────────────────────────────────────────────
 * `timelineSpan` (ancho de CALENDARIO, max(end)) y `totalWeeks` (ESFUERZO, suma de
 * duraciones) son DISTINTAS y lo son a propósito: con fases en paralelo el proyecto ocupa
 * menos calendario que la suma de sus duraciones. El repo usa las dos, para preguntas
 * distintas —`portfolio/summary.ts` mide alcance con esfuerzo; el Gantt, el baseline y el
 * cierre proyectado miden calendario con span— y confundirlas mueve fechas en silencio.
 */
describe("computePhaseRanges / timelineSpan / totalWeeks", () => {
  it("fases CONTIGUAS: cada una arranca donde terminó la anterior, y span == esfuerzo", () => {
    const fases = [{ durationWeeks: 2 }, { durationWeeks: 3 }];
    expect(computePhaseRanges(fases)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 5 },
    ]);
    expect(timelineSpan(fases)).toBe(5);
    expect(totalWeeks(fases)).toBe(5); // sin paralelo, las dos medidas coinciden
  });

  it("fases EN PARALELO: `startWeek` explícito solapa — y ahí span ≠ esfuerzo", () => {
    /* ⚠ LA fila de esta tabla. Dos equipos trabajando a la vez: el proyecto dura 3 semanas de
       calendario, aunque el esfuerzo sume 5. Un cierre calculado con `totalWeeks` prometería
       dos semanas de más — y sería una fecha que el cliente nunca ve, porque su cronograma
       (TimelineSection) dibuja con `timelineSpan`. */
    const fases = [{ durationWeeks: 2 }, { durationWeeks: 3, startWeek: 0 }];
    expect(computePhaseRanges(fases)).toEqual([
      { start: 0, end: 2 },
      { start: 0, end: 3 },
    ]);
    expect(timelineSpan(fases)).toBe(3);
    expect(totalWeeks(fases)).toBe(5);
    expect(timelineSpan(fases)).not.toBe(totalWeeks(fases));
  });

  it("la fase contigua que sigue a una explícita arranca al fin de ESA, no del acumulado", () => {
    const fases = [{ durationWeeks: 2 }, { durationWeeks: 3, startWeek: 0 }, { durationWeeks: 1 }];
    expect(computePhaseRanges(fases)).toEqual([
      { start: 0, end: 2 },
      { start: 0, end: 3 },
      { start: 3, end: 4 }, // el cursor quedó en 3 (fin de la paralela), no en 5
    ]);
    expect(timelineSpan(fases)).toBe(4);
  });

  it("duración 0 o ausente cuenta como 1 semana (una fase siempre ocupa lugar)", () => {
    expect(computePhaseRanges([{ durationWeeks: 0 }, { durationWeeks: 2 }])).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
  });

  it("sin fases: span 0 y esfuerzo 0 (no hay calendario que dibujar)", () => {
    expect(computePhaseRanges([])).toEqual([]);
    expect(timelineSpan([])).toBe(0);
    expect(totalWeeks([])).toBe(0);
  });
});

/**
 * ── EL CIERRE PROYECTADO ────────────────────────────────────────────────────
 * La fórmula única del fin. Lo que congela esta tabla: que use SPAN y no esfuerzo, que
 * degrade a null en vez de inventar una fecha, y que imprima en UTC.
 */
describe("projectedEnd", () => {
  const CONTIGUAS = [{ durationWeeks: 2 }, { durationWeeks: 3 }]; // span 5, esfuerzo 5
  const PARALELAS = [{ durationWeeks: 2 }, { durationWeeks: 3, startWeek: 0 }]; // span 3, esfuerzo 5

  it("ancla + span en semanas, formateado en UTC", () => {
    const r = projectedEnd(ANCHOR, CONTIGUAS);
    expect(r.spanWeeks).toBe(5);
    expect(r.date?.toISOString()).toBe(addWeeks(ANCHOR, 5).toISOString());
    expect(r.label).toBe("6 jul 2026"); // 1 jun + 5 semanas, día de calendario UTC
  });

  it("⚠ usa SPAN, no esfuerzo: con fases en paralelo el cierre NO se aleja", () => {
    /* La edición que pone esto en rojo: cambiar `timelineSpan` por `totalWeeks` adentro de
       projectedEnd. Daría 6 jul en vez de 22 jun — dos semanas de promesa de más, y una fecha
       distinta de la que el cronograma del cliente ya dibuja. */
    const r = projectedEnd(ANCHOR, PARALELAS);
    expect(r.spanWeeks).toBe(3);
    expect(r.date?.toISOString()).toBe(addWeeks(ANCHOR, 3).toISOString());
    expect(r.label).toBe("22 jun 2026");
    expect(r.label).not.toBe(projectedEnd(ANCHOR, CONTIGUAS).label);
  });

  it("sin ancla: span sí, fecha NO (nunca una fecha de respaldo)", () => {
    expect(projectedEnd(null, CONTIGUAS)).toEqual({ spanWeeks: 5, date: null, label: null });
    expect(projectedEnd(undefined, CONTIGUAS).label).toBeNull();
  });

  it("sin fases: tampoco hay fecha (anchor+0 se leería como «ya terminó»)", () => {
    expect(projectedEnd(ANCHOR, [])).toEqual({ spanWeeks: 0, date: null, label: null });
  });
});

describe("endShiftDays / endShiftFragment / describeEndShift", () => {
  const antes = projectedEnd(ANCHOR, [{ durationWeeks: 10 }]); // 10 ago 2026
  const despues = projectedEnd(ANCHOR, [{ durationWeeks: 13 }]); // 31 ago 2026
  const sinFecha = projectedEnd(null, [{ durationWeeks: 10 }]);

  it("los días de corrimiento, con signo", () => {
    expect(endShiftDays(antes, despues)).toBe(21);
    expect(endShiftDays(despues, antes)).toBe(-21);
    expect(endShiftDays(antes, antes)).toBe(0);
  });

  it("falta una punta → null (sin fecha no hay corrimiento que afirmar)", () => {
    expect(endShiftDays(sinFecha, despues)).toBeNull();
    expect(endShiftDays(antes, sinFecha)).toBeNull();
  });

  it("el fragmento NO lleva fecha absoluta: precarga un motivo que puede viajar al cliente", () => {
    expect(endShiftFragment(antes, despues)).toBe("se corrió la fecha de cierre 21 días");
    expect(endShiftFragment(despues, antes)).toBe("se adelantó la fecha de cierre 21 días");
    expect(endShiftFragment(antes, antes)).toBeNull(); // sin movimiento, sin fragmento
    expect(endShiftFragment(sinFecha, despues)).toBe("ahora hay fecha de cierre");
    expect(endShiftFragment(antes, sinFecha)).toBe("el cronograma se quedó sin fecha de cierre");
    for (const f of [endShiftFragment(antes, despues), endShiftFragment(despues, antes)]) {
      expect(f, "el fragmento filtró una fecha absoluta").not.toMatch(/\d{4}/);
    }
  });

  it("la frase interna SÍ lleva las dos fechas, y nunca imprime un negativo", () => {
    expect(describeEndShift(antes, despues)).toBe("El cierre se corre 21 días: 10 ago 2026 → 31 ago 2026.");
    expect(describeEndShift(despues, antes)).toBe("El cierre se adelanta 21 días: 31 ago 2026 → 10 ago 2026.");
    expect(describeEndShift(antes, despues)).not.toContain("-21");
    expect(describeEndShift(antes, antes)).toBe("La fecha de cierre no se mueve: sigue siendo el 10 ago 2026.");
    expect(describeEndShift(sinFecha, despues)).toBe("Ahora hay fecha de cierre: 31 ago 2026.");
    expect(describeEndShift(antes, sinFecha)).toBe(
      "El cronograma se quedó sin fecha de cierre (se borró el arranque).",
    );
  });

  it("⚠ cuenta DÍAS DE CALENDARIO, no diferencia de instantes", () => {
    /* El ancla no siempre es medianoche: cuando el cronograma nace del handoff se deriva de la
       FECHA DE LA SESIÓN de kickoff, que trae la hora real de la reunión. Contra un ancla puesta
       después con el calendario (00:00Z), restar instantes daba 13 donde las fechas mostradas se
       movían 14 — la MISMA frase se contradecía. La edición que la pone en rojo: volver a
       `(after - before) / 86_400_000` sobre los instantes crudos. */
    const desdeReunion = projectedEnd("2026-06-01T15:00:00.000Z", [{ durationWeeks: 5 }]);
    const desdeCalendario = projectedEnd("2026-06-15T00:00:00.000Z", [{ durationWeeks: 5 }]);
    expect(desdeReunion.label).toBe("6 jul 2026");
    expect(desdeCalendario.label).toBe("20 jul 2026");
    // 6 jul → 20 jul son 14 días de calendario, y eso es lo que la frase tiene que decir.
    expect(endShiftDays(desdeReunion, desdeCalendario)).toBe(14);
    expect(describeEndShift(desdeReunion, desdeCalendario)).toBe(
      "El cierre se corre 14 días: 6 jul 2026 → 20 jul 2026.",
    );
  });

  it("un solo día se dice en singular", () => {
    const unDia = { spanWeeks: 1, date: new Date("2026-06-09T00:00:00.000Z"), label: "9 jun 2026" };
    const cero = { spanWeeks: 1, date: new Date("2026-06-08T00:00:00.000Z"), label: "8 jun 2026" };
    expect(endShiftFragment(cero, unDia)).toBe("se corrió la fecha de cierre 1 día");
  });
});

/**
 * ── EQUIVALENCIA CON LO QUE EL CLIENTE YA VE ────────────────────────────────
 * `TimelineSection` (la vista del cliente) calculaba el cierre inline con
 * `fmtFull(addWeeks(anchor, timelineSpan(sorted)))`. Al migrarla a `projectedEnd` el
 * resultado tiene que ser IDÉNTICO: si alguna vez divergen, el equipo y el cliente estarían
 * mirando dos fechas distintas del mismo proyecto — que es justo lo que el encabezado de
 * weeks.ts existe para impedir. La edición que pone esto en rojo: cualquier cambio de fórmula
 * o de formato adentro de `projectedEnd`.
 */
test("projectedEnd().label === la fórmula inline que tenía la vista del cliente", () => {
  const FORMAS: PhaseSpanLike[][] = [
    [{ durationWeeks: 2 }, { durationWeeks: 3 }],
    [{ durationWeeks: 2 }, { durationWeeks: 3, startWeek: 0 }],
    [{ durationWeeks: 1 }],
    [{ durationWeeks: 4 }, { durationWeeks: 4, startWeek: 2 }, { durationWeeks: 1 }],
    [{ durationWeeks: 52 }],
  ];
  for (const fases of FORMAS) {
    const viejo = fmtFull(addWeeks(ANCHOR, timelineSpan(fases)).toISOString());
    expect(projectedEnd(ANCHOR, fases).label).toBe(viejo);
  }
});
