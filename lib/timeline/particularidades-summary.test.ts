/**
 * lib/timeline/particularidades-summary.test.ts
 *
 * Tests del resumen con atribución de particularidades. Casos: suma por party, weeksImpact
 * null/negativo = 0, party desconocido cuenta en count pero no en byParty, frase de atribución.
 */
import { test, expect } from "vitest";
import { summarizeParticularidades, attributionSentence, type ParticularidadLike } from "./particularidades-summary";

const p = (party: string, weeksImpact: number | null = null): ParticularidadLike => ({ party, weeksImpact });

test("suma weeksImpact por party", () => {
  const s = summarizeParticularidades([p("CLIENTE", 2), p("SMARTEAM", 1), p("CLIENTE", 1)]);
  expect(s.count).toBe(3);
  expect(s.totalWeeks).toBe(4);
  expect(s.byParty.CLIENTE).toBe(3);
  expect(s.byParty.SMARTEAM).toBe(1);
  expect(s.byParty.AMBOS).toBe(0);
  expect(s.byParty.DEV).toBe(0);
});

test("weeksImpact null o negativo cuenta como 0 (pero la particularidad cuenta en count)", () => {
  const s = summarizeParticularidades([p("CLIENTE", null), p("SMARTEAM", -3), p("CLIENTE", 2)]);
  expect(s.count).toBe(3);
  expect(s.totalWeeks).toBe(2);
  expect(s.byParty.CLIENTE).toBe(2);
  expect(s.byParty.SMARTEAM).toBe(0);
});

test("party desconocido cuenta en count pero no en byParty", () => {
  const s = summarizeParticularidades([p("MARCIANO", 5), p("CLIENTE", 1)]);
  expect(s.count).toBe(2);
  expect(s.totalWeeks).toBe(6); // el weeksImpact suma al total aunque el party no mapee
  expect(s.byParty.CLIENTE).toBe(1);
});

test("lista vacía → todo en 0", () => {
  const s = summarizeParticularidades([]);
  expect(s).toEqual({ count: 0, totalWeeks: 0, byParty: { CLIENTE: 0, SMARTEAM: 0, AMBOS: 0, DEV: 0 } });
});

test("attributionSentence: frase con cliente + Smarteam", () => {
  const s = summarizeParticularidades([p("CLIENTE", 2), p("SMARTEAM", 1)]);
  expect(attributionSentence(s)).toBe("3 semanas de corrimiento acumulado. 2 semanas atribuidas al cliente, 1 a Smarteam.");
});

test("attributionSentence: singular", () => {
  const s = summarizeParticularidades([p("CLIENTE", 1)]);
  expect(attributionSentence(s)).toBe("1 semana de corrimiento acumulado. 1 semana atribuida al cliente.");
});

test("attributionSentence: sin corrimiento (totalWeeks 0) → null", () => {
  const s = summarizeParticularidades([p("CLIENTE", null), p("SMARTEAM", null)]);
  expect(attributionSentence(s)).toBeNull();
});
