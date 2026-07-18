/**
 * lib/timeline/client-status.test.ts
 *
 * La vista del cliente antes solo hablaba cuando algo estaba mal. Estos tests fijan que ahora
 * SIEMPRE diga algo honesto — y sobre todo que NUNCA anuncie "finalizado" con tareas pendientes.
 */
import { test, expect } from "vitest";
import { clientStatusLine } from "./client-status";

test("en curso y al día", () => {
  expect(clientStatusLine({ curWeek: 5, totalWeeks: 14, tasksDone: 12, tasksTotal: 30, delayWeeks: 0 }))
    .toBe("Semana 6 de 14 · 12 de 30 tareas completadas · al día");
});

test("en curso con desvío: lo dice sin culpar a nadie", () => {
  const linea = clientStatusLine({ curWeek: 5, totalWeeks: 14, tasksDone: 12, tasksTotal: 30, delayWeeks: 2 });
  expect(linea).toBe("Semana 6 de 14 · 12 de 30 tareas completadas · 2 semanas más de lo previsto");
  expect(linea).not.toContain("cliente");
});

test("singular de semana", () => {
  expect(clientStatusLine({ curWeek: 0, totalWeeks: 3, tasksDone: 0, tasksTotal: 4, delayWeeks: 1 }))
    .toBe("Semana 1 de 3 · 0 de 4 tareas completadas · 1 semana más de lo previsto");
});

test("todo hecho → completado", () => {
  expect(clientStatusLine({ curWeek: 14, totalWeeks: 14, tasksDone: 30, tasksTotal: 30, delayWeeks: 0 }))
    .toBe("Proyecto completado · 30 de 30 tareas");
});

// El defecto que arreglamos: antes decía "cronograma finalizado" solo porque pasó la fecha.
test("ventana vencida con pendientes → NUNCA dice finalizado", () => {
  const linea = clientStatusLine({ curWeek: 20, totalWeeks: 14, tasksDone: 25, tasksTotal: 30, delayWeeks: 3 });
  expect(linea).toBe("En cierre · quedan 5 tareas");
  expect(linea).not.toContain("finalizado");
  expect(linea).not.toContain("completado");
});

test("antes de arrancar → null (de eso ya avisa la cabecera)", () => {
  expect(clientStatusLine({ curWeek: -2, totalWeeks: 14, tasksDone: 0, tasksTotal: 30, delayWeeks: 0 })).toBeNull();
  expect(clientStatusLine({ curWeek: null, totalWeeks: 14, tasksDone: 0, tasksTotal: 30, delayWeeks: 0 })).toBeNull();
});

test("sin cronograma → null", () => {
  expect(clientStatusLine({ curWeek: 0, totalWeeks: 0, tasksDone: 0, tasksTotal: 0, delayWeeks: 0 })).toBeNull();
});

test("cronograma sin tareas detalladas: no inventa el conteo", () => {
  expect(clientStatusLine({ curWeek: 2, totalWeeks: 10, tasksDone: 0, tasksTotal: 0, delayWeeks: 0 }))
    .toBe("Semana 3 de 10 · al día");
});
