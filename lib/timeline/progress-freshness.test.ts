/**
 * lib/timeline/progress-freshness.test.ts
 *
 * El caso que originó el módulo: seis proyectos de la base tienen decenas de tareas y CERO
 * marcadas (0/42, 0/61, 0/85…). Ninguno está sin empezar. Un 0% que no se explica hace que la
 * bandeja entera pierda credibilidad.
 */
import { describe, test, expect } from "vitest";
import { deriveMarking, STALE_MARKING_DAYS } from "./progress-freshness";

const AHORA = new Date("2026-07-26T00:00:00.000Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 24 * 60 * 60 * 1000);

const base = {
  tasksTotal: 40,
  tasksResolved: 10,
  overdueUnresolved: 0,
  lastProgressAt: null as Date | null,
  progressReviewedAt: null as Date | null,
  now: AHORA,
};

test("sin tareas es SIN_DETALLE, que no es lo mismo que 0% de avance", () => {
  expect(deriveMarking({ ...base, tasksTotal: 0, tasksResolved: 0 }).state).toBe("SIN_DETALLE");
});

/* El caso de Clínica Oceánica (0/42), Metzger (0/61), Iberorutas (0/85)… */
test("con tareas, ninguna resuelta y ya vencidas: SIN_MARCAR", () => {
  const r = deriveMarking({ ...base, tasksResolved: 0, overdueUnresolved: 12 });
  expect(r.state).toBe("SIN_MARCAR");
});

test("ninguna resuelta pero tampoco vencidas: el proyecto simplemente no arrancó", () => {
  expect(deriveMarking({ ...base, tasksResolved: 0, overdueUnresolved: 0 }).state).toBe("AL_DIA");
});

/* Sin vencidas no se molesta a nadie: pedir revisión periódica de un cronograma que va al día
   convierte la bandeja en ruido de fondo, y entonces deja de leerse. */
test("sin vencidas está al día por más viejo que sea", () => {
  const r = deriveMarking({ ...base, overdueUnresolved: 0, lastProgressAt: haceDias(400) });
  expect(r.state).toBe("AL_DIA");
  expect(r.daysSinceReview).toBe(400);
});

describe("con vencidas, manda hace cuánto que alguien miró", () => {
  test("recién mirado sigue al día", () => {
    expect(deriveMarking({ ...base, overdueUnresolved: 3, lastProgressAt: haceDias(2) }).state).toBe("AL_DIA");
  });

  test(`pasado el umbral (${STALE_MARKING_DAYS} días) queda DESACTUALIZADO`, () => {
    expect(
      deriveMarking({ ...base, overdueUnresolved: 3, lastProgressAt: haceDias(STALE_MARKING_DAYS) }).state,
    ).toBe("DESACTUALIZADO");
  });

  test("si nadie lo miró nunca, también", () => {
    expect(deriveMarking({ ...base, overdueUnresolved: 3 }).state).toBe("DESACTUALIZADO");
  });
});

/**
 * LA RAZÓN DE SER DE LA SEGUNDA FECHA. Un CSE que revisa un proyecto y concluye "está bien
 * así" no genera ningún cambio de avance. Sin `progressReviewedAt`, ese proyecto se lee viejo
 * para siempre y la bandeja le vuelve a pedir lo mismo mañana.
 */
describe("mirar y no cambiar nada TAMBIÉN es un dato", () => {
  test("una revisión reciente rescata un proyecto sin cambios hace meses", () => {
    const r = deriveMarking({
      ...base,
      overdueUnresolved: 5,
      lastProgressAt: haceDias(90),
      progressReviewedAt: haceDias(1),
    });
    expect(r.state).toBe("AL_DIA");
    expect(r.daysSinceReview).toBe(1); // manda la señal más reciente, venga de donde venga
  });

  test("pero no rescata a uno que nunca se marcó: ahí falta trabajo, no una mirada", () => {
    const r = deriveMarking({
      ...base,
      tasksResolved: 0,
      overdueUnresolved: 5,
      progressReviewedAt: haceDias(1),
    });
    expect(r.state).toBe("SIN_MARCAR");
  });

  test("sin ninguna de las dos fechas, no se inventa una antigüedad", () => {
    expect(deriveMarking(base).daysSinceReview).toBeNull();
  });
});

test("una fecha basura no revienta ni cuenta como mirada", () => {
  const r = deriveMarking({ ...base, overdueUnresolved: 2, lastProgressAt: "cualquier cosa" as unknown as Date });
  expect(r.daysSinceReview).toBeNull();
  expect(r.state).toBe("DESACTUALIZADO");
});
