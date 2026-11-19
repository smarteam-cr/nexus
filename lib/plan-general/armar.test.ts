import { describe, expect, it } from "vitest";
import {
  armarPlanGeneral,
  semanaActualDelPlan,
  semanasDeLaTarea,
  type FaseParaElPlan,
  type ProyectoParaElPlan,
  type TareaParaElPlan,
} from "./armar";
import { fotoDelPlan, hayCambiosSinPublicar, leerFoto } from "./foto";
import { semanasQueCaben } from "./tipos";

const tarea = (id: string, weekIndex: number): TareaParaElPlan => ({
  id,
  title: `Tarea ${id}`,
  weekIndex,
  order: 0,
  semanas: null,
  tipoDeTrabajo: null,
  status: "PENDING",
  notes: null,
});

function proyecto(id: string, anclaje: string | null, fases: FaseParaElPlan[]): ProyectoParaElPlan {
  return { id, name: `Proyecto ${id}`, timeline: { anchorStartDate: anclaje, detailConfirmedAt: "2026-11-02T00:00:00.000Z", phases: fases } };
}

const fase = (
  id: string,
  loopNumero: number | null,
  tasks: TareaParaElPlan[],
  extra: { order?: number; durationWeeks?: number; startWeek?: number | null } = {},
): FaseParaElPlan => ({
  id,
  name: `Loop ${id}`,
  order: extra.order ?? 0,
  durationWeeks: extra.durationWeeks ?? 12,
  startWeek: extra.startWeek === undefined ? 0 : extra.startWeek,
  loopNumero,
  tasks,
});

describe("armarPlanGeneral", () => {
  it("junta los loops de varios proyectos en orden de número, con semanas desde 1", () => {
    const plan = armarPlanGeneral([
      proyecto("ventas", "2026-11-02T00:00:00.000Z", [
        fase("v4", 4, [{ ...tarea("a", 1), semanas: 1, status: "DONE", tipoDeTrabajo: "diagnostico" }]),
        fase("v5", 5, [{ ...tarea("b", 4), semanas: 3 }], { order: 1 }),
      ]),
      proyecto("infoclic", "2026-11-02T00:00:00.000Z", [
        fase("c1", 1, [{ ...tarea("c", 0), semanas: 4, status: "IN_PROGRESS", tipoDeTrabajo: "diseno" }]),
      ]),
    ]);
    expect(plan.grupos.map((g) => g.loopNumero)).toEqual([1, 4, 5]);
    expect(plan.arranque).toBe("2026-11-02T00:00:00.000Z");
    expect(plan.semanas).toBe(12);
    const c = plan.grupos[0].filas[0];
    expect([c.desde, c.hasta, c.estado, c.tipo]).toEqual([1, 4, "IN_PROGRESS", "diseno"]);
    const b = plan.grupos[2].filas[0];
    expect([b.desde, b.hasta]).toEqual([5, 7]);
  });

  it("deja afuera las fases sin número y las tareas suspendidas; una fase contigua arranca donde terminó la anterior", () => {
    const plan = armarPlanGeneral([
      proyecto("p", "2026-11-02T00:00:00.000Z", [
        fase("s0", null, [tarea("x", 0)], { order: 0, durationWeeks: 1, startWeek: null }),
        fase("l2", 2, [tarea("y", 0), { ...tarea("z", 1), status: "SUSPENDED" }], { order: 1, durationWeeks: 6, startWeek: null }),
      ]),
    ]);
    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].faseDesde).toBe(2);
    expect(plan.grupos[0].filas.map((f) => [f.tareaId, f.desde])).toEqual([["y", 2]]);
  });

  it("corre un proyecto que arrancó después y usa el arranque más temprano", () => {
    const plan = armarPlanGeneral([
      proyecto("tarde", "2026-11-16T00:00:00.000Z", [fase("t", 3, [tarea("t1", 0)])]),
      proyecto("temprano", "2026-11-02T00:00:00.000Z", [fase("e", 2, [tarea("e1", 0)])]),
    ]);
    expect(plan.arranque).toBe("2026-11-02T00:00:00.000Z");
    expect(plan.grupos.find((g) => g.loopNumero === 3)!.filas[0].desde).toBe(3);
    expect(plan.semanas).toBe(14);
  });

  it("para el cliente saca lo que está por validar", () => {
    const proyectos = [proyecto("p", null, [fase("l", 1, [tarea("a", 0), { ...tarea("b", 1), needsValidation: true }])])];
    expect(armarPlanGeneral(proyectos).grupos[0].filas).toHaveLength(2);
    expect(armarPlanGeneral(proyectos, { paraElCliente: true }).grupos[0].filas).toHaveLength(1);
  });

  it("sin loops no hay plan", () => {
    const plan = armarPlanGeneral([proyecto("p", "2026-11-02T00:00:00.000Z", [fase("f", null, [tarea("a", 0)])])]);
    expect(plan).toEqual({ arranque: null, semanas: 0, grupos: [] });
  });
});

describe("semanasDeLaTarea", () => {
  const grupo = { faseDesde: 1, faseSemanas: 12 };
  it("pasa de semanas del plan a weekIndex y semanas de la tarea", () => {
    expect(semanasDeLaTarea(grupo, 5, 12)).toEqual({ weekIndex: 4, semanas: 8 });
    expect(semanasDeLaTarea({ faseDesde: 3, faseSemanas: 4 }, 3, 3)).toEqual({ weekIndex: 0, semanas: 1 });
  });
  it("rechaza lo que se sale de la fase o está al revés", () => {
    expect(semanasDeLaTarea(grupo, 0, 2)).toBeNull();
    expect(semanasDeLaTarea(grupo, 11, 13)).toBeNull();
    expect(semanasDeLaTarea(grupo, 6, 5)).toBeNull();
  });
});

