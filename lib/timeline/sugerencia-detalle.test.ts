import { describe, it, expect } from "vitest";
import {
  impactoDeUnDelta,
  filasDeDetalle,
  describeMovimiento,
  movimientosPorSalto,
} from "./sugerencia-detalle";
import { computeProposalDeltas, type CurrentPhaseLike, type ProposalLike } from "./proposal-deltas";

const fase = (id: string, name: string, durationWeeks: number, extra: Partial<CurrentPhaseLike> = {}): CurrentPhaseLike => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  ...extra,
});

const ANCLA = "2026-05-19";

describe("impactoDeUnDelta — cuánto mueve el cierre UNA sugerencia", () => {
  it("alargar una fase corre el cierre exactamente esas semanas", () => {
    const current = [fase("a", "Setup", 2), fase("b", "Cierre", 1)];
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [{ id: "a", name: "Setup", durationWeeks: 6 }, { id: "b", name: "Cierre", durationWeeks: 1 }],
    };
    const i = impactoDeUnDelta(current, proposal, ANCLA, "mod:a");
    expect(i.mueve).toBe(true);
    expect(i.dias).toBe(28); // 4 semanas
    expect(i.chip).toBe("4 semanas más tarde");
    expect(i.fechas).toContain("→");
  });

  it("acortar una fase adelanta el cierre", () => {
    const current = [fase("a", "Setup", 4), fase("b", "Cierre", 1)];
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [{ id: "a", name: "Setup", durationWeeks: 2 }, { id: "b", name: "Cierre", durationWeeks: 1 }],
    };
    const i = impactoDeUnDelta(current, proposal, ANCLA, "mod:a");
    expect(i.dias).toBe(-14);
    expect(i.chip).toBe("2 semanas antes");
  });

  /* LA DISTINCIÓN QUE JUSTIFICA TODO EL MÓDULO: un cambio de contenido NO mueve fechas, y hasta
     hoy se mostraba con el mismo peso visual que uno que sí. */
  it("un renombre o una nota NO mueven el cierre", () => {
    const current = [fase("a", "Setup", 2, { notes: "vieja" })];
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [{ id: "a", name: "Puesta a punto", durationWeeks: 2, notes: "nueva" }],
    };
    const i = impactoDeUnDelta(current, proposal, ANCLA, "mod:a");
    expect(i.mueve).toBe(false);
    expect(i.dias).toBe(0);
    expect(i.chip).toBeNull();
  });

  it("una fase que corre EN PARALELO dentro del span no mueve el cierre", () => {
    const current = [fase("a", "Larga", 8), fase("b", "Paralela", 2, { startWeek: 0 })];
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [
        { id: "a", name: "Larga", durationWeeks: 8 },
        { id: "b", name: "Paralela", durationWeeks: 4, startWeek: 0 },
      ],
    };
    const i = impactoDeUnDelta(current, proposal, ANCLA, "mod:b");
    expect(i.mueve, "termina en S4, dentro de las 8 de la otra").toBe(false);
  });

  it("mover el arranque corre el cierre los mismos días", () => {
    const current = [fase("a", "Setup", 2)];
    const proposal: ProposalLike = {
      anchorStartDate: "2026-05-26T00:00:00.000Z",
      phases: [{ id: "a", name: "Setup", durationWeeks: 2 }],
    };
    const i = impactoDeUnDelta(current, proposal, ANCLA, "anchor");
    expect(i.dias).toBe(7);
    expect(i.chip).toBe("1 semana más tarde");
  });

  it("sin ancla no se afirma ningún corrimiento (nunca inventa una fecha)", () => {
    const current = [fase("a", "Setup", 2)];
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [{ id: "a", name: "Setup", durationWeeks: 6 }],
    };
    const i = impactoDeUnDelta(current, proposal, null, "mod:a");
    expect(i.dias).toBeNull();
    expect(i.mueve).toBe(false);
    expect(i.chip).toBeNull();
  });

  it("una clave que no existe no mueve nada (no revienta)", () => {
    const current = [fase("a", "Setup", 2)];
    const proposal: ProposalLike = { anchorStartDate: null, phases: [{ id: "a", name: "Setup", durationWeeks: 2 }] };
    expect(impactoDeUnDelta(current, proposal, ANCLA, "mod:inexistente").mueve).toBe(false);
  });

  it("días que no caen en semanas justas se dicen en días", () => {
    const current = [fase("a", "Setup", 2)];
    const proposal: ProposalLike = {
      anchorStartDate: "2026-05-22T00:00:00.000Z",
      phases: [{ id: "a", name: "Setup", durationWeeks: 2 }],
    };
    expect(impactoDeUnDelta(current, proposal, ANCLA, "anchor").chip).toBe("3 días más tarde");
  });
});

