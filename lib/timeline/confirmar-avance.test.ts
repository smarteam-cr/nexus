/**
 * lib/timeline/confirmar-avance.test.ts
 *
 * Lo que fija: nadie puede firmar como "detectado por la IA y confirmado" algo que la IA nunca
 * propuso. Antes de este recorte, `progress/apply` aceptaba cualquier id del body y lo escribía
 * con `statusSource = AI_CONFIRMED`.
 *
 * Correr: `npx vitest run lib/timeline/confirmar-avance.test.ts --project unit`.
 */
import { describe, test, expect } from "vitest";
import { acotarAlBorrador, type BorradorDeAvance, type AvancePedido } from "./confirmar-avance";

const borrador = (over: Partial<BorradorDeAvance> = {}): BorradorDeAvance => ({
  currentPhaseId: "f-hoy",
  phases: [{ id: "f1" }],
  tasks: [{ id: "t1" }, { id: "t2" }],
  ...over,
});

const pedido = (over: Partial<AvancePedido> = {}): AvancePedido => ({
  phaseIds: [],
  taskIds: [],
  suspendedTaskIds: [],
  currentPhaseId: null,
  ...over,
});

describe("acotarAlBorrador", () => {
  test("lo que el borrador propuso pasa entero", () => {
    const r = acotarAlBorrador(pedido({ phaseIds: ["f1"], taskIds: ["t1", "t2"], currentPhaseId: "f-hoy" }), borrador());
    expect(r.phaseIds).toEqual(["f1"]);
    expect(r.taskIds).toEqual(["t1", "t2"]);
    expect(r.currentPhaseId).toBe("f-hoy");
    expect(r.ignorados).toEqual([]);
  });

  test("⛔ una tarea que la IA NUNCA propuso no se confirma — se ignora y se reporta", () => {
    const r = acotarAlBorrador(pedido({ taskIds: ["t1", "colada"] }), borrador());
    expect(r.taskIds, "solo la del borrador").toEqual(["t1"]);
    expect(r.ignorados).toContain("colada");
  });

  test("⛔ una FASE que no está en el borrador tampoco cierra", () => {
    const r = acotarAlBorrador(pedido({ phaseIds: ["f1", "otra"] }), borrador());
    expect(r.phaseIds).toEqual(["f1"]);
    expect(r.ignorados).toContain("otra");
  });

  test("⛔ el `currentPhaseId` tiene que ser EL del borrador, no cualquiera", () => {
    const r = acotarAlBorrador(pedido({ currentPhaseId: "inventada" }), borrador());
    expect(r.currentPhaseId).toBeNull();
    expect(r.ignorados).toContain("inventada");
  });

  test("⛔ SIN borrador no se confirma absolutamente nada", () => {
    // El caso que más miente: no hay nada que la IA haya detectado, así que ningún id puede
    // quedar firmado AI_CONFIRMED.
    const r = acotarAlBorrador(
      pedido({ phaseIds: ["f1"], taskIds: ["t1"], suspendedTaskIds: ["t9"], currentPhaseId: "f-hoy" }),
      null,
    );
    expect(r.phaseIds).toEqual([]);
    expect(r.taskIds).toEqual([]);
    expect(r.suspendedTaskIds).toEqual([]);
    expect(r.currentPhaseId).toBeNull();
    expect(r.ignorados).toEqual(["f1", "t1", "t9"]);
  });

  test("las SUSPENDIDAS pasan aunque no estén en el borrador (son decisión del humano)", () => {
    /* A propósito, y no es un descuido: el borrador nunca propone suspensiones, y la regla de
       cierre exige resolver TODAS las tareas de una fase que se cierra — incluidas las que el
       agente ni mencionó. Acotarlas dejaría fases imposibles de cerrar. */
    const r = acotarAlBorrador(pedido({ suspendedTaskIds: ["fuera-del-borrador"] }), borrador());
    expect(r.suspendedTaskIds).toEqual(["fuera-del-borrador"]);
    expect(r.ignorados, "no se reportan como ignoradas: sí se aplican").toEqual([]);
  });

  test("un borrador vacío (sin fases ni tareas) no habilita nada", () => {
    const r = acotarAlBorrador(pedido({ phaseIds: ["f1"], taskIds: ["t1"] }), borrador({ phases: [], tasks: [] }));
    expect(r.phaseIds).toEqual([]);
    expect(r.taskIds).toEqual([]);
    expect(r.ignorados).toEqual(["f1", "t1"]);
  });
});