describe("semanaActualDelPlan", () => {
  it("el 19 nov de 2026 es la semana 3 de un plan que arrancó el lunes 2 nov", () => {
    expect(semanaActualDelPlan("2026-11-02T00:00:00.000Z", new Date(2026, 10, 19, 15))).toBe(3);
    expect(semanaActualDelPlan("2026-11-02T00:00:00.000Z", new Date(2026, 10, 2, 8))).toBe(1);
    expect(semanaActualDelPlan(null, new Date())).toBeNull();
  });
});

describe("la foto del cliente", () => {
  const plan = armarPlanGeneral([
    proyecto("p", "2026-11-02T00:00:00.000Z", [
      fase("l1", 1, [{ ...tarea("a", 0), notes: "interno", tipoDeTrabajo: "ejecucion" }]),
      fase("vacio", 2, [], { order: 1 }),
    ]),
  ]);

  it("no lleva proyectos, ids ni el detalle, y un loop vacío no sale", () => {
    const foto = fotoDelPlan(plan);
    const texto = JSON.stringify(foto);
    expect(texto).not.toContain("interno");
    expect(texto).not.toContain("Proyecto p");
    expect(texto).not.toContain('"a"');
    expect(foto.grupos.map((g) => g.loopNumero)).toEqual([1]);
  });

  it("se lee igual que se guardó, y avisa cambios solo cuando los hay", () => {
    const foto = fotoDelPlan(plan);
    const guardada = leerFoto(JSON.parse(JSON.stringify(foto)));
    expect(guardada).toEqual(foto);
    expect(hayCambiosSinPublicar(foto, guardada)).toBe(false);
    expect(hayCambiosSinPublicar({ ...foto, semanas: 13 }, guardada)).toBe(true);
    expect(hayCambiosSinPublicar(foto, null)).toBe(true);
  });

  it("una foto de otro formato o rota no se sirve", () => {
    expect(leerFoto({ ...fotoDelPlan(plan), formato: 99 })).toBeNull();
    expect(leerFoto({ formato: 1, semanas: 3, grupos: [{ loopNumero: 1, nombre: "x", filas: [{ titulo: "t", desde: 1, hasta: 1, estado: "SUSPENDED" }] }] })).toBeNull();
    expect(leerFoto(null)).toBeNull();
  });
});

describe("semanasQueCaben (el PUT al crear o recrear una tarea, también al moverla de loop)", () => {
  it("conserva lo que dura, recortado al final de la fase; 1 es null", () => {
    expect(semanasQueCaben(3, 4, 12)).toBe(3);
    expect(semanasQueCaben(8, 8, 12)).toBe(4);
    expect(semanasQueCaben(5, 11, 12)).toBeNull();
    expect(semanasQueCaben(null, 0, 12)).toBeNull();
    expect(semanasQueCaben(1, 0, 12)).toBeNull();
  });
});

describe("lo por validar", () => {
  it("el equipo lo ve marcado; el cliente no lo ve", () => {
    const proyectos = [proyecto("p", null, [fase("l", 1, [{ ...tarea("b", 1), needsValidation: true }])])];
    expect(armarPlanGeneral(proyectos).grupos[0].filas[0].porValidar).toBe(true);
    expect(armarPlanGeneral(proyectos, { paraElCliente: true }).grupos[0].filas).toEqual([]);
  });
});

describe("el PUT del cronograma lee semanas y tipo con tolerancia", () => {
  it("los válidos pasan; los raros se ignoran sin trabar el guardado", async () => {
    const { validateTimelinePayload } = await import("@/lib/timeline/validate");
    const v = validateTimelinePayload({
      phases: [
        {
          name: "Campaign Activation",
          order: 0,
          durationWeeks: 12,
          tasks: [
            { title: "Campaña piloto", weekIndex: 4, order: 0, semanas: 2, tipoDeTrabajo: "ejecucion" },
            { title: "Rara", weekIndex: 0, order: 0, semanas: "dos", tipoDeTrabajo: "volar" },
          ],
        },
      ],
    });
    expect(v.valid).toBe(true);
    const [buena, rara] = v.parsed!.phases[0].tasks!;
    expect([buena.semanas, buena.tipoDeTrabajo]).toEqual([2, "ejecucion"]);
    expect([rara.semanas, rara.tipoDeTrabajo]).toEqual([undefined, undefined]);
  });
});

describe("la puerta del detalle confirmado", () => {
  it("⛔ sin el detalle confirmado, el cliente no ve las actividades; el equipo sí, y sabe por qué", () => {
    const p: ProyectoParaElPlan = { id: "p", name: "P", timeline: { anchorStartDate: null, detailConfirmedAt: null, phases: [fase("l", 1, [tarea("a", 0)])] } };
    expect(armarPlanGeneral([p], { paraElCliente: true }).grupos[0].filas).toEqual([]);
    const interno = armarPlanGeneral([p]).grupos[0];
    expect(interno.filas).toHaveLength(1);
    expect(interno.detalleConfirmado).toBe(false);
  });
});