describe("filasDeDetalle — el antes/después que faltaba", () => {
  it("«notas actualizadas» pasa a mostrar las dos versiones", () => {
    const filas = filasDeDetalle([{ field: "notes", from: "Depende del cliente", to: "Bloqueada por accesos" }]);
    expect(filas[0]).toMatchObject({
      etiqueta: "Notas",
      antes: "Depende del cliente",
      despues: "Bloqueada por accesos",
      mueveFechas: false,
    });
  });

  it("una nota que se agrega desde cero dice «(sin notas)», no vacío", () => {
    expect(filasDeDetalle([{ field: "notes", from: null, to: "Nueva" }])[0].antes).toBe("(sin notas)");
  });

  it("lo que mueve fechas va primero, aunque venga último", () => {
    const filas = filasDeDetalle([
      { field: "name", from: "A", to: "B" },
      { field: "notes", from: null, to: "x" },
      { field: "durationWeeks", from: 2, to: 6 },
    ]);
    expect(filas[0].campo).toBe("durationWeeks");
    expect(filas[0].mueveFechas).toBe(true);
  });

  it("los valores se leen en castellano, no crudos", () => {
    const filas = filasDeDetalle([
      { field: "durationWeeks", from: 1, to: 6 },
      { field: "startWeek", from: null, to: 2 },
      { field: "activityType", from: null, to: "CONFIGURACION" },
      { field: "sessionCount", from: null, to: 8 },
    ]);
    const porCampo = new Map(filas.map((f) => [f.campo, f]));
    expect(porCampo.get("durationWeeks")).toMatchObject({ antes: "1 semana", despues: "6 semanas" });
    expect(porCampo.get("startWeek")).toMatchObject({ antes: "automático (tras la fase anterior)", despues: "semana 2" });
    expect(porCampo.get("activityType")).toMatchObject({ antes: "sin tipo", despues: "Configuración" });
    expect(porCampo.get("sessionCount")).toMatchObject({ antes: "sin estimar", despues: "8" });
  });
});

describe("el reordenamiento dice QUÉ se mueve", () => {
  /* Con 10 fases, `names.join(" → ")` es una cadena de 10 nombres que muestra el DESTINO y
     obliga a diffear a ojo contra el Gantt. Solo importan las que cambian de puesto. */
  it("solo las fases que cambian de puesto entran a `movimientos`", () => {
    const current = [fase("a", "Semana 0", 1), fase("b", "Sales Hub", 2), fase("c", "Cierre", 1)];
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [
        { id: "a", name: "Semana 0", durationWeeks: 1 },
        { id: "c", name: "Cierre", durationWeeks: 1 },
        { id: "b", name: "Sales Hub", durationWeeks: 2 },
      ],
    };
    const d = computeProposalDeltas(current, proposal, ANCLA).find((x) => x.kind === "REORDER_PHASES");
    expect(d, "tiene que haber delta de reorden").toBeDefined();
    if (d?.kind !== "REORDER_PHASES") throw new Error("kind");
    expect(d.movimientos.map((m) => m.nombre).sort()).toEqual(["Cierre", "Sales Hub"]);
    expect(d.movimientos.find((m) => m.nombre === "Cierre")).toMatchObject({ de: 3, a: 2 });
    expect(d.movimientos.find((m) => m.nombre === "Sales Hub")).toMatchObject({ de: 2, a: 3 });
    // "Semana 0" no se movió: no aparece.
    expect(d.movimientos.some((m) => m.nombre === "Semana 0")).toBe(false);
  });

  it("las posiciones son ABSOLUTAS aunque la propuesta no nombre todas las fases", () => {
    const current = [fase("a", "Uno", 1), fase("b", "Dos", 1), fase("c", "Tres", 1)];
    // La propuesta solo nombra b y a (en ese orden); "Tres" queda al final.
    const proposal: ProposalLike = {
      anchorStartDate: null,
      phases: [
        { id: "b", name: "Dos", durationWeeks: 1 },
        { id: "a", name: "Uno", durationWeeks: 1 },
      ],
    };
    const d = computeProposalDeltas(current, proposal, ANCLA).find((x) => x.kind === "REORDER_PHASES");
    if (d?.kind !== "REORDER_PHASES") throw new Error("kind");
    expect(d.movimientos.find((m) => m.nombre === "Dos")).toMatchObject({ de: 2, a: 1 });
    expect(d.movimientos.find((m) => m.nombre === "Uno")).toMatchObject({ de: 1, a: 2 });
  });

  it("describeMovimiento dice sube/baja con los puestos", () => {
    expect(describeMovimiento({ id: "x", nombre: "Sales Hub", de: 5, a: 2 })).toBe("Sales Hub sube de 5º a 2º");
    expect(describeMovimiento({ id: "x", nombre: "Cierre", de: 2, a: 7 })).toBe("Cierre baja de 2º a 7º");
  });

  it("el salto más grande se lee primero", () => {
    const orden = movimientosPorSalto([
      { id: "a", nombre: "Chico", de: 2, a: 3 },
      { id: "b", nombre: "Grande", de: 1, a: 8 },
    ]).map((m) => m.nombre);
    expect(orden).toEqual(["Grande", "Chico"]);
  });
});
