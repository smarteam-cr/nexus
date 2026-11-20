/**
 * lib/plan-general/armar.test.ts — el plan general sobre el MOTOR de cronogramas (2026-11-19).
 *
 * Lo que no puede romperse: el plan junta SOLO las fases-loop, cada una donde arranca en su cronograma más el
 * corrimiento de su proyecto; las tareas son las mismas filas (weekIndex de su fase, `semanas`); y para el cliente se
 * une lo que ya filtró el chokepoint del cronograma externo, con el nombre del loop y sin particularidades.
 */
import { describe, expect, it } from "vitest";
import type { ExternalTimelineData, ExternalTimelinePhase } from "@/lib/external/timeline-view-types";
import { anclaComun, armarPlanGeneral, corrimiento, unirParaElCliente, type FaseParaElPlan, type ProyectoParaElPlan } from "./armar";
import { fotoDelPlan, hayCambiosSinPublicar, leerFoto, tieneLoops } from "./foto";

type TareaDeFase = FaseParaElPlan["tasks"][number];
const tarea = (id: string, weekIndex: number, extra: Partial<TareaDeFase> = {}): TareaDeFase => ({
  id,
  title: `Tarea ${id}`,
  weekIndex,
  semanas: null,
  order: 0,
  status: "PENDING",
  notes: null,
  needsValidation: false,
  source: "HUMAN",
  statusSource: null,
  statusChangedByEmail: null,
  statusChangedAt: null,
  party: "SMARTEAM",
  type: "TASK",
  startDateOverride: null,
  dueDateOverride: null,
  ...extra,
});

const fase = (
  id: string,
  loopNumero: number | null,
  tasks: TareaDeFase[],
  extra: { order?: number; durationWeeks?: number; startWeek?: number | null } = {},
): FaseParaElPlan => ({
  id,
  name: `Fase ${id}`,
  order: extra.order ?? 0,
  durationWeeks: extra.durationWeeks ?? 12,
  startWeek: extra.startWeek === undefined ? 0 : extra.startWeek,
  loopNumero,
  activityType: null,
  status: "IN_PROGRESS",
  needsValidation: false,
  sessionCount: null,
  tasks,
});

const proyecto = (id: string, ancla: string | null, fases: FaseParaElPlan[], confirmado = true): ProyectoParaElPlan => ({
  id,
  name: `Proyecto ${id}`,
  timeline: { anchorStartDate: ancla, detailConfirmedAt: confirmado ? "2026-11-02T00:00:00.000Z" : null, phases: fases },
});

const NOV2 = "2026-11-02T00:00:00.000Z";
const NOV16 = "2026-11-16T00:00:00.000Z";

describe("armarPlanGeneral: el plan del equipo, con las filas del motor", () => {
  const plan = armarPlanGeneral([
    proyecto("ventas", NOV16, [
      fase("v4", 4, [tarea("a", 1, { status: "DONE" })]),
      fase("v5", 5, [tarea("b", 4, { semanas: 3, notes: "interno" })], { order: 1 }),
    ]),
    proyecto("infoclic", NOV2, [
      // Una fase común antes del loop: el loop arranca donde termina ella (contigua), no en 0.
      fase("s0", null, [tarea("x", 0)], { durationWeeks: 1, startWeek: null }),
      fase("c1", 1, [tarea("c", 0, { semanas: 4, status: "IN_PROGRESS" })], { order: 1, startWeek: null }),
    ]),
    proyecto("sin-loops", NOV2, [fase("comun", null, [tarea("z", 0)])]),
  ]);

  it("solo las fases-loop, en orden de número, sobre el arranque más temprano", () => {
    expect(plan.fases.map((f) => f.loopNumero)).toEqual([1, 4, 5]);
    expect(plan.ancla).toBe(NOV2);
    expect(plan.proyectos.map((p) => p.id)).toEqual(["ventas", "infoclic"]);
  });

  it("cada fase arranca donde arranca en SU cronograma, corrida por el arranque de su proyecto", () => {
    expect(plan.fases.find((f) => f.id === "c1")!.startWeek).toBe(1); // tras la Semana 0 de 1 semana
    expect(plan.fases.find((f) => f.id === "v4")!.startWeek).toBe(2); // ventas arrancó dos semanas después
  });

  it("las tareas son las del cronograma, tal cual: semana de su fase, duración, estado y notas (es el equipo)", () => {
    const b = plan.fases.find((f) => f.id === "v5")!.tasks[0];
    expect([b.id, b.weekIndex, b.semanas, b.notes]).toEqual(["b", 4, 3, "interno"]);
    expect(plan.fases.find((f) => f.id === "v4")!.tasks[0].status).toBe("DONE");
    expect(plan.fases.find((f) => f.id === "v4")!.proyectoId).toBe("ventas");
  });

  it("dice qué proyecto no tiene el detalle confirmado (el cliente no ve sus tareas)", () => {
    const p = armarPlanGeneral([proyecto("p", null, [fase("l", 1, [tarea("a", 0)])], false)]);
    expect(p.proyectos[0].detalleConfirmado).toBe(false);
    expect(p.fases[0].tasks).toHaveLength(1);
    expect(p.ancla).toBeNull();
  });
});

describe("corrimiento y arranque común", () => {
  it("semanas enteras, y sin arranque no se corre", () => {
    expect(anclaComun([NOV16, null, NOV2])).toBe(NOV2);
    expect(anclaComun([null, undefined])).toBeNull();
    expect(corrimiento(NOV2, NOV16)).toBe(2);
    expect(corrimiento(NOV2, "2026-11-04T00:00:00.000Z")).toBe(0); // un miércoles cuenta en la semana del lunes
    expect(corrimiento(NOV2, null)).toBe(0);
    expect(corrimiento(null, NOV16)).toBe(0);
  });
});

