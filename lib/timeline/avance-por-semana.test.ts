/**
 * lib/timeline/avance-por-semana.test.ts — cómo se pinta cada semana de una fase en la página del cliente (27 nov).
 */
import { describe, expect, it } from "vitest";
import { dondeCaeHoy, estadosDeLasSemanas, finDeLaSemana, tareaAtrasada } from "./avance-por-semana";
import { fmtDay } from "./weeks";

const NOV2 = "2026-11-02T00:00:00.000Z";
const HOY = new Date(2026, 10, 26, 12); // jueves 26 nov, hora local

describe("estadosDeLasSemanas", () => {
  it("cada semana con el estado de las tareas que CORREN en ella", () => {
    const fase = {
      durationWeeks: 6,
      tasks: [
        { weekIndex: 0, status: "DONE" },
        { weekIndex: 0, semanas: 2, status: "DONE" }, // corre la 0 y la 1
        { weekIndex: 1, status: "IN_PROGRESS" },
        { weekIndex: 4, status: "PENDING" },
      ],
    };
    // La semana 1 (9–15 nov) ya pasó: la en curso está atrasada. Sin mostrar atrasadas, es «en curso».
    expect(estadosDeLasSemanas(fase, 0, NOV2, HOY, false)).toEqual(["hecha", "en-curso", "sin-tareas", "sin-tareas", "por-hacer", "sin-tareas"]);
  });

  it("⚠ lo atrasado gana, y solo si la página muestra atrasadas", () => {
    const fase = { durationWeeks: 3, tasks: [{ weekIndex: 1, status: "IN_PROGRESS" }, { weekIndex: 1, status: "DONE" }] };
    expect(estadosDeLasSemanas(fase, 0, NOV2, HOY, true)).toEqual(["sin-tareas", "atrasada", "sin-tareas"]);
    expect(estadosDeLasSemanas(fase, 0, NOV2, HOY, false)).toEqual(["sin-tareas", "en-curso", "sin-tareas"]);
  });

  it("una tarea de varias semanas no está atrasada hasta que pasa su ÚLTIMA semana", () => {
    const fase = { durationWeeks: 6, tasks: [{ weekIndex: 2, semanas: 4, status: "IN_PROGRESS" }] };
    expect(estadosDeLasSemanas(fase, 0, NOV2, HOY, true)).toEqual(["sin-tareas", "sin-tareas", "en-curso", "en-curso", "en-curso", "en-curso"]);
  });

  it("sin el detalle confirmado (sin tareas) no inventa «por hacer»", () => {
    expect(estadosDeLasSemanas({ durationWeeks: 4 }, 0, NOV2, HOY, true)).toBeNull();
  });

  it("antes de montar (sin «hoy») nada está atrasado", () => {
    const fase = { durationWeeks: 2, tasks: [{ weekIndex: 0, status: "PENDING" }] };
    expect(estadosDeLasSemanas(fase, 0, NOV2, null, true)).toEqual(["por-hacer", "sin-tareas"]);
  });
});

describe("dondeCaeHoy", () => {
  it("el 26 nov cae dentro de la cuarta semana de doce, en su día", () => {
    const f = dondeCaeHoy(NOV2, HOY, 12)!;
    expect(f * 12).toBeGreaterThan(3);
    expect(f * 12).toBeLessThan(4);
  });

  it("fuera de la grilla, sin fecha o sin montar → null", () => {
    expect(dondeCaeHoy(NOV2, new Date(2026, 9, 1), 12)).toBeNull();
    expect(dondeCaeHoy(NOV2, new Date(2027, 5, 1), 12)).toBeNull();
    expect(dondeCaeHoy(null, HOY, 12)).toBeNull();
    expect(dondeCaeHoy(NOV2, null, 12)).toBeNull();
  });
});

it("finDeLaSemana: el último día, no el primero de la siguiente", () => {
  expect(fmtDay(finDeLaSemana(NOV2, 0))).toBe("8 nov");
  expect(fmtDay(finDeLaSemana(NOV2, 4))).toBe("6 dic");
});

describe("lo que faltaba cuidar (/revisar, 27 nov)", () => {
  it("⚠ cuenta desde donde ARRANCA la fase: una fase futura no sale atrasada", () => {
    // Fase que arranca en la semana 6 (14 dic): su semana 0 todavía no llegó el 26 nov.
    const fase = { durationWeeks: 2, tasks: [{ weekIndex: 0, status: "PENDING" }] };
    expect(estadosDeLasSemanas(fase, 6, NOV2, HOY, true)).toEqual(["por-hacer", "sin-tareas"]);
    // La misma tarea en una fase que arrancó en la semana 0 sí está atrasada.
    expect(estadosDeLasSemanas(fase, 0, NOV2, HOY, true)).toEqual(["atrasada", "sin-tareas"]);
  });

  it("una semana a medio hacer (una hecha, otra sin empezar) es «en curso»", () => {
    const fase = { durationWeeks: 1, tasks: [{ weekIndex: 0, status: "DONE" }, { weekIndex: 0, status: "PENDING" }] };
    expect(estadosDeLasSemanas(fase, 8, NOV2, HOY, true)).toEqual(["en-curso"]);
  });

  it("una foto vieja, sin el estado de las tareas, no dice nada del avance ni inventa atrasos", () => {
    const fase = { durationWeeks: 2, tasks: [{ weekIndex: 0 }, { weekIndex: 1 }] };
    expect(estadosDeLasSemanas(fase, 0, NOV2, HOY, true)).toBeNull();
    expect(tareaAtrasada({ weekIndex: 0 }, 0, NOV2, HOY)).toBe(false);
    expect(tareaAtrasada({ weekIndex: 0, status: "PENDING" }, 0, NOV2, HOY)).toBe(true);
    expect(tareaAtrasada({ weekIndex: 0, status: "DONE" }, 0, NOV2, HOY)).toBe(false);
  });

  it("la línea «Hoy» se ve el día del arranque y el último día", () => {
    expect(dondeCaeHoy(NOV2, new Date(2026, 10, 2, 9), 12)).not.toBeNull();
    expect(dondeCaeHoy(NOV2, new Date(2027, 0, 24, 18), 12)).not.toBeNull(); // 24 ene: el último día de la semana 12
    expect(dondeCaeHoy(NOV2, new Date(2027, 0, 25, 9), 12)).toBeNull();
  });
});
