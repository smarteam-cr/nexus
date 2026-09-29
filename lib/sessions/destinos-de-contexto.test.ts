import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import {
  alimenta,
  excluidaAMano,
  forzadaAMano,
  linkFeedsDiagnosis,
  origenDelVinculo,
  parseDestino,
  sugiereConElCliente,
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
  diagnosisOverride: null,
  planningOverride: null,
  implementationOverride: null,
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

describe("el DIAGNÓSTICO arranca sugerido", () => {
  it("sin tocar, entra si fue con el cliente — y no entra si fue puertas adentro", () => {
    /* Decisión de Elías (2026-09-28): si arrancara vacío como el cronograma, el primer diagnóstico
       saldría sin reuniones cada vez que el CSE se olvida de elegir. */
    expect(alimenta("diagnostico", base, true)).toBe(true);
    expect(alimenta("diagnostico", base, false)).toBe(false);
  });

  it("la X saca aunque sea con el cliente; «Agregar» mete aunque no lo sea; el tombstone manda", () => {
    expect(alimenta("diagnostico", { ...base, diagnosisOverride: false }, true)).toBe(false);
    expect(alimenta("diagnostico", { ...base, diagnosisOverride: true }, false)).toBe(true);
    expect(alimenta("diagnostico", { ...base, included: false, diagnosisOverride: true }, true)).toBe(false);
    expect(excluidaAMano("diagnostico", { ...base, diagnosisOverride: false })).toBe(true);
    expect(forzadaAMano("diagnostico", { ...base, diagnosisOverride: true })).toBe(true);
  });

  it("no lo mueven el afinado del handoff ni el del cronograma — ni el suyo mueve a los otros", () => {
    expect(alimenta("diagnostico", { ...base, handoffOverride: false, timelineOverride: false }, true)).toBe(true);
    expect(alimenta("diagnostico", { ...base, handoffOverride: true, timelineOverride: true }, false)).toBe(false);
    expect(alimenta("cronograma", { ...base, diagnosisOverride: true }, true)).toBe(false);
    expect(excluidaAMano("handoff", { ...base, diagnosisOverride: false })).toBe(false);
  });

  it("dice por qué alimenta con sus palabras", () => {
    expect(origenDelVinculo("diagnostico", base)).toBe("sugerida: reunión con el cliente");
    expect(origenDelVinculo("diagnostico", { ...base, diagnosisOverride: true })).toBe("agregada a mano");
    expect(sugiereConElCliente("diagnostico")).toBe(true);
    expect(sugiereConElCliente("handoff")).toBe(false);
    expect(usaReglaDeRelevancia("diagnostico")).toBe(false);
  });

  it("linkFeedsDiagnosis es la misma regla que el panel (la que lee el runner)", () => {
    for (const v of COMBINACIONES)
      for (const conCliente of [true, false])
        expect(linkFeedsDiagnosis(v, conCliente)).toBe(alimenta("diagnostico", v, conCliente));
  });
});

describe("PLANIFICACIÓN y EJECUCIÓN: la misma regla sugerida, cada una en su columna", () => {
  it("sin tocar, entra si fue con el cliente", () => {
    for (const d of ["planificacion", "ejecucion"] as const) {
      expect(alimenta(d, base, true)).toBe(true);
      expect(alimenta(d, base, false)).toBe(false);
      expect(sugiereConElCliente(d)).toBe(true);
      expect(origenDelVinculo(d, base)).toBe("sugerida: reunión con el cliente");
    }
  });

  it("⛔ sacar de un documento NO saca de los otros", () => {
    const sacadaDeLaPlanificacion = { ...base, planningOverride: false };
    expect(alimenta("planificacion", sacadaDeLaPlanificacion, true)).toBe(false);
    expect(alimenta("ejecucion", sacadaDeLaPlanificacion, true)).toBe(true);
    expect(alimenta("diagnostico", sacadaDeLaPlanificacion, true)).toBe(true);
    const sacadaDelDiagnostico = { ...base, diagnosisOverride: false };
    expect(alimenta("planificacion", sacadaDelDiagnostico, true)).toBe(true);
    expect(excluidaAMano("ejecucion", { ...base, implementationOverride: false })).toBe(true);
    expect(forzadaAMano("ejecucion", { ...base, implementationOverride: true })).toBe(true);
  });

  it("parseDestino los reconoce", () => {
    expect(parseDestino("planificacion")).toBe("planificacion");
    expect(parseDestino("ejecucion")).toBe("ejecucion");
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