const faseExterna = (id: string, order: number, extra: Partial<ExternalTimelinePhase> = {}): ExternalTimelinePhase => ({
  id,
  name: `Fase ${id}`,
  order,
  durationWeeks: 12,
  startWeek: 0,
  sessionCount: null,
  notes: null,
  activityType: null,
  tasks: [{ title: `Tarea de ${id}`, weekIndex: 1, status: "PENDING", party: "SMARTEAM", type: "TASK" }],
  ...extra,
});
const cronograma = (ancla: string | null, phases: ExternalTimelinePhase[]): ExternalTimelineData => ({
  exists: true,
  anchorStartDate: ancla,
  phases,
  particularidades: [{ kind: "ATRASO", party: "CLIENTE", title: "Una desviación", detail: null, weeksImpact: 1, phaseId: null, occurredAt: NOV2 }],
});

describe("unirParaElCliente: lo que ve el cliente, con la forma del cronograma compartible", () => {
  const unido = unirParaElCliente([
    { data: cronograma(NOV16, [faseExterna("v4", 0), faseExterna("comun", 1)]), loops: new Map([["v4", 4]]) },
    {
      data: cronograma(NOV2, [faseExterna("s0", 0, { durationWeeks: 1, startWeek: null }), faseExterna("c1", 1, { startWeek: null })]),
      loops: new Map([["c1", 1]]),
    },
  ]);

  it("solo los loops, con su nombre «01 · …», en orden de loop y arranque explícito sobre el común", () => {
    expect(unido.anchorStartDate).toBe(NOV2);
    expect(unido.phases.map((f) => [f.name, f.startWeek, f.order])).toEqual([
      ["01 · Fase c1", 1, 0],
      ["04 · Fase v4", 2, 1],
    ]);
  });

  it("⛔ las tareas pasan como las dejó el chokepoint (sin agregar nada) y las particularidades no cruzan", () => {
    expect(unido.phases[0].tasks).toEqual([{ title: "Tarea de c1", weekIndex: 1, status: "PENDING", party: "SMARTEAM", type: "TASK" }]);
    expect(unido.particularidades).toEqual([]);
    expect(JSON.stringify(unido)).not.toContain("Fase comun");
  });

  it("dos loops con el mismo número salen en el orden de la vista del equipo (por proyecto), sin importar cómo llegan", () => {
    const de = (nombre: string, id: string) => ({ proyectoNombre: nombre, data: cronograma(NOV2, [faseExterna(id, 0)]), loops: new Map([[id, 3]]) });
    const ids = (u: ExternalTimelineData) => u.phases.map((f) => f.id);
    expect(ids(unirParaElCliente([de("Ventas", "v"), de("Marketing", "m")]))).toEqual(["m", "v"]);
    expect(ids(unirParaElCliente([de("Marketing", "m"), de("Ventas", "v")]))).toEqual(["m", "v"]);
    const equipo = armarPlanGeneral([
      { ...proyecto("v", NOV2, [fase("v", 3, [])]), name: "Ventas" },
      { ...proyecto("m", NOV2, [fase("m", 3, [])]), name: "Marketing" },
    ]);
    expect(equipo.fases.map((f) => f.id)).toEqual(["m", "v"]);
  });

  it("un cronograma sin loops no entra ni corre el arranque", () => {
    const solo = unirParaElCliente([
      { data: cronograma("2026-10-01T00:00:00.000Z", [faseExterna("x", 0)]), loops: new Map() },
      { data: cronograma(NOV2, [faseExterna("l", 0)]), loops: new Map([["l", 2]]) },
    ]);
    expect(solo.anchorStartDate).toBe(NOV2);
    expect(solo.phases.map((f) => f.startWeek)).toEqual([0]);
  });
});

describe("la foto del cliente", () => {
  const hoy = unirParaElCliente([{ data: cronograma(NOV2, [faseExterna("l", 0)]), loops: new Map([["l", 1]]) }]);

  it("se lee igual que se guardó, y avisa cambios solo cuando los hay", () => {
    const guardada = leerFoto(JSON.parse(JSON.stringify(fotoDelPlan(hoy))));
    expect(guardada!.phases).toEqual(hoy.phases);
    expect(hayCambiosSinPublicar(hoy, guardada)).toBe(false);
    const otra = { ...hoy, phases: hoy.phases.map((f) => ({ ...f, tasks: f.tasks!.map((t) => ({ ...t, status: "DONE" })) })) };
    expect(hayCambiosSinPublicar(otra, guardada)).toBe(true);
    expect(hayCambiosSinPublicar(hoy, null)).toBe(true);
  });

  it("las claves en otro orden (así vuelve un JSONB) no son un cambio", () => {
    const alReves = (o: unknown): unknown =>
      Array.isArray(o) ? o.map(alReves) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).reverse().map(([k, x]) => [k, alReves(x)])) : o;
    expect(hayCambiosSinPublicar(hoy, alReves(hoy) as typeof hoy)).toBe(false);
  });

  it("una foto de otro formato (la del gantt propio, formato 1) o rota no se sirve", () => {
    expect(leerFoto({ formato: 1, semanas: 3, grupos: [] })).toBeNull();
    expect(leerFoto({ ...fotoDelPlan(hoy), formato: 99 })).toBeNull();
    expect(leerFoto(null)).toBeNull();
  });

  it("hay algo que compartir cuando hay loops", () => {
    expect(tieneLoops(hoy)).toBe(true);
    expect(tieneLoops({ exists: false, anchorStartDate: null, phases: [] })).toBe(false);
  });
});
