/**
 * lib/sessions/kickoff-pick.test.ts
 *
 * `pickKickoffSessionDate` — selección pura de la fecha de kickoff. El invariante
 * que protege: el ancla del cronograma nace del Kick Off DE ESTE proyecto, no del
 * de un proyecto viejo del mismo cliente. Caso real que motivó el fix (RC
 * Inmobiliaria): sesiones "kickoff" del 3-jun (proyecto anterior) y 10-jul (el
 * real), proyecto creado el 8-jul → la heurística vieja (más antigua) elegía
 * 3-jun y el cronograma nacía con ~38 días de "atraso" falso.
 *
 * Correr: `npx vitest run lib/sessions/kickoff-pick.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { pickKickoffSessionDate } from "./kickoff-pick";

const d = (s: string) => new Date(s);

test("caso RC — con kickoffs viejo y nuevo, gana el posterior a la creación del proyecto", () => {
  const picked = pickKickoffSessionDate([d("2026-06-03"), d("2026-07-10")], d("2026-07-08"));
  expect(picked).toEqual(d("2026-07-10"));
});

test("kickoff hasta 3 días ANTES de la creación cuenta como posterior (agendado pre-Service)", () => {
  const picked = pickKickoffSessionDate([d("2026-06-03"), d("2026-07-06")], d("2026-07-08"));
  expect(picked).toEqual(d("2026-07-06"));
});

test("varios posteriores — gana el más CERCANO a la creación, no el último", () => {
  const picked = pickKickoffSessionDate([d("2026-07-10"), d("2026-08-20")], d("2026-07-08"));
  expect(picked).toEqual(d("2026-07-10"));
});

test("sin posteriores — cae al más cercano de los anteriores (no null)", () => {
  const picked = pickKickoffSessionDate([d("2026-01-15"), d("2026-06-03")], d("2026-07-08"));
  expect(picked).toEqual(d("2026-06-03"));
});

test("un único kickoff (aunque viejo) se usa igual", () => {
  const picked = pickKickoffSessionDate([d("2026-06-03")], d("2026-07-08"));
  expect(picked).toEqual(d("2026-06-03"));
});

test("sin candidatas → null", () => {
  expect(pickKickoffSessionDate([], d("2026-07-08"))).toBeNull();
});
