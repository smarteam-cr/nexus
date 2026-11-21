/**
 * lib/timeline/semanas-de-la-lista.test.ts — las semanas vacías seguidas de una fase van en UNA línea (Elías, 20 nov).
 *
 * Correr: `npx vitest run lib/timeline/semanas-de-la-lista.test.ts --project unit`.
 *
 * Primero la regla pura (lib/timeline/semanas-de-la-lista.ts); después el Gantt del equipo pintado de verdad con
 * react-dom/server, con la forma de Campaign Activation de kölbi: 12 semanas, una tarea en la 3 y otra de dos semanas
 * en la 5. Antes salían diez renglones de «Sin tareas esta semana».
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/hooks/useHydrated", () => ({ useHydrated: () => true }));

import TimelineGantt, { type GanttPhase, type GanttTask } from "@/components/canvas/TimelineGantt";
import { rotuloDeSemanasSinTareas, semanasConTareas, tramosDeLaLista } from "./semanas-de-la-lista";

describe("la regla", () => {
  it("junta las vacías seguidas y deja sola cada semana con tareas", () => {
    const con = new Set([2, 4]);
    expect(tramosDeLaLista(12, (w) => con.has(w))).toEqual([
      { tipo: "sin-tareas", desde: 0, hasta: 1 },
      { tipo: "con-tareas", semana: 2 },
      { tipo: "sin-tareas", desde: 3, hasta: 3 },
      { tipo: "con-tareas", semana: 4 },
      { tipo: "sin-tareas", desde: 5, hasta: 11 },
    ]);
  });

  it("dos semanas con tareas seguidas no se juntan; una fase sin tareas es un solo tramo", () => {
    expect(tramosDeLaLista(3, () => true)).toEqual([
      { tipo: "con-tareas", semana: 0 },
      { tipo: "con-tareas", semana: 1 },
      { tipo: "con-tareas", semana: 2 },
    ]);
    expect(tramosDeLaLista(4, () => false)).toEqual([{ tipo: "sin-tareas", desde: 0, hasta: 3 }]);
    expect(tramosDeLaLista(0, () => false)).toEqual([]);
  });

  it("mientras se arrastra, la semana de donde sale la tarea no se junta con sus vecinas", () => {
    // La única tarea de la semana 3 (índice 2) va camino a la 8: la 3 sigue sola hasta soltar, la 8 aparece.
    const alEmpezar = [{ weekIndex: 2 }, { weekIndex: 4 }];
    const ahora = [{ weekIndex: 7 }, { weekIndex: 4 }];
    const solas = semanasConTareas(ahora, alEmpezar);
    expect([...solas].sort((a, b) => a - b)).toEqual([2, 4, 7]);
    expect(tramosDeLaLista(12, (w) => solas.has(w)).filter((t) => t.tipo === "con-tareas")).toHaveLength(3);
    // Sin arrastre, solo cuentan las de ahora.
    expect([...semanasConTareas(ahora)].sort((a, b) => a - b)).toEqual([4, 7]);
  });

  it("el rótulo cuenta las semanas desde 1", () => {
    expect(rotuloDeSemanasSinTareas(5, 11)).toBe("Semanas 6 a 12 · sin tareas");
    expect(rotuloDeSemanasSinTareas(3, 3)).toBe("Semana 4 · sin tareas");
  });
});

const tarea = (key: string, weekIndex: number, semanas: number | null = null): GanttTask => ({
  key,
  id: key,
  title: `Tarea ${key}`,
  weekIndex,
  semanas,
  status: "PENDING",
  notes: null,
  needsValidation: false,
});

const LOOP: GanttPhase = {
  key: "loop",
  id: "loop",
  name: "Campaign Activation",
  durationWeeks: 12,
  sessionCount: null,
  activityType: null,
  loopNumero: 2,
  tasks: [tarea("a", 2), tarea("b", 4, 2)],
};

function pintar(o: { editable: boolean }) {
  return renderToStaticMarkup(
    createElement(TimelineGantt, {
      anchor: "2026-11-02",
      phases: [LOOP],
      ...(o.editable ? { onUpdateTask: () => {}, onAddTask: () => {} } : { readOnly: true }),
    }),
  );
}

describe("el Gantt del equipo", () => {
  it("editable: una línea por tramo vacío, con su «+ tarea», y ningún «Sin tareas esta semana»", () => {
    const html = pintar({ editable: true });
    expect(html).not.toContain("Sin tareas esta semana");
    expect([...html.matchAll(/data-semanas-sin-tareas="([^"]+)"/g)].map((m) => m[1])).toEqual(["0-1", "3-3", "5-11"]);
    expect(html).toContain("Semanas 6 a 12 · sin tareas");
    expect(html).toContain("Semana 4 · sin tareas");
    // Varias semanas: el «+ tarea» abre el menú para elegir la semana. Una sola: agrega directo.
    expect((html.match(/aria-label="Agregar tarea: elige la semana"/g) ?? []).length).toBe(2);
    // Las semanas con tareas siguen con su cabecera de siempre.
    expect(html).toMatch(/Semana 3<span[^>]*>S2/);
    expect(html).toMatch(/Semana 5<span[^>]*>S4/);
  });

  it("solo lectura: las vacías no se muestran, como antes", () => {
    const html = pintar({ editable: false });
    expect(html).not.toContain("data-semanas-sin-tareas");
    expect(html).not.toContain("sin tareas");
    expect(html).toMatch(/Semana 3<span[^>]*>S2/);
  });
});
