import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import {
  alimenta,
  excluidaAMano,
  forzadaAMano,
  origenDelVinculo,
  parseDestino,
  usaReglaDeRelevancia,
  type VinculoDelPanel,
} from "./destinos-de-contexto";

/**
 * lib/sessions/destinos-de-contexto.test.ts — UN PANEL, DOS REGLAS, CERO CRUCES.
 *
 * Las dos formas de romper esto son silenciosas:
 *  · el HANDOFF cambia de comportamiento al pasar por el módulo nuevo — su panel dice que alimenta
 *    una reunión y el documento no la lee (o al revés);
 *  · el CRONOGRAMA hereda la regla de relevancia del handoff y pierde justo las reuniones de
 *    implementación, las semanales y las de revisión.
 */

const base: VinculoDelPanel = {
  included: true,
  isPrimary: false,
  confidence: null,
  handoffOverride: null,
  timelineOverride: null,
};

/** Todas las combinaciones que importan, para comparar contra la regla ORIGINAL del handoff. */
const COMBINACIONES: VinculoDelPanel[] = [];
for (const included of [true, false])
  for (const isPrimary of [true, false])
    for (const confidence of [null, 0.2, 0.9])
      for (const handoffOverride of [null, true, false])
        for (const timelineOverride of [null, true, false])
          COMBINACIONES.push({ included, isPrimary, confidence, handoffOverride, timelineOverride });

describe("el HANDOFF no cambia ni una coma", () => {
  it("alimenta igual que la regla original, en las 108 combinaciones × aplica/no aplica", () => {
    for (const v of COMBINACIONES) {
      for (const aplica of [true, false]) {
        const original =
          v.included &&
          linkFeedsHandoff(
            { isPrimary: v.isPrimary, confidence: v.confidence, handoffOverride: v.handoffOverride },
            aplica,
          );
        expect(alimenta("handoff", v, aplica), JSON.stringify({ v, aplica })).toBe(original);
      }
    }
  });

  it("la X y el «Agregar» del cronograma NO mueven el handoff", () => {
    expect(alimenta("handoff", { ...base, isPrimary: true, timelineOverride: false }, true)).toBe(true);
    expect(excluidaAMano("handoff", { ...base, timelineOverride: false })).toBe(false);
    expect(forzadaAMano("handoff", { ...base, timelineOverride: true })).toBe(false);
  });

  it("el origen se dice con las palabras de siempre", () => {
    expect(origenDelVinculo("handoff", { ...base, handoffOverride: true })).toBe("forzada a mano");
    expect(origenDelVinculo("handoff", { ...base, isPrimary: true })).toBe("primaria");
    expect(origenDelVinculo("handoff", base)).toBe("confianza alta");
  });
});

describe("el CRONOGRAMA tiene su propia regla", () => {
  it("toda reunión del proyecto alimenta, AUNQUE la regla del handoff diga que no", () => {
    /* Una semanal de implementación: el handoff la descarta por título (aplica=false) y el
       cronograma la necesita. */
    expect(alimenta("cronograma", base, false)).toBe(true);
    expect(alimenta("cronograma", { ...base, confidence: 0.1 }, false)).toBe(true);
  });

  it("solo la X del cronograma la saca — y el tombstone manda sobre todo", () => {
    expect(alimenta("cronograma", { ...base, timelineOverride: false }, true)).toBe(false);
    expect(alimenta("cronograma", { ...base, included: false, timelineOverride: true }, true)).toBe(false);
    // La X del HANDOFF no la saca del cronograma.
    expect(alimenta("cronograma", { ...base, handoffOverride: false }, true)).toBe(true);
  });

  it("excluida y agregada miran SU afinado", () => {
    expect(excluidaAMano("cronograma", { ...base, timelineOverride: false })).toBe(true);
    expect(excluidaAMano("cronograma", { ...base, handoffOverride: false })).toBe(false);
    expect(forzadaAMano("cronograma", { ...base, timelineOverride: true })).toBe(true);
    expect(origenDelVinculo("cronograma", { ...base, timelineOverride: true })).toBe("agregada a mano");
    expect(origenDelVinculo("cronograma", base)).toBe("reunión del proyecto");
  });

  it("no usa la regla de relevancia (ni el chip «aplica» del buscador)", () => {
    expect(usaReglaDeRelevancia("cronograma")).toBe(false);
    expect(usaReglaDeRelevancia("handoff")).toBe(true);
  });
});

describe("el destino por defecto es el histórico", () => {
  it("sin `?para=` o con basura, es el handoff", () => {
    expect(parseDestino(null)).toBe("handoff");
    expect(parseDestino("")).toBe("handoff");
    expect(parseDestino("otra-cosa")).toBe("handoff");
    expect(parseDestino("cronograma")).toBe("cronograma");
  });
});

describe("la ruta del panel no decide por su cuenta", () => {
  it("session-candidates no llama a la regla del handoff fuera del módulo", () => {
    /* Si la ruta vuelve a llamar `linkFeedsHandoff` directo, el destino cronograma queda con la
       regla del handoff sin que nada lo diga. */
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/projects/[projectId]/session-candidates/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\blinkFeedsHandoff\(/);
    expect(src).toContain("alimenta(");
    expect(src).toContain("excluidaAMano(destino, r)");
  });
});
