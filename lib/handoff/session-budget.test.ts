/**
 * lib/handoff/session-budget.test.ts
 *
 * Correr: `npx vitest run lib/handoff/session-budget.test.ts --project unit`.
 */
import { describe, test, expect } from "vitest";
import {
  planHandoffSessionBudget,
  HANDOFF_SESSION_CHAR_TIERS,
  type HandoffSessionCandidate,
} from "./session-budget";

const day = (n: number) => new Date(`2026-06-${String(n).padStart(2, "0")}T12:00:00.000Z`).getTime();

const c = (id: string, dayOfMonth: number): HandoffSessionCandidate => ({
  id,
  title: id,
  date: day(dayOfMonth),
});

/* AHORA = el dia mas tardio que usan los fixtures, para que ninguno caiga como "futuro"
   salvo donde el test lo pide a proposito (ver "las que no ocurrieron no reciben
   presupuesto"). El borde exacto cuenta como ocurrida. */
const AHORA = day(30);

describe("planHandoffSessionBudget", () => {
  test("sin candidatas → []", () => {
    expect(planHandoffSessionBudget([], null, AHORA)).toEqual([]);
    expect(planHandoffSessionBudget([], day(15), AHORA)).toEqual([]);
  });

  test("sin closeDateMs: un solo bloque 'sin_ancla', ordenado por recencia", () => {
    const candidates = [c("a", 1), c("b", 10), c("c", 5)];
    const plan = planHandoffSessionBudget(candidates, null, AHORA);
    expect(plan.map((p) => p.id)).toEqual(["b", "c", "a"]); // 10 > 5 > 1
    expect(plan.every((p) => p.block === "sin_ancla")).toBe(true);
    expect(plan.map((p) => p.rank)).toEqual([0, 1, 2]);
  });

  test("con closeDateMs: split antes/después, el empate en la fecha del cierre cae en 'después'", () => {
    const closeDateMs = day(15);
    const candidates = [
      c("antes-lejos", 1),
      c("antes-cerca", 14),
      c("en-el-cierre", 15), // empate exacto → después
      c("despues-cerca", 16),
      c("despues-lejos", 30),
    ];
    const plan = planHandoffSessionBudget(candidates, closeDateMs, AHORA);

    const antes = plan.filter((p) => p.block === "antes_cierre");
    const despues = plan.filter((p) => p.block === "despues_cierre");

    // "antes": la más cercana al cierre primero (rank 0)
    expect(antes.map((p) => p.id)).toEqual(["antes-cerca", "antes-lejos"]);
    // "después": la más reciente primero (rank 0) — no la más cercana al cierre
    expect(despues.map((p) => p.id)).toEqual(["despues-lejos", "despues-cerca", "en-el-cierre"]);
  });

  test("el rank reinicia en 0 en cada bloque", () => {
    const closeDateMs = day(15);
    const candidates = [c("a1", 1), c("a2", 5), c("d1", 20), c("d2", 25), c("d3", 28)];
    const plan = planHandoffSessionBudget(candidates, closeDateMs, AHORA);
    const antes = plan.filter((p) => p.block === "antes_cierre");
    const despues = plan.filter((p) => p.block === "despues_cierre");
    expect(antes.map((p) => p.rank)).toEqual([0, 1]);
    expect(despues.map((p) => p.rank)).toEqual([0, 1, 2]);
  });

  test("cada ítem trae una cota maxChars decreciente por rank (los tiers configurados)", () => {
    const candidates = [c("a", 1), c("b", 2), c("c", 3)];
    const plan = planHandoffSessionBudget(candidates, null, AHORA, {
      beforeBudgetChars: 100_000,
      afterBudgetChars: 100_000,
      perSessionCharTiers: [4000, 3000, 2000],
    });
    expect(plan.map((p) => p.maxChars)).toEqual([4000, 3000, 2000]);
  });

  test("el piso del último tier se repite para ranks más allá del largo de la lista", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => c(`s${i}`, i + 1));
    const plan = planHandoffSessionBudget(candidates, null, AHORA, {
      beforeBudgetChars: 100_000,
      afterBudgetChars: 100_000,
      perSessionCharTiers: [1000, 500], // solo 2 tiers para 5 candidatas
    });
    expect(plan.map((p) => p.maxChars)).toEqual([1000, 500, 500, 500, 500]);
  });

  test("corte determinista por presupuesto: CORTA en el primero que no entra, nunca salta a uno más barato más adelante", () => {
    // tiers = [100, 10] (rank 0 caro, rank 1+ barato); budget = 15. rank 0 pide 100 → NO
    // entra (100 > 15) → con `break` el resultado es []. Si el relleno usara `continue` en vez
    // de `break` (saltear el que no entra y seguir probando), rank 1 pediría 10 (SÍ entraría,
    // 10 <= 15) — la mutación que este test caza es exactamente esa: cortar vs. saltear.
    const candidates = [c("a", 1), c("b", 2), c("c", 3)];
    const plan = planHandoffSessionBudget(candidates, null, AHORA, {
      beforeBudgetChars: 15,
      afterBudgetChars: 0,
      perSessionCharTiers: [100, 10],
    });
    expect(plan).toEqual([]);
  });

  test("presupuesto en cero → bloque vacío para ese lado", () => {
    const closeDateMs = day(15);
    const candidates = [c("antes", 1), c("despues", 20)];
    const plan = planHandoffSessionBudget(candidates, closeDateMs, AHORA, {
      beforeBudgetChars: 0,
      afterBudgetChars: 100_000,
      perSessionCharTiers: HANDOFF_SESSION_CHAR_TIERS,
    });
    expect(plan.some((p) => p.block === "antes_cierre")).toBe(false);
    expect(plan.some((p) => p.block === "despues_cierre")).toBe(true);
  });

  /* ── Las reuniones que no ocurrieron (2026-08-18) ──────────────────────────
     Los dos bloques ordenan por fecha, así que una AGENDADA quedaba primera en
     `despues_cierre` y se llevaba el tier más caro (4.000 chars) para traer nada:
     todavía no tiene transcripción. El daño no es el desperdicio — es que desplaza
     a la reunión real que sí la tenía. */
  test("una reunión que no ocurrió no recibe presupuesto, y no le roba el rank 0 a la real", () => {
    const candidates = [c("agendada", 30), c("ocurrida", 20), c("vieja", 5)];
    const plan = planHandoffSessionBudget(candidates, null, day(25));

    expect(
      plan.map((p) => p.id),
      "la agendada (día 30, con AHORA en el 25) no puede aparecer en el plan",
    ).toEqual(["ocurrida", "vieja"]);
    expect(plan[0].rank, "la más reciente OCURRIDA se queda con el rank 0 y su tier").toBe(0);
    expect(plan[0].maxChars).toBe(HANDOFF_SESSION_CHAR_TIERS[0]);
  });

  test("el corte de futuro también aplica dentro del split por fecha de cierre", () => {
    const candidates = [c("antes", 10), c("despues-real", 20), c("despues-agendada", 30)];
    const plan = planHandoffSessionBudget(candidates, day(15), day(25));
    expect(plan.filter((p) => p.block === "despues_cierre").map((p) => p.id)).toEqual(["despues-real"]);
    expect(plan.filter((p) => p.block === "antes_cierre").map((p) => p.id)).toEqual(["antes"]);
  });

  test("el borde exacto cuenta como ocurrida", () => {
    const plan = planHandoffSessionBudget([c("justo-ahora", 20)], null, day(20));
    expect(plan.map((p) => p.id)).toEqual(["justo-ahora"]);
  });
});
