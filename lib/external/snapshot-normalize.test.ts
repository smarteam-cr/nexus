/**
 * lib/external/snapshot-normalize.test.ts
 *
 * Fija el saneo de snapshots congelados. El bug que corrige: /external/kickoff
 * — LA PÁGINA QUE VEN LOS CLIENTES — tiró TypeError durante una semana (~70
 * eventos en Sentry) porque snapshots publicados viejos traían secciones sin el
 * array `blocks`, y el código las leía con un cast crudo.
 */
import { test, expect } from "vitest";
import { normalizeKickoffSnapshot, normalizePublishedTimeline } from "./snapshot-normalize";
import { comparaSectionHasContent } from "@/components/canvas/kickoff-landing-adapter";

// ── Kickoff ──────────────────────────────────────────────────────────────────

test("raw inusable → null (dispara el backfill perezoso, no un crash)", () => {
  expect(normalizeKickoffSnapshot(null)).toBeNull();
  expect(normalizeKickoffSnapshot(undefined)).toBeNull();
  expect(normalizeKickoffSnapshot("garbage")).toBeNull();
  expect(normalizeKickoffSnapshot(42)).toBeNull();
  expect(normalizeKickoffSnapshot([1, 2])).toBeNull();
});

test("objeto vacío → arrays vacíos, no null (hay snapshot, solo que viejo)", () => {
  expect(normalizeKickoffSnapshot({})).toEqual({ sections: [], procesos: [] });
});

// EL repro del bug de producción: sección sin `blocks`.
test("sección sin blocks → blocks: [] (el fix)", () => {
  const snap = normalizeKickoffSnapshot({
    sections: [{ id: "s1", key: "hero", label: "Hero", order: 0 }],
  })!;
  expect(snap.sections).toHaveLength(1);
  expect(snap.sections[0].blocks).toEqual([]);
});

test("blocks corrupto (string, o con ítems null) → se sanea", () => {
  const snap = normalizeKickoffSnapshot({
    sections: [
      { id: "s1", key: "a", blocks: "no soy un array" },
      { id: "s2", key: "b", blocks: [null, { blockType: "CARD", content: "ok" }, "x"] },
    ],
  })!;
  expect(snap.sections[0].blocks).toEqual([]);
  expect(snap.sections[1].blocks).toHaveLength(1);
  expect(snap.sections[1].blocks[0].blockType).toBe("CARD");
});

test("sección basura (sin id/key) se descarta; la válida pasa INTACTA", () => {
  const valida = {
    id: "s1", key: "equipo", label: "Equipo", titleOverride: "Tu equipo",
    eyebrowOverride: null, order: 3,
    blocks: [{ id: "b1", blockType: "CARD", content: "hola", data: { x: 1 } }],
  };
  const snap = normalizeKickoffSnapshot({ sections: [{ label: "sin id" }, valida, null] })!;
  expect(snap.sections).toHaveLength(1);
  expect(snap.sections[0]).toEqual(valida);
});

test("procesos: no-array → [], filas sin id → descartadas", () => {
  expect(normalizeKickoffSnapshot({ procesos: "x" })!.procesos).toEqual([]);
  const snap = normalizeKickoffSnapshot({
    procesos: [{ id: "p1", nombre: "Onboarding" }, { nombre: "sin id" }, null],
  })!;
  expect(snap.procesos).toHaveLength(1);
  expect(snap.procesos[0].id).toBe("p1");
});

// Regresión de punta a punta: el PRIMER crash real de producción fue
// comparaSectionHasContent → row.blocks.find sobre una sección sin blocks.
test("regresión: comparaSectionHasContent no lanza sobre un snapshot saneado", () => {
  const snap = normalizeKickoffSnapshot({
    sections: [{ id: "s1", key: "hoy_vs_sistema", label: "Comparación", order: 1 }],
  })!;
  expect(() =>
    comparaSectionHasContent(snap.sections as Parameters<typeof comparaSectionHasContent>[0]),
  ).not.toThrow();
});

// ── Timeline ─────────────────────────────────────────────────────────────────

test("timeline: raw inusable → shape vacío usable, nunca lanza", () => {
  expect(normalizePublishedTimeline(null)).toEqual({ exists: false, anchorStartDate: null, phases: [] });
  expect(normalizePublishedTimeline("x")).toEqual({ exists: false, anchorStartDate: null, phases: [] });
});

test("timeline: snapshot sin phases → phases: []", () => {
  const t = normalizePublishedTimeline({ exists: true, anchorStartDate: "2026-06-01" });
  expect(t.exists).toBe(true);
  expect(t.anchorStartDate).toBe("2026-06-01");
  expect(t.phases).toEqual([]);
});

test("timeline: particularidades solo se emite si es array (snapshots pre-feature → undefined)", () => {
  expect(normalizePublishedTimeline({ phases: [] }).particularidades).toBeUndefined();
  const con = normalizePublishedTimeline({ phases: [], particularidades: [{ kind: "ATRASO" }, null] });
  expect(con.particularidades).toHaveLength(1);
});

test("timeline: snapshot válido pasa intacto", () => {
  const t = normalizePublishedTimeline({
    exists: true,
    anchorStartDate: "2026-05-19",
    phases: [{ id: "f1", name: "Sales Hub", durationWeeks: 4, tasks: [] }],
  });
  expect(t.phases).toHaveLength(1);
  expect(t.phases[0].name).toBe("Sales Hub");
});
