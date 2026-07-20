/**
 * lib/landing/build-landing.test.ts — GOLDEN del refactor de adaptadores (Ola 5).
 *
 * Congela el comportamiento observable de los adaptadores canvas→motor
 * (kickoff-landing-adapter y desarrollo-landing-adapter) ANTES y DESPUÉS de
 * extraer su núcleo común a components/landing/build-landing.ts. Los expected
 * son literales capturados del adaptador viejo: si este test se rompe, el
 * refactor NO fue puro — no ajustes los literales para "arreglarlo" sin
 * entender qué output de producción se movió.
 *
 * Vive en lib/ (el project unit de vitest solo incluye lib/**). Importa la
 * cadena real de configs (componentes React incluidos) — funciona en env node
 * porque nada se renderiza, solo se comparan keys y data.
 */
import { describe, it, expect } from "vitest";
import {
  buildLandingConfigFromOrder,
  landingRowData,
  type LandingShape,
} from "@/components/landing/build-landing";
import {
  buildKickoffConfig,
  buildKickoffSections,
  kickoffSectionData,
  type KickoffSectionRow,
} from "@/components/canvas/kickoff-landing-adapter";
import {
  buildDesarrolloConfig,
  buildDesarrolloSections,
  type DesarrolloSectionRow,
} from "@/components/canvas/desarrollo-landing-adapter";

const keys = (c: { sections: Array<{ key: string }> }) => c.sections.map((s) => s.key);

// ── Núcleo genérico (defs sintéticas — el algoritmo, aislado de configs reales) ──

describe("buildLandingConfigFromOrder (núcleo)", () => {
  const shape: LandingShape = {
    type: "test",
    // Defs mínimas: solo `key` importa para el orden. El desorden acá es a
    // propósito: manda `orderedKeys`, no el orden de allDefs.
    allDefs: ["c", "hero", "a", "fin", "b"].map((k) => ({ key: k }) as never),
    heroKey: "hero",
    pinnedTail: ["fin"],
  };

  it("hero abre, tail cierra, contenido en el orden pedido", () => {
    expect(keys(buildLandingConfigFromOrder(shape, ["b", "a", "c"]))).toEqual([
      "hero", "b", "a", "c", "fin",
    ]);
  });

  it("keys desconocidas se ignoran; contenido ausente de orderedKeys no se pinta", () => {
    expect(keys(buildLandingConfigFromOrder(shape, ["a", "typo_inexistente"]))).toEqual([
      "hero", "a", "fin",
    ]);
  });

  it("hero/tail dentro de orderedKeys no se duplican ni se mueven", () => {
    expect(keys(buildLandingConfigFromOrder(shape, ["fin", "b", "hero"]))).toEqual([
      "hero", "b", "fin",
    ]);
  });

  it("type viaja tal cual", () => {
    expect(buildLandingConfigFromOrder(shape, []).type).toBe("test");
  });
});

describe("landingRowData (núcleo)", () => {
  it("CARD tipada → su data; CARD sin data → {}", () => {
    expect(
      landingRowData({ key: "x", blocks: [{ blockType: "CARD", data: { items: [1, 2] } }] }, "hero"),
    ).toEqual({ items: [1, 2] });
    expect(landingRowData({ key: "x", blocks: [{ blockType: "CARD" }] }, "hero")).toEqual({});
  });

  it("sin CARD → {__legacyMd} con los TEXT unidos; sin contenido → null", () => {
    expect(
      landingRowData(
        { key: "x", blocks: [{ blockType: "TEXT", content: "a" }, { blockType: "TEXT", content: "b" }] },
        "hero",
      ),
    ).toEqual({ __legacyMd: "a\n\nb" });
    expect(landingRowData({ key: "x", blocks: [] }, "hero")).toEqual({ __legacyMd: null });
  });

  it("hero: overrides entran como headline/eyebrow SIN pisar la data tipada", () => {
    expect(
      landingRowData(
        { key: "hero", titleOverride: "T", eyebrowOverride: "E", blocks: [{ blockType: "CARD", data: {} }] },
        "hero",
      ),
    ).toEqual({ headline: "T", eyebrow: "E" });
    expect(
      landingRowData(
        { key: "hero", titleOverride: "T", blocks: [{ blockType: "CARD", data: { headline: "H" } }] },
        "hero",
      ),
    ).toEqual({ headline: "H", eyebrow: undefined });
  });
});

// ── Golden del adaptador de KICKOFF (expected = output del adaptador viejo) ──

