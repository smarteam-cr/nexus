import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import {
  COLUMNA_DEL_DESTINO,
  DESTINOS_DE_DOCUMENTO,
  DESTINOS_SOLO_ELEGIDAS,
  alimenta,
  desestimadaPorElCse,
  esSoloElegidas,
  excluidaAMano,
  forzadaAMano,
  linkFeedsDocumento,
  linkFeedsExploracion,
  origenDelVinculo,
  parseDestino,
  sugiereConElCliente,
  usaReglaDeRelevancia,
  valorDelAfinado,
  type VinculoDelPanel,
} from "./destinos-de-contexto";

/**
 * lib/sessions/destinos-de-contexto.test.ts — UN PANEL, VARIAS REGLAS, CERO CRUCES.
 *
 * Las formas de romper esto son silenciosas:
 *  · el HANDOFF cambia de comportamiento al pasar por el módulo nuevo — su panel dice que alimenta
 *    una reunión y el documento no la lee (o al revés);
 *  · el CRONOGRAMA hereda la regla de relevancia del handoff y pierde justo las reuniones de
 *    implementación, las semanales y las de revisión;
 *  · (etapa 7) un DOCUMENTO vuelve a la regla sugerida y lee reuniones que nadie eligió, o algo
 *    escribe `true` (el candado humano) sin que una persona lo pida.
 */

const base: VinculoDelPanel = {
  included: true,
  isPrimary: false,
  confidence: null,
  handoffOverride: null,
  timelineOverride: null,
  diagnosisOverride: null,
  planningOverride: null,
  implementationOverride: null,
  kickoffOverride: null,
  explorationOverride: null,
  techRequirementsOverride: null,
  deliveryOverride: null,
};

/** Todas las combinaciones que importan, para comparar contra la regla ORIGINAL del handoff. */
const COMBINACIONES: VinculoDelPanel[] = [];
for (const included of [true, false])
  for (const isPrimary of [true, false])
    for (const confidence of [null, 0.2, 0.9])
      for (const handoffOverride of [null, true, false])
        for (const timelineOverride of [null, true, false])
          for (const diagnosisOverride of [null, true, false])
            for (const planningOverride of [null, true, false])
              COMBINACIONES.push({
                included, isPrimary, confidence, handoffOverride, timelineOverride, diagnosisOverride,
                planningOverride, implementationOverride: planningOverride === null ? null : !planningOverride,
                // Las cuatro del 2026-10-07 varían con las de arriba: el handoff tampoco las puede mirar.
                kickoffOverride: diagnosisOverride,
                explorationOverride: timelineOverride,
                techRequirementsOverride: handoffOverride,
                deliveryOverride: planningOverride,
              });

