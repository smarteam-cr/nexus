/**
 * lib/timeline/actual-dates.test.ts
 *
 * Tests de actualDatesPatch (pura) — la fuente ÚNICA de la semántica status→fechas
 * reales, compartida por PATCH tasks/[taskId], PATCH phases/[phaseId] y el bulk de
 * progress/apply. Modelo MONÓTONO: las fechas solo se setean/avanzan, nunca se borran.
 * Casos:
 *   1) IN_PROGRESS con actualStart null → sella actualStart = now (primera vez).
 *   2) IN_PROGRESS con actualStart existente → patch vacío (idempotente, no pisa).
 *   3) DONE con actualStart existente → solo actualEnd = now (no re-emite el inicio).
 *   4) DONE con actualStart null → sella actualStart Y actualEnd = now (mismo instante).
 *   5) PENDING → patch vacío SIEMPRE (reset/reapertura no borra hechos de ejecución).
 *   6) Round-trip DONE→PENDING→DONE: el actualStart original sobrevive intacto y el
 *      segundo DONE solo avanza actualEnd (ningún toggle pierde un hecho).
 *   7) DONE dos veces: actualEnd avanza al `now` más reciente (monótono hacia adelante).
 *   8) `now` inyectado: el patch usa exactamente la instancia pasada; sin inyectar,
 *      usa el reloj real (default new Date()).
 */
import { test, expect } from "vitest";
import { actualDatesPatch } from "./actual-dates";

const T0 = new Date("2026-07-01T10:00:00Z");
const T1 = new Date("2026-07-02T15:30:00Z");
const T2 = new Date("2026-07-03T09:45:00Z");

test("1 — IN_PROGRESS sin inicio previo: sella actualStart la primera vez", () => {
  const patch = actualDatesPatch("IN_PROGRESS", { actualStart: null }, T0);
  expect(patch).toEqual({ actualStart: T0 });
  expect(patch.actualEnd).toBeUndefined(); // no toca el fin
});

test("2 — IN_PROGRESS con inicio ya sellado: patch vacío (no pisa el primer inicio)", () => {
  const patch = actualDatesPatch("IN_PROGRESS", { actualStart: T0 }, T1);
  expect(patch).toEqual({});
});

test("3 — DONE con inicio previo: sella solo actualEnd al momento actual", () => {
  const patch = actualDatesPatch("DONE", { actualStart: T0 }, T1);
  expect(patch).toEqual({ actualEnd: T1 });
  expect(patch.actualStart).toBeUndefined(); // el inicio existente no se re-emite ni se pisa
});

test("4 — DONE sin inicio previo: sella actualStart y actualEnd juntos", () => {
  const patch = actualDatesPatch("DONE", { actualStart: null }, T1);
  expect(patch).toEqual({ actualStart: T1, actualEnd: T1 });
});

test("5 — PENDING nunca borra: patch vacío tanto con fechas selladas como sin ellas", () => {
  // Reapertura de una tarea que ya corrió: no emite null ni undefined explícito.
  expect(actualDatesPatch("PENDING", { actualStart: T0 }, T1)).toEqual({});
  // Tarea virgen que sigue pendiente: tampoco emite nada.
  expect(actualDatesPatch("PENDING", { actualStart: null }, T1)).toEqual({});
});

test("6 — round-trip DONE→PENDING→DONE: el primer actualStart sobrevive intacto", () => {
  // Simula el estado persistido aplicando cada patch sobre el registro.
  let row: { actualStart: Date | null; actualEnd: Date | null } = { actualStart: null, actualEnd: null };
  const apply = (patch: { actualStart?: Date; actualEnd?: Date }) => {
    if (patch.actualStart !== undefined) row = { ...row, actualStart: patch.actualStart };
    if (patch.actualEnd !== undefined) row = { ...row, actualEnd: patch.actualEnd };
  };

  apply(actualDatesPatch("DONE", row, T0)); // primer cierre: sella inicio+fin en T0
  expect(row).toEqual({ actualStart: T0, actualEnd: T0 });

  apply(actualDatesPatch("PENDING", row, T1)); // reapertura: no borra nada
  expect(row).toEqual({ actualStart: T0, actualEnd: T0 });

  apply(actualDatesPatch("DONE", row, T2)); // re-cierre: avanza el fin, el inicio original queda
  expect(row.actualStart).toBe(T0); // el primer timestamp NO se pisa
  expect(row.actualEnd).toBe(T2);
});

test("7 — DONE dos veces: actualEnd avanza al cierre más reciente", () => {
  const primero = actualDatesPatch("DONE", { actualStart: T0 }, T1);
  const segundo = actualDatesPatch("DONE", { actualStart: T0 }, T2);
  expect(primero).toEqual({ actualEnd: T1 });
  expect(segundo).toEqual({ actualEnd: T2 }); // siempre re-sella al now actual (el más reciente)
});

test("8 — now inyectado se usa tal cual; sin inyectar usa el reloj real", () => {
  const inyectado = actualDatesPatch("IN_PROGRESS", { actualStart: null }, T2);
  expect(inyectado.actualStart).toBe(T2); // misma instancia, no una copia

  const antes = Date.now();
  const porDefecto = actualDatesPatch("DONE", { actualStart: null });
  const despues = Date.now();
  expect(porDefecto.actualStart).toBeInstanceOf(Date);
  expect(porDefecto.actualEnd).toBe(porDefecto.actualStart); // default: un solo new Date() para ambos
  expect(porDefecto.actualEnd!.getTime()).toBeGreaterThanOrEqual(antes);
  expect(porDefecto.actualEnd!.getTime()).toBeLessThanOrEqual(despues);
});
