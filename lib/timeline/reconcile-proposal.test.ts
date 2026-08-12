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

  test("⚠ el bug mecánico que arregla la Tanda O: una inserción intermedia no debe robarle el id a una fase que matcheaba por nombre más adelante", () => {
    // Con el fallback posicional VIEJO (contra el índice crudo del array), "Prototipado" (una
    // fase nueva genuina, en la posición 2) caía por posición a existingPhases[2] = "Diseño" —
    // que YA iba a matchear por nombre en la posición 3 — y se la robaba. "Diseño" quedaba sin
    // match (su match ya estaba consumido) y salía como fase NUEVA (duplicado), mientras la
    // fase real (con sus tareas y progreso) quedaba renombrada a "Prototipado". Es peor que un
    // duplicado: pisa en silencio una fase existente con el nombre equivocado.
    const existing = [
      ph({ id: "p1", name: "Kickoff" }),
      ph({ id: "p2", name: "Relevamiento" }),
      ph({ id: "p3", name: "Diseño" }),
    ];
    const proposed = [
      prop({ name: "Descubrimiento inicial" }), // sin nombre en común → posición
      prop({ name: "Análisis" }),                // sin nombre en común → posición
      prop({ name: "Prototipado" }),             // fase NUEVA genuina — no debe robarle el id a Diseño
      prop({ name: "Diseño" }),                  // match EXACTO por nombre — debe ganar
    ];
    const r = reconcileAgentProposal(proposed, existing, null, null);

    expect(r.phases[0].id, "Descubrimiento inicial → p1 por posición").toBe("p1");
    expect(r.phases[1].id, "Análisis → p2 por posición").toBe("p2");
    expect(r.phases[2].id, "Prototipado es fase nueva genuina, no debe tener id").toBeUndefined();
    expect(r.phases[3].id, "Diseño matchea por nombre exacto — conserva SU id, p3").toBe("p3");
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

  /* ── LA REGRESIÓN QUE ESTOS TESTS CONGELAN ────────────────────────────────────────────
     La Tanda O agregó un aviso de fusión (`mergeCandidateId`) que RESERVABA la huérfana parecida
     antes del match posicional. Efecto medido: un renombre a un nombre PARECIDO dejaba de
     renombrar en el lugar y salía como fase NUEVA + la vieja huérfana — el duplicado que la
     tanda venía a evitar, y por el camino más usado ("Aceptar todo" nunca mandaba fusiones).
     Paradoja: cuanto MÁS se parecían los nombres, PEOR el resultado. Revertido el 2026-08-11.
     Estos cuatro casos son el candado: si alguien vuelve a meter un paso que consuma huérfanas
     antes del posicional, se ponen rojos. */
  describe("un renombre conserva la fase — por parecido que sea el nombre nuevo", () => {
    test("nombre PARECIDO (el caso real de Wherex) → renombra en su lugar, NO duplica", () => {
      const existing = [ph({ id: "e1", name: "Integraciones" })];
      const r = reconcileAgentProposal([prop({ name: "Desarrollo / Integración" })], existing, null, null);
      expect(r.phases).toHaveLength(1);
      expect(r.phases[0].id, "conserva el id → conserva tareas y progreso").toBe("e1");
      expect(r.phases[0].name).toBe("Desarrollo / Integración");
    });

    test("nombre SIN nada en común → el mismo resultado (el parecido no puede cambiar el desenlace)", () => {
      const existing = [ph({ id: "e1", name: "Integraciones" })];
      const r = reconcileAgentProposal([prop({ name: "Puesta en marcha" })], existing, null, null);
      expect(r.phases).toHaveLength(1);
      expect(r.phases[0].id).toBe("e1");
    });

    test("renombre parecido EN EL MEDIO, con las de los bordes matcheando por nombre", () => {
      const existing = [
        ph({ id: "e1", name: "Kickoff" }),
        ph({ id: "e2", name: "Configuracion Marketing Hub" }),
        ph({ id: "e3", name: "Cierre" }),
      ];
      const r = reconcileAgentProposal(
        [prop({ name: "Kickoff" }), prop({ name: "Marketing Hub" }), prop({ name: "Cierre" })],
        existing,
        null,
        null,
      );
      expect(r.phases.map((p) => p.id)).toEqual(["e1", "e2", "e3"]);
      expect(r.phases[1].name).toBe("Marketing Hub");
    });

    test("desborde: más propuestas que existentes → la sobrante SÍ es fase nueva", () => {
      const existing = [ph({ id: "e1", name: "Sales Hub" })];
      const r = reconcileAgentProposal(
        [prop({ name: "Sales Hub" }), prop({ name: "Service Hub" })],
        existing,
        null,
        null,
      );
      expect(r.phases[0].id).toBe("e1");
      expect(r.phases[1].id, "no hay existente libre: es genuinamente nueva").toBeUndefined();
    });
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
