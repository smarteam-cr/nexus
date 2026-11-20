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

describe("el estado y la barra de cada tarea del loop", () => {
  it("hecho, en curso, atrasada y en curso atrasada; pendiente a tiempo y suspendida, nada", async () => {
    const { estadoDeLaTareaDelLoop } = await import("./semanas-del-loop");
    expect(estadoDeLaTareaDelLoop("DONE", true)).toBe("hecho");
    expect(estadoDeLaTareaDelLoop("IN_PROGRESS", false)).toBe("en-curso");
    expect(estadoDeLaTareaDelLoop("IN_PROGRESS", true)).toBe("en-curso-atrasada");
    expect(estadoDeLaTareaDelLoop("PENDING", true)).toBe("atrasada");
    expect(estadoDeLaTareaDelLoop("PENDING", false)).toBeNull();
    expect(estadoDeLaTareaDelLoop("SUSPENDED", true)).toBeNull();
  });

  it("la barra va de su semana a la última; el estado, en la columna siguiente o junto al título si no hay", async () => {
    const { barraDeLaTarea } = await import("./semanas-del-loop");
    expect(barraDeLaTarea(2, { weekIndex: 1, semanas: 3 }, 12)).toEqual({ desde: 3, hasta: 5, columnaDelEstado: 6 });
    expect(barraDeLaTarea(0, { weekIndex: 4, semanas: 8 }, 12)).toEqual({ desde: 4, hasta: 11, columnaDelEstado: null });
  });
});