describe("el HANDOFF no cambia ni una coma", () => {
  it("alimenta igual que la regla original, en las 972 combinaciones × aplica/no aplica", () => {
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
  it("entra SOLO la que el CSE eligió — ya no entran todas las del proyecto", () => {
    /* Segunda versión (2026-09-23, pedido de Elías): la primera dejaba entrar las 61 reuniones del
       proyecto y el CSE sacaba con la X. Volver a eso es el modo de falla silencioso. */
    expect(alimenta("cronograma", { ...base, timelineOverride: true }, false)).toBe(true);
    expect(alimenta("cronograma", base, true)).toBe(false);
    expect(alimenta("cronograma", { ...base, isPrimary: true, confidence: 0.9 }, true)).toBe(false);
  });

  it("no mira la regla del handoff ni su afinado — y el tombstone manda sobre todo", () => {
    /* Una semanal de implementación: el handoff la descarta por título (aplica=false) y el
       cronograma la lee igual si el CSE la eligió. */
    expect(alimenta("cronograma", { ...base, timelineOverride: true, confidence: 0.1 }, false)).toBe(true);
    expect(alimenta("cronograma", { ...base, timelineOverride: true, handoffOverride: false }, true)).toBe(true);
    expect(alimenta("cronograma", { ...base, handoffOverride: true }, true)).toBe(false);
    expect(alimenta("cronograma", { ...base, included: false, timelineOverride: true }, true)).toBe(false);
  });

  it("no hay lista de «excluidas»: sacar es dejar de elegir", () => {
    /* Un `false` de la primera versión no puede reaparecer como «Excluida» con un botón que la
       vuelve a meter: vuelve al buscador como cualquier otra reunión del proyecto. */
    expect(excluidaAMano("cronograma", { ...base, timelineOverride: false })).toBe(false);
    expect(excluidaAMano("cronograma", { ...base, handoffOverride: false })).toBe(false);
    expect(forzadaAMano("cronograma", { ...base, timelineOverride: true })).toBe(true);
    expect(origenDelVinculo("cronograma", { ...base, timelineOverride: true })).toBe("elegida para el cronograma");
  });

  it("no usa la regla de relevancia (ni el chip «aplica» del buscador)", () => {
    expect(usaReglaDeRelevancia("cronograma")).toBe(false);
    expect(usaReglaDeRelevancia("handoff")).toBe(true);
  });
});

describe("⭐ LOS SEIS DOCUMENTOS leen SOLO LAS ELEGIDAS (etapa 7)", () => {
  /* DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas» (2026-10-09). La regla vieja
     —«sin tocar, entra si fue con el cliente»— metía por defecto las llamadas de venta, con precios, en
     documentos que ve el cliente. Volver a ella es el modo de falla silencioso: el panel y el lector
     dirían que alimenta una reunión que nadie eligió. */
  const SEIS = ["diagnostico", "planificacion", "ejecucion", "kickoff", "integraciones", "entrega"] as const;

  it("la lista es exactamente esa: todos los documentos menos la exploración", () => {
    expect([...DESTINOS_SOLO_ELEGIDAS].sort()).toEqual([...SEIS].sort());
    expect(DESTINOS_DE_DOCUMENTO.filter((d) => !esSoloElegidas(d))).toEqual(["exploracion"]);
    expect(esSoloElegidas("cronograma")).toBe(false);
    expect(esSoloElegidas("handoff")).toBe(false);
  });

  it("sin tocar NO entra, aunque sea con el cliente; `true` entra; `false` no entra", () => {
    for (const d of SEIS) {
      const columna = COLUMNA_DEL_DESTINO[d];
      expect(alimenta(d, base, true), d).toBe(false);
      expect(alimenta(d, base, false), d).toBe(false);
      expect(alimenta(d, { ...base, isPrimary: true, confidence: 0.9 }, true), d).toBe(false);
      expect(alimenta(d, { ...base, [columna]: true }, false), d).toBe(true);
      expect(alimenta(d, { ...base, [columna]: false }, true), d).toBe(false);
      // El tombstone manda sobre todo.
      expect(alimenta(d, { ...base, included: false, [columna]: true }, true), d).toBe(false);
    }
  });

  it("`false` se muestra como desestimada, no como «Excluida»; sin «excluidas» ni regla de relevancia", () => {
    for (const d of SEIS) {
      const columna = COLUMNA_DEL_DESTINO[d];
      expect(desestimadaPorElCse(d, { ...base, [columna]: false }), d).toBe(true);
      expect(desestimadaPorElCse(d, base), d).toBe(false);
      expect(desestimadaPorElCse(d, { ...base, [columna]: true }), d).toBe(false);
      expect(desestimadaPorElCse(d, { ...base, included: false, [columna]: false }), d).toBe(false);
      expect(excluidaAMano(d, { ...base, [columna]: false }), d).toBe(false);
      expect(forzadaAMano(d, { ...base, [columna]: true }), d).toBe(true);
      expect(sugiereConElCliente(d), d).toBe(false);
      expect(usaReglaDeRelevancia(d), d).toBe(false);
    }
    // Desestimar es solo de los seis: el cronograma y el handoff no tienen sugerencias calculadas.
    expect(desestimadaPorElCse("cronograma", { ...base, timelineOverride: false })).toBe(false);
    expect(desestimadaPorElCse("handoff", { ...base, handoffOverride: false })).toBe(false);
  });

  it("dice por qué alimenta con sus palabras: «elegida para …»", () => {
    expect(origenDelVinculo("diagnostico", { ...base, diagnosisOverride: true })).toBe("elegida para el diagnóstico");
    expect(origenDelVinculo("planificacion", { ...base, planningOverride: true })).toBe("elegida para la planificación");
    expect(origenDelVinculo("ejecucion", { ...base, implementationOverride: true })).toBe("elegida para la ejecución");
    expect(origenDelVinculo("kickoff", { ...base, kickoffOverride: true })).toBe("elegida para el kickoff");
    expect(origenDelVinculo("integraciones", { ...base, techRequirementsOverride: true })).toBe(
      "elegida para el documento de integraciones",
    );
    expect(origenDelVinculo("entrega", { ...base, deliveryOverride: true })).toBe("elegida para la entrega");
  });

  it("⛔ elegir o sacar de un documento NO mueve los otros (ni el handoff ni el cronograma)", () => {
    const elegidaParaElDiagnostico = { ...base, diagnosisOverride: true };
    expect(alimenta("diagnostico", elegidaParaElDiagnostico, false)).toBe(true);
    for (const d of SEIS.filter((x) => x !== "diagnostico")) expect(alimenta(d, elegidaParaElDiagnostico, true), d).toBe(false);
    expect(alimenta("cronograma", elegidaParaElDiagnostico, true)).toBe(false);
    expect(alimenta("exploracion", { ...base, diagnosisOverride: false }, true)).toBe(true);
    const elegidaEnTodos = Object.fromEntries(SEIS.map((d) => [COLUMNA_DEL_DESTINO[d], true]));
    const sacadaDelKickoff = { ...base, ...elegidaEnTodos, kickoffOverride: null };
    expect(alimenta("kickoff", sacadaDelKickoff, true)).toBe(false);
    for (const d of SEIS.filter((x) => x !== "kickoff")) expect(alimenta(d, sacadaDelKickoff, false), d).toBe(true);
    expect(excluidaAMano("handoff", { ...base, kickoffOverride: false })).toBe(false);
  });

  it("linkFeedsDocumento es la misma regla que el panel (la que lee `getProjectDocumentSessions`)", () => {
    for (const v of COMBINACIONES)
      for (const d of SEIS)
        for (const aplica of [true, false])
          expect(linkFeedsDocumento({ included: v.included, override: v[COLUMNA_DEL_DESTINO[d]] }), JSON.stringify({ d, v })).toBe(
            alimenta(d, v, aplica),
          );
  });

  it("parseDestino los reconoce", () => {
    for (const d of SEIS) expect(parseDestino(d)).toBe(d);
  });
});

describe("la EXPLORACIÓN conserva la regla sugerida mientras siga en el módulo", () => {
  it("sin tocar, entra si fue con el cliente; la X saca; «Agregar» mete; el tombstone manda", () => {
    expect(alimenta("exploracion", base, true)).toBe(true);
    expect(alimenta("exploracion", base, false)).toBe(false);
    expect(alimenta("exploracion", { ...base, explorationOverride: false }, true)).toBe(false);
    expect(alimenta("exploracion", { ...base, explorationOverride: true }, false)).toBe(true);
    expect(alimenta("exploracion", { ...base, included: false, explorationOverride: true }, true)).toBe(false);
    expect(excluidaAMano("exploracion", { ...base, explorationOverride: false })).toBe(true);
    expect(desestimadaPorElCse("exploracion", { ...base, explorationOverride: false })).toBe(false);
    expect(sugiereConElCliente("exploracion")).toBe(true);
    expect(origenDelVinculo("exploracion", base)).toBe("sugerida: reunión con el cliente");
    expect(origenDelVinculo("exploracion", { ...base, explorationOverride: true })).toBe("agregada a mano");
  });

  it("linkFeedsExploracion es la regla que el panel le aplica", () => {
    for (const v of COMBINACIONES)
      for (const conCliente of [true, false])
        expect(linkFeedsExploracion({ included: v.included, override: v.explorationOverride }, conCliente)).toBe(
          alimenta("exploracion", v, conCliente),
        );
  });

  it("cada documento lee SU columna", () => {
    expect(COLUMNA_DEL_DESTINO.kickoff).toBe("kickoffOverride");
    expect(COLUMNA_DEL_DESTINO.exploracion).toBe("explorationOverride");
    expect(COLUMNA_DEL_DESTINO.integraciones).toBe("techRequirementsOverride");
    expect(COLUMNA_DEL_DESTINO.entrega).toBe("deliveryOverride");
  });
});

describe("qué escribe la puerta de un documento (valorDelAfinado)", () => {
  it("en los seis: «Usar» → true; la X → null (como el cronograma); «Descartar» → false (sin candado)", () => {
    for (const d of DESTINOS_SOLO_ELEGIDAS) {
      expect(valorDelAfinado(d, { feeds: true, desestimar: false, sugerida: false }), d).toBe(true);
      // Deshacer una X también es elegir: «sugerida» ya no existe para estos documentos.
      expect(valorDelAfinado(d, { feeds: true, desestimar: false, sugerida: true }), d).toBe(true);
      expect(valorDelAfinado(d, { feeds: false, desestimar: false, sugerida: false }), d).toBe(null);
      expect(valorDelAfinado(d, { feeds: false, desestimar: false, sugerida: true }), d).toBe(null);
      expect(valorDelAfinado(d, { feeds: false, desestimar: true, sugerida: false }), d).toBe(false);
    }
  });

  it("⛔ nada escribe `true` sin un pedido de elegir (`true` es el candado humano)", () => {
    for (const d of DESTINOS_DE_DOCUMENTO)
      for (const desestimar of [true, false])
        for (const sugerida of [true, false])
          expect(valorDelAfinado(d, { feeds: false, desestimar, sugerida }), JSON.stringify({ d, desestimar, sugerida })).not.toBe(true);
  });

  it("en la exploración, la regla de antes: la X → false; deshacer la X de una sugerida → null; agregar → true", () => {
    expect(valorDelAfinado("exploracion", { feeds: false, desestimar: false, sugerida: false })).toBe(false);
    expect(valorDelAfinado("exploracion", { feeds: true, desestimar: false, sugerida: true })).toBe(null);
    expect(valorDelAfinado("exploracion", { feeds: true, desestimar: false, sugerida: false })).toBe(true);
  });

  it("la ruta escribe con esta función, no por su cuenta", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/projects/[projectId]/contexto/[pieza]/sessions/route.ts"), "utf8");
    expect(src).toContain("valorDelAfinado(doc.destino,");
    expect(src).not.toMatch(/\[columna\]:\s*false/);
  });
});

describe("el destino por defecto es el histórico", () => {
  it("sin `?para=` o con basura, es el handoff", () => {
    expect(parseDestino(null)).toBe("handoff");
    expect(parseDestino("")).toBe("handoff");
    expect(parseDestino("otra-cosa")).toBe("handoff");
    expect(parseDestino("cronograma")).toBe("cronograma");
    expect(parseDestino("diagnostico")).toBe("diagnostico");
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
