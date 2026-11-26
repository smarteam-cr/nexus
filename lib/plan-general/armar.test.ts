/**
 * lib/plan-general/armar.test.ts — el plan general sobre el MOTOR de cronogramas (2026-11-19).
 *
 * Lo que no puede romperse: el plan junta SOLO las fases-loop, cada una donde arranca en su cronograma más el
 * corrimiento de su proyecto; las tareas son las mismas filas (weekIndex de su fase, `semanas`); y para el cliente se
 * une lo que ya filtró el chokepoint del cronograma externo, con el nombre del loop y sin particularidades.
 */
import { describe, expect, it } from "vitest";
import type { ExternalTimelineData, ExternalTimelinePhase } from "@/lib/external/timeline-view-types";
import { anclaComun, anclaDelPlan, armarPlanGeneral, corrimiento, unirParaElCliente, type FaseParaElPlan, type ProyectoParaElPlan } from "./armar";
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
    // Los proyectos son los que ENTRAN (la lista del plan, 26 nov): uno sin loops está, aunque no muestre nada.
    expect(plan.proyectos.map((p) => p.id)).toEqual(["ventas", "infoclic", "sin-loops"]);
    expect(plan.guardado).toBe(false);
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

/* 2026-11-26 · El plan como objeto de la cuenta: sus fases PROPIAS (lo transversal), su arranque, su orden y lo que ve
   el cliente de ellas (DECISIONS «El plan general es un objeto de la cuenta»). */
const propio = (ancla: string | null, fases: FaseParaElPlan[]) => ({ anchorStartDate: ancla, detailConfirmedAt: NOV2, phases: fases });

describe("armarPlanGeneral con fases propias", () => {
  const plan = armarPlanGeneral(
    [
      proyecto("ventas", NOV16, [fase("v4", 4, [tarea("a", 0)]), fase("v-comun", null, [tarea("z", 0)], { order: 1 })]),
      proyecto("infoclic", NOV2, [fase("c1", 1, [tarea("c", 0)])]),
    ],
    propio(NOV2, [
      fase("transversal", 0, [tarea("t1", 0, { status: "DONE", semanas: 2 }), tarea("t4", 3, { semanas: 6 })], { durationWeeks: 9 }),
      fase("sin-numero", null, [], { order: 1, startWeek: 2, durationWeeks: 3 }),
    ]),
  );

  it("entran TODAS las fases del plan (con número o sin él), sin proyecto, y del proyecto solo los loops", () => {
    expect(plan.fases.map((f) => f.id)).toEqual(["sin-numero", "transversal", "c1", "v4"]);
    expect(plan.fases.filter((f) => f.proyectoId === null).map((f) => f.id)).toEqual(["sin-numero", "transversal"]);
    expect(plan.fases.some((f) => f.id === "v-comun")).toBe(false);
    expect(plan.guardado).toBe(true);
  });

  it("el arranque es el del plan, y los proyectos se corren desde ahí", () => {
    expect(plan.ancla).toBe(NOV2);
    expect(plan.anclaPropia).toBe(true);
    expect(plan.fases.find((f) => f.id === "transversal")!.startWeek).toBe(0);
    expect(plan.fases.find((f) => f.id === "sin-numero")!.startWeek).toBe(2);
    expect(plan.fases.find((f) => f.id === "v4")!.startWeek).toBe(2);
  });

  it("⛔ un proyecto que arranca ANTES que el plan mueve el S0: nada queda en semanas negativas", () => {
    const tarde = armarPlanGeneral([proyecto("p", NOV2, [fase("l", 1, [])])], propio(NOV16, [fase("t", 0, [])]));
    expect(tarde.ancla).toBe(NOV2);
    expect(tarde.fases.find((f) => f.id === "l")!.startWeek).toBe(0);
    expect(tarde.fases.find((f) => f.id === "t")!.startWeek).toBe(2);
    // La pantalla resta esto al guardar el arranque de una fase propia.
    expect(tarde.corrimientoPropio).toBe(2);
    expect(plan.corrimientoPropio).toBe(0);
  });

  it("las tareas de una fase propia son las filas del motor (semana, duración, estado)", () => {
    const t = plan.fases.find((f) => f.id === "transversal")!.tasks;
    expect(t.map((x) => [x.id, x.weekIndex, x.semanas, x.status])).toEqual([
      ["t1", 0, 2, "DONE"],
      ["t4", 3, 6, "PENDING"],
    ]);
  });

  it("un plan sin arranque usa el más temprano de sus proyectos (lo de antes)", () => {
    expect(armarPlanGeneral([proyecto("p", NOV16, [fase("l", 1, [])])], propio(null, [])).ancla).toBe(NOV16);
    expect(anclaDelPlan(null, [NOV16, NOV2])).toBe(NOV2);
    expect(anclaDelPlan(NOV2, [NOV16])).toBe(NOV2);
    expect(anclaDelPlan(NOV16, [NOV2])).toBe(NOV2);
  });

  it("a igual número de loop, primero la del plan y después por proyecto", () => {
    const p = armarPlanGeneral(
      [{ ...proyecto("a", NOV2, [fase("a3", 3, [])]), name: "Alfa" }],
      propio(NOV2, [fase("p3", 3, [])]),
    );
    expect(p.fases.map((f) => f.id)).toEqual(["p3", "a3"]);
  });
});

