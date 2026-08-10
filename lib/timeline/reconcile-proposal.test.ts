/**
 * lib/timeline/reconcile-proposal.test.ts
 *
 * Correr: `npx vitest run lib/timeline/reconcile-proposal.test.ts --project unit`.
 */
import { describe, test, expect } from "vitest";
import {
  reconcileAgentProposal,
  type ExistingPhaseForReconcile,
  type AgentProposedPhase,
} from "./reconcile-proposal";
import { computeProposalDeltas, type CurrentPhaseLike } from "./proposal-deltas";

const ph = (over: Partial<ExistingPhaseForReconcile> & { id: string; name: string }): ExistingPhaseForReconcile => ({
  durationWeeks: 2,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  ...over,
});

const prop = (over: Partial<AgentProposedPhase> & { name: string }): AgentProposedPhase => ({
  durationWeeks: 2,
  startWeek: null,
  sessionCount: null,
  notes: null,
  ...over,
});

describe("reconcileAgentProposal", () => {
  test("propuesta idéntica (mismo nombre/duración/orden) → isNoOp", () => {
    const existing = [ph({ id: "p1", name: "Relevamiento" }), ph({ id: "p2", name: "Diseño" })];
    const r = reconcileAgentProposal(
      [prop({ name: "Relevamiento" }), prop({ name: "Diseño" })],
      existing,
      "2026-06-01T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    );
    expect(r.isNoOp).toBe(true);
    expect(r.phases.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  test("mismas fases, el agente las propone en OTRO orden → isNoOp=false (aunque el contenido por id no cambió)", () => {
    const existing = [ph({ id: "p1", name: "Relevamiento" }), ph({ id: "p2", name: "Diseño" })];
    const r = reconcileAgentProposal(
      [prop({ name: "Diseño" }), prop({ name: "Relevamiento" })],
      existing,
      null,
      null,
    );
    expect(r.isNoOp).toBe(false);
    expect(r.phases.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  test("fase nueva sin match sale sin id", () => {
    const existing = [ph({ id: "p1", name: "Relevamiento" })];
    const r = reconcileAgentProposal(
      [prop({ name: "Relevamiento" }), prop({ name: "Entrega" })],
      existing,
      null,
      null,
    );
    expect(r.phases[0].id).toBe("p1");
    expect(r.phases[1].id).toBeUndefined();
    expect(r.phases[1].name).toBe("Entrega");
    expect(r.isNoOp).toBe(false);
  });

  test("fase existente no matcheada por el agente se re-emite idéntica al final (nunca se borra)", () => {
    const existing = [ph({ id: "p1", name: "Relevamiento" }), ph({ id: "p2", name: "QA manual" })];
    const r = reconcileAgentProposal([prop({ name: "Relevamiento" })], existing, null, null);
    expect(r.phases.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.phases[1].name).toBe("QA manual");
  });

  test("match por posición cuando el nombre no coincide con nada (el agente renombró la fase 0)", () => {
    const existing = [ph({ id: "p1", name: "Relevamiento" }), ph({ id: "p2", name: "Diseño" })];
    const r = reconcileAgentProposal(
      [prop({ name: "Descubrimiento" }), prop({ name: "Diseño" })],
      existing,
      null,
      null,
    );
    // La 0 no matchea por nombre → cae por posición a "p1" (se renombra al aplicar).
    expect(r.phases[0].id).toBe("p1");
    expect(r.phases[0].name).toBe("Descubrimiento");
    expect(r.phases[1].id).toBe("p2");
  });

  test("cambia el ancla resuelto vs. el existente → isNoOp=false aunque las fases sean iguales", () => {
    const existing = [ph({ id: "p1", name: "Relevamiento" })];
    const r = reconcileAgentProposal([prop({ name: "Relevamiento" })], existing, null, "2026-07-01T00:00:00.000Z");
    expect(r.isNoOp).toBe(false);
    expect(r.anchorStartDate).toBe("2026-07-01T00:00:00.000Z");
  });

  test("⚠ el agente dejó de proponer una fase existente, pero SIGUE siendo no-op: se re-emite idéntica (aditivo)", () => {
    // No es un bug — es el punto (2) del docblock: "las existentes sin match se re-emiten
    // idénticas". El agente proponiendo un SUBCONJUNTO no borra nada, así que si ese subconjunto
    // tampoco trae cambios, el resultado final es byte-idéntico a lo existente.
    const existing = [ph({ id: "p1", name: "Relevamiento" }), ph({ id: "p2", name: "QA manual" })];
    const r = reconcileAgentProposal([prop({ name: "Relevamiento" })], existing, null, null);
    expect(r.phases.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.isNoOp).toBe(true);
  });

  // ── El test que cierra el hueco de verdad: todo caso NO-op según reconcileAgentProposal
  // tiene que producir >=1 delta real en computeProposalDeltas (la MISMA función que usa el
  // frontend para decidir si hay algo que mostrar). Si algún escenario lo rompe, se ve acá.
  describe("isNoOp=false siempre produce >=1 delta real en computeProposalDeltas", () => {
    const casos: Array<{ nombre: string; existing: ExistingPhaseForReconcile[]; proposed: AgentProposedPhase[]; existingAnchorISO: string | null; resolvedAnchorISO: string | null }> = [
      {
        nombre: "reorden puro",
        existing: [ph({ id: "p1", name: "Relevamiento" }), ph({ id: "p2", name: "Diseño" })],
        proposed: [prop({ name: "Diseño" }), prop({ name: "Relevamiento" })],
        existingAnchorISO: null, resolvedAnchorISO: null,
      },
      {
        nombre: "fase nueva agregada",
        existing: [ph({ id: "p1", name: "Relevamiento" })],
        proposed: [prop({ name: "Relevamiento" }), prop({ name: "Entrega" })],
        existingAnchorISO: null, resolvedAnchorISO: null,
      },
      {
        nombre: "duración cambiada en una fase matcheada por nombre",
        existing: [ph({ id: "p1", name: "Relevamiento", durationWeeks: 2 })],
        proposed: [prop({ name: "Relevamiento", durationWeeks: 4 })],
        existingAnchorISO: null, resolvedAnchorISO: null,
      },
      {
        nombre: "renombre por posición (match sin nombre en común)",
        existing: [ph({ id: "p1", name: "Relevamiento" })],
        proposed: [prop({ name: "Descubrimiento inicial" })],
        existingAnchorISO: null, resolvedAnchorISO: null,
      },
      {
        nombre: "solo cambia el ancla resuelto",
        existing: [ph({ id: "p1", name: "Relevamiento" })],
        proposed: [prop({ name: "Relevamiento" })],
        existingAnchorISO: null, resolvedAnchorISO: "2026-07-01T00:00:00.000Z",
      },
    ];

    for (const c of casos) {
      test(c.nombre, () => {
        const r = reconcileAgentProposal(c.proposed, c.existing, c.existingAnchorISO, c.resolvedAnchorISO);
        expect(r.isNoOp, `${c.nombre}: se esperaba isNoOp=false`).toBe(false);

        const current: CurrentPhaseLike[] = c.existing.map((e) => ({
          id: e.id, name: e.name, durationWeeks: e.durationWeeks, startWeek: e.startWeek,
          sessionCount: e.sessionCount, notes: e.notes, activityType: e.activityType,
        }));
        const deltas = computeProposalDeltas(
          current,
          { anchorStartDate: r.anchorStartDate, phases: r.phases },
          c.existingAnchorISO,
        );
        expect(deltas.length, `${c.nombre}: reconcileAgentProposal dijo que HAY cambio, pero computeProposalDeltas no ve ningún delta — el CSE no vería nada`).toBeGreaterThan(0);
      });
    }
  });
});
