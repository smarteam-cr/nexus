/**
 * lib/timeline/project-actions.test.ts
 *
 * El panel "qué hacer acá". Lo que se fija: proyecto sano → lista vacía (el panel dice "todo al día",
 * no inventa alarmas), y cada señal produce UNA acción accionable en el grupo correcto.
 */
import { test, expect } from "vitest";
import { buildProjectActions, groupActions, type ProjectActionsInput } from "./project-actions";

const sano: ProjectActionsInput = {
  pendingProgress: false,
  pendingParticularidades: 0,
  pendingProposal: false,
  anchorStartDate: "2026-06-01T00:00:00.000Z",
  detailConfirmedAt: "2026-06-02T00:00:00.000Z",
  timelinePublishedAt: "2026-06-03T00:00:00.000Z",
  hasTasks: true,
  cambiosSinPublicar: false,
  sinCuantificar: 0,
  duplicados: 0,
  compromisosSinTarea: 0,
  compromisosVencidos: 0,
  pendientesDelClienteVencidos: 0,
  tareasVencidas: 0,
  alarmasDeEtapa: [],
  alcanceExcedido: null,
  estancadoDias: null,
};

test("proyecto al día → ninguna acción (el panel no inventa alarmas)", () => {
  expect(buildProjectActions(sano)).toEqual([]);
  expect(groupActions([])).toEqual([]);
});

test("borradores del agente → grupo Decidir", () => {
  const a = buildProjectActions({ ...sano, pendingProgress: true, pendingParticularidades: 3 });
  expect(a.map((x) => x.id)).toEqual(["draft-progress", "draft-particularidades"]);
  expect(a.every((x) => x.group === "decidir")).toBe(true);
  expect(a[1].title).toContain("3 desviaciones detectadas");
});

// El bug que originó todo esto: duplicados que inflan el corrimiento.
test("duplicados avisan que el total está inflado", () => {
  const a = buildProjectActions({ ...sano, duplicados: 3 });
  expect(a[0].id).toBe("duplicados");
  expect(a[0].title).toContain("3 desviaciones repetidas");
  expect(a[0].why).toContain("doble");
});

test("singular vs plural", () => {
  expect(buildProjectActions({ ...sano, duplicados: 1 })[0].title).toContain("1 desviación repetida");
  expect(buildProjectActions({ ...sano, sinCuantificar: 1 })[0].title).toContain("1 atraso sin semanas");
});

test("sin fecha de arranque tapa al detalle sin confirmar (una cosa a la vez)", () => {
  const a = buildProjectActions({ ...sano, anchorStartDate: null, detailConfirmedAt: null });
  expect(a.map((x) => x.id)).toContain("sin-anchor");
  expect(a.map((x) => x.id)).not.toContain("detalle-sin-confirmar");
});

test("sin publicar tapa a cambios-sin-publicar (no se pide dos veces lo mismo)", () => {
  const a = buildProjectActions({ ...sano, timelinePublishedAt: null, cambiosSinPublicar: true });
  expect(a.map((x) => x.id)).toContain("sin-publicar");
  expect(a.map((x) => x.id)).not.toContain("cambios-sin-publicar");
});

test("riesgo del cliente y alcance excedido van a Atender", () => {
  const a = buildProjectActions({
    ...sano,
    pendientesDelClienteVencidos: 2,
    alcanceExcedido: { addedTasks: 3, weeksDelta: 2 },
  });
  const atender = a.filter((x) => x.group === "atender");
  expect(atender.map((x) => x.id)).toEqual(["blockers-cliente", "alcance"]);
  expect(atender[1].title).toContain("+3 tareas");
  expect(atender[1].title).toContain("+2 semanas");
});

// El caso que originó esta tanda: compromisos anotados que nadie está haciendo.
test("compromisos sin tarea van a Decidir, antes que la higiene de datos", () => {
  const a = buildProjectActions({ ...sano, compromisosSinTarea: 4, duplicados: 2 });
  expect(a.map((x) => x.id)).toEqual(["compromisos-sin-tarea", "duplicados"]);
  expect(a[0].title).toContain("4 compromisos sin tarea");
  expect(a[0].why).toContain("no vencen");
});

test("compromiso vencido va a Atender y es riesgo", () => {
  const a = buildProjectActions({ ...sano, compromisosVencidos: 1 });
  expect(a[0].id).toBe("compromisos-vencidos");
  expect(a[0].group).toBe("atender");
  expect(a[0].tone).toBe("risk");
  expect(a[0].title).toContain("1 compromiso vencido sin cumplir");
});

test("alarmas de etapa se pasan tal cual con su antigüedad", () => {
  const a = buildProjectActions({
    ...sano,
    alarmasDeEtapa: [{ key: "kickoff_sin_publicar", label: "Kickoff sin publicar", days: 9 }],
  });
  expect(a[0].id).toBe("etapa-kickoff_sin_publicar");
  expect(a[0].title).toBe("Kickoff sin publicar");
  expect(a[0].why).toContain("9 días");
});

test("el orden es decidir → publicar → atender", () => {
  const a = buildProjectActions({
    ...sano,
    pendingProgress: true,
    timelinePublishedAt: null,
    pendientesDelClienteVencidos: 1,
  });
  expect(groupActions(a).map((g) => g.group)).toEqual(["decidir", "publicar", "atender"]);
});

test("cada acción trae qué pasa, por qué importa y qué hacer", () => {
  const a = buildProjectActions({ ...sano, pendingProgress: true, duplicados: 1, pendientesDelClienteVencidos: 1 });
  for (const x of a) {
    expect(x.title.length).toBeGreaterThan(0);
    expect(x.why.length).toBeGreaterThan(0);
    expect(x.cta.length).toBeGreaterThan(0);
  }
});