describe("unirParaElCliente con las fases propias del plan", () => {
  const unido = unirParaElCliente([
    { data: cronograma(NOV2, [faseExterna("c1", 0)]), loops: new Map([["c1", 1]]), proyectoNombre: "Infoclic" },
    {
      delPlan: true,
      data: cronograma(NOV2, [faseExterna("tr", 0, { durationWeeks: 9 }), faseExterna("libre", 1, { startWeek: 3 })]),
      loops: new Map([["tr", 0]]),
    },
  ]);

  it("el loop 0 se rotula «00 · Transversal»; una fase propia sin número, con su nombre; todas entran", () => {
    expect(unido.phases.map((f) => [f.name, f.startWeek, f.order])).toEqual([
      ["Fase libre", 3, 0],
      ["00 · Fase tr", 0, 1],
      ["01 · Fase c1", 0, 2],
    ]);
  });

  it("⛔ lo de la fase propia pasa como lo dejó el chokepoint, y sin particularidades", () => {
    expect(unido.phases.find((f) => f.id === "tr")!.tasks).toEqual([{ title: "Tarea de tr", weekIndex: 1, status: "PENDING", party: "SMARTEAM", type: "TASK" }]);
    expect(unido.particularidades).toEqual([]);
  });

  it("⛔ al cliente tampoco le llegan semanas negativas: un proyecto que arranca antes mueve el S0", () => {
    const u = unirParaElCliente([
      { data: cronograma(NOV2, [faseExterna("c1", 0)]), loops: new Map([["c1", 1]]) },
      { delPlan: true, data: cronograma(NOV16, [faseExterna("tr", 0)]), loops: new Map([["tr", 0]]) },
    ]);
    expect(u.anchorStartDate).toBe(NOV2);
    expect(u.phases.map((f) => [f.id, f.startWeek])).toEqual([
      ["tr", 2],
      ["c1", 0],
    ]);
  });

  it("sin fases propias, lo mismo que antes del 26 nov (la foto publicada de kölbi no queda «con cambios»)", () => {
    const antes = unirParaElCliente([{ data: cronograma(NOV2, [faseExterna("l", 0)]), loops: new Map([["l", 1]]) }]);
    const conPlanVacio = unirParaElCliente([
      { data: cronograma(NOV2, [faseExterna("l", 0)]), loops: new Map([["l", 1]]) },
      { delPlan: true, data: { exists: true, anchorStartDate: NOV2, phases: [], particularidades: [] }, loops: new Map() },
    ]);
    expect(hayCambiosSinPublicar(conPlanVacio, antes)).toBe(false);
  });
});
