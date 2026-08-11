import { describe, it, expect } from "vitest";
import { rescatarProgreso, type FaseRealParaRescate } from "./rescate-progreso";
import type { PhaseInput } from "./validate";

const tarea = (
  id: string,
  title: string,
  extra: Partial<FaseRealParaRescate["tasks"][number]> = {},
) => ({
  id,
  title,
  weekIndex: 0,
  order: 0,
  notes: null,
  status: "PENDING",
  source: "AGENT" as string | null,
  ...extra,
});

const fase = (
  id: string,
  name: string,
  order: number,
  tasks: FaseRealParaRescate["tasks"],
  extra: Partial<FaseRealParaRescate> = {},
): FaseRealParaRescate => ({
  id,
  name,
  order,
  durationWeeks: 2,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tasks,
  ...extra,
});

const prop = (id: string | undefined, name: string, order: number, tasks: PhaseInput["tasks"]): PhaseInput => ({
  id,
  name,
  order,
  durationWeeks: 2,
  tasks,
});

describe("rescatarProgreso", () => {
  it("repone la tarea DONE que la propuesta omitió, con su id", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "Configurar pipeline", { status: "DONE" })])];
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Setup", 0, [{ title: "Otra cosa", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases[0].tasks).toHaveLength(2);
    expect(phases[0].tasks!.find((t) => t.id === "t1")?.title).toBe("Configurar pipeline");
    expect(warnings[0]).toContain("Setup");
  });

  it("NO repone una tarea PENDING del agente (esa sí se puede reemplazar)", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "Configurar pipeline")])];
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Setup", 0, [{ title: "Otra cosa", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases[0].tasks).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("una PENDING cargada a mano (HUMAN) SÍ se repone", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "La puso el CSE", { source: "HUMAN" })])];
    const { phases } = rescatarProgreso(reales, [prop("f1", "Setup", 0, [])]);
    expect(phases[0].tasks).toHaveLength(1);
  });

  /* ── LA TRAMPA 1: mover no es borrar ─────────────────────────────────────── */
  it("una tarea con progreso MOVIDA a otra fase no se duplica", () => {
    const reales = [
      fase("f1", "Origen", 0, [tarea("t1", "Construir dashboards", { status: "DONE" })]),
      fase("f2", "Destino", 1, []),
    ];
    // El saneador de la ruta ya le quitó el id al moverla de fase.
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Origen", 0, []),
      prop("f2", "Destino", 1, [{ title: "Construir dashboards", weekIndex: 0, order: 0 }]),
    ]);
    const titulos = phases.flatMap((p) => (p.tasks ?? []).map((t) => t.title));
    expect(titulos.filter((t) => t === "Construir dashboards")).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("la huella ignora tildes y mayúsculas al detectar la movida", () => {
    const reales = [
      fase("f1", "Origen", 0, [tarea("t1", "Migración de datos", { status: "IN_PROGRESS" })]),
      fase("f2", "Destino", 1, []),
    ];
    const { phases } = rescatarProgreso(reales, [
      prop("f1", "Origen", 0, []),
      prop("f2", "Destino", 1, [{ title: "MIGRACION DE DATOS", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases.flatMap((p) => p.tasks ?? [])).toHaveLength(1);
  });

  /* ── LA TRAMPA 2: solo las propuestas SIN id tapan el rescate ─────────────── */
  it("dos tareas homónimas en fases distintas no se tapan: la que tiene progreso se conserva", () => {
    const reales = [
      fase("f1", "Fase A", 0, [tarea("t1", "Capacitación", { status: "DONE" })]),
      fase("f2", "Fase B", 1, [tarea("t2", "Capacitación")]),
    ];
    // La propuesta conserva la de Fase B (con su id) y se olvida de la de Fase A.
    const { phases } = rescatarProgreso(reales, [
      prop("f1", "Fase A", 0, []),
      prop("f2", "Fase B", 1, [{ id: "t2", title: "Capacitación", weekIndex: 0, order: 0 }]),
    ]);
    expect(phases[0].tasks!.map((t) => t.id)).toEqual(["t1"]);
    expect(phases[1].tasks!.map((t) => t.id)).toEqual(["t2"]);
  });

  /* ── LA TRAMPA 3: la semana tiene que caber ──────────────────────────────── */
  it("recorta el weekIndex a la fase acortada (si no, el PUT devuelve 400)", () => {
    const reales = [
      fase("f1", "Setup", 0, [tarea("t1", "Tarea vieja", { status: "DONE", weekIndex: 3 })], {
        durationWeeks: 4,
      }),
    ];
    const { phases } = rescatarProgreso(reales, [
      { id: "f1", name: "Setup", order: 0, durationWeeks: 1, tasks: [] },
    ]);
    expect(phases[0].tasks![0].weekIndex).toBe(0);
  });

  it("una fase de duración 0 no produce un weekIndex negativo", () => {
    const reales = [
      fase("f1", "Setup", 0, [tarea("t1", "Tarea", { status: "DONE", weekIndex: 2 })]),
    ];
    const { phases } = rescatarProgreso(reales, [
      { id: "f1", name: "Setup", order: 0, durationWeeks: 0, tasks: [] },
    ]);
    expect(phases[0].tasks![0].weekIndex).toBe(0);
  });

  /* ── La fase borrada entera vuelve EN SU LUGAR ───────────────────────────── */
  it("una fase del medio con progreso vuelve al medio, no al final", () => {
    const reales = [
      fase("f1", "Primera", 0, []),
      fase("f2", "Del medio", 1, [tarea("t1", "Hecho", { status: "DONE" })]),
      fase("f3", "Última", 2, []),
    ];
    const { phases, warnings } = rescatarProgreso(reales, [
      prop("f1", "Primera", 0, []),
      prop("f3", "Última", 1, []),
    ]);
    expect(phases.map((p) => p.name)).toEqual(["Primera", "Del medio", "Última"]);
    expect(phases.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(warnings[0]).toContain("se conserva en vez de borrarse");
  });

  it("una fase NUEVA del modelo se queda donde el modelo la puso", () => {
    const reales = [
      fase("f1", "Primera", 0, []),
      fase("f2", "Del medio", 1, [tarea("t1", "Hecho", { status: "DONE" })]),
      fase("f3", "Última", 2, []),
    ];
    const { phases } = rescatarProgreso(reales, [
      prop("f1", "Primera", 0, []),
      prop(undefined, "Nueva del modelo", 1, []),
      prop("f3", "Última", 2, []),
    ]);
    expect(phases.map((p) => p.name)).toEqual([
      "Primera",
      "Nueva del modelo",
      "Del medio",
      "Última",
    ]);
  });

  it("la fase rescatada conserva su startWeek (paralelismo) y sus datos", () => {
    const reales = [
      fase("f1", "Paralela", 0, [tarea("t1", "Hecho", { status: "DONE" })], {
        startWeek: 3,
        durationWeeks: 5,
        activityType: "CONFIGURACION",
      }),
    ];
    const { phases } = rescatarProgreso(reales, []);
    expect(phases[0].startWeek).toBe(3);
    expect(phases[0].durationWeeks).toBe(5);
    expect(phases[0].activityType).toBe("CONFIGURACION");
  });

  it("una fase borrada SIN progreso no vuelve (borrar sigue siendo posible)", () => {
    const reales = [fase("f1", "Vacía", 0, [tarea("t1", "Pendiente del agente")])];
    const { phases, warnings } = rescatarProgreso(reales, []);
    expect(phases).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("no muta la propuesta que recibe", () => {
    const reales = [fase("f1", "Setup", 0, [tarea("t1", "Hecha", { status: "DONE" })])];
    const entrada = [prop("f1", "Setup", 0, [])];
    rescatarProgreso(reales, entrada);
    expect(entrada[0].tasks).toEqual([]);
  });
});