describe("kickoff-landing-adapter (golden)", () => {
  it("config: hero + orden vivo + ctx ausentes al final + cierre", () => {
    expect(keys(buildKickoffConfig(["objetivos", "equipo", "alcance"]))).toEqual([
      "bienvenida", "objetivos", "equipo", "alcance", "cronograma", "procesos", "cierre",
    ]);
  });

  it("config: ctx-driven presentes en el orden vivo se respetan donde están", () => {
    expect(keys(buildKickoffConfig(["cronograma", "objetivos", "procesos"]))).toEqual([
      "bienvenida", "cronograma", "objetivos", "procesos", "cierre",
    ]);
  });

  it("config: key desconocida se ignora; hero/cierre en el orden no duplican", () => {
    expect(keys(buildKickoffConfig(["cierre", "objetivos", "no_existe", "bienvenida"]))).toEqual([
      "bienvenida", "objetivos", "cronograma", "procesos", "cierre",
    ]);
  });

  it("data: CARD tipada / legacy md / hero con overrides", () => {
    expect(
      kickoffSectionData({ key: "objetivos", blocks: [{ blockType: "CARD", data: { items: ["x"] } }] }),
    ).toEqual({ items: ["x"] });
    expect(
      kickoffSectionData({ key: "alcance", blocks: [{ blockType: "TEXT", content: "md viejo" }] }),
    ).toEqual({ __legacyMd: "md viejo" });
    expect(
      kickoffSectionData({
        key: "bienvenida",
        titleOverride: "Bienvenidos",
        eyebrowOverride: "Kickoff",
        blocks: [{ blockType: "CARD", data: {} }],
      }),
    ).toEqual({ headline: "Bienvenidos", eyebrow: "Kickoff" });
  });

  it("de-dup compara: sección propia CON contenido → la prosa pierde su compara", () => {
    const rows: KickoffSectionRow[] = [
      {
        key: "objetivos",
        blocks: [{ blockType: "CARD", data: { md: "texto", compara: { hoy: ["a"], conSistema: ["b"] } } }],
      },
      {
        key: "hoy_vs_sistema",
        blocks: [{ blockType: "CARD", data: { hoy: ["a"], conSistema: ["b"] } }],
      },
    ];
    expect(buildKickoffSections(rows)).toEqual([
      { key: "objetivos", data: { md: "texto" } },
      { key: "hoy_vs_sistema", data: { hoy: ["a"], conSistema: ["b"] } },
    ]);
  });

  it("de-dup compara: sección propia vacía o ausente → la prosa CONSERVA su compara", () => {
    const prose: KickoffSectionRow = {
      key: "objetivos",
      blocks: [{ blockType: "CARD", data: { md: "texto", compara: { hoy: ["a"], conSistema: [] } } }],
    };
    const vacia: KickoffSectionRow = {
      key: "hoy_vs_sistema",
      blocks: [{ blockType: "CARD", data: { hoy: [], conSistema: [] } }],
    };
    expect(buildKickoffSections([prose, vacia])).toEqual([
      { key: "objetivos", data: { md: "texto", compara: { hoy: ["a"], conSistema: [] } } },
      { key: "hoy_vs_sistema", data: { hoy: [], conSistema: [] } },
    ]);
    expect(buildKickoffSections([prose])).toEqual([
      { key: "objetivos", data: { md: "texto", compara: { hoy: ["a"], conSistema: [] } } },
    ]);
  });
});

// ── Golden del adaptador de DESARROLLO (expected = output del adaptador viejo) ──

describe("desarrollo-landing-adapter (golden)", () => {
  it("config: hero + orden vivo + cierre; desconocidas fuera", () => {
    expect(keys(buildDesarrolloConfig(["arquitectura", "retos_cliente", "zzz"]))).toEqual([
      "requerimiento", "arquitectura", "retos_cliente", "cierre",
    ]);
  });

  it("data: CARD tipada / legacy md / hero con overrides", () => {
    const rows: DesarrolloSectionRow[] = [
      {
        key: "requerimiento",
        titleOverride: "Integración SAP",
        blocks: [{ blockType: "TEXT", content: "descripción" }],
      },
      { key: "arquitectura", blocks: [{ blockType: "CARD", data: { nodes: [1] } }] },
    ];
    expect(buildDesarrolloSections(rows)).toEqual([
      {
        key: "requerimiento",
        data: { __legacyMd: "descripción", headline: "Integración SAP", eyebrow: undefined },
      },
      { key: "arquitectura", data: { nodes: [1] } },
    ]);
  });
});
