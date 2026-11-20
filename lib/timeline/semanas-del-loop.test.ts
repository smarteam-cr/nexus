import { describe, expect, it } from "vitest";
import { colorDeLaSemana, pintaPorTareas, tareasDeLaSemana } from "./semanas-del-loop";

describe("la fila de un loop (la MISMA regla para el equipo y el cliente)", () => {
  const tareas = [
    { title: "Inventario", weekIndex: 1, status: "DONE" },
    { title: "Diseño", weekIndex: 1, semanas: 3, status: "IN_PROGRESS" },
    { title: "Hecha sola", weekIndex: 5, status: "DONE" },
    { title: "Suspendida", weekIndex: 7, status: "SUSPENDED" },
  ];

  it("una tarea de varias semanas pinta todas; mezcla de hecho y pendiente es azul; sola hecha es verde", () => {
    expect([0, 1, 2, 3, 4, 5].map((w) => colorDeLaSemana(tareas, w))).toEqual(["vacia", "en-curso", "en-curso", "en-curso", "vacia", "hecho"]);
    expect(tareasDeLaSemana(tareas, 2).map((t) => t.title)).toEqual(["Diseño"]);
  });

  it("una tarea suspendida no pinta nada", () => {
    expect(colorDeLaSemana(tareas, 7)).toBe("vacia");
  });

  it("se pinta por tareas solo un loop con alguna que corre; si no, la barra de siempre", () => {
    expect(pintaPorTareas(2, tareas)).toBe(true);
    expect(pintaPorTareas(2, [])).toBe(false);
    expect(pintaPorTareas(2, [{ weekIndex: 0, status: "SUSPENDED" }])).toBe(false);
    expect(pintaPorTareas(null, tareas)).toBe(false);
  });
});
