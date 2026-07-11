/**
 * lib/lifecycle/stage-engine.test.ts
 *
 * Motor puro del ciclo de vida. Invariantes que protege:
 *   - La cascada es determinista: primera salida NO cumplida = etapa actual.
 *   - El kickoff publicado (señal dura) es la ÚNICA salida de HAND_OFF.
 *   - UUS >= umbral cumple VALIDACION_USO aunque nadie marque el gate.
 *   - El override del CSE siempre gana (patrón healthStatusOverride).
 *   - Ciclo corto: HAND_OFF → OPERACION_CONTINUA → ENTREGA/FINALIZADO.
 *
 * Correr: `npx vitest run lib/lifecycle/stage-engine.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  inferLifecycleStage,
  resolveLifecycleStage,
  resolveLifecycleCycle,
  stageAtOrAfter,
  suggestAdoptionMode,
  stagePosition,
  type LifecycleSignals,
} from "./stage-engine";

function signals(overrides: Partial<LifecycleSignals> = {}): LifecycleSignals {
  return {
    cycle: "full",
    projectStatus: "active",
    kickoffPublishedAt: null,
    kickoffSessionAt: null,
    gates: {},
    uusScore: null,
    uusThreshold: 60,
    ...overrides,
  };
}

const d = (s: string) => new Date(s);

test("proyecto recién nacido → HAND_OFF (kickoff sin publicar)", () => {
  const r = inferLifecycleStage(signals());
  expect(r.stage).toBe("HAND_OFF");
  expect(r.reasons.join(" ")).toContain("publicar el kickoff");
});

test("kickoff publicado sin gates → EXPLORACION", () => {
  const r = inferLifecycleStage(signals({ kickoffPublishedAt: d("2026-07-10") }));
  expect(r.stage).toBe("EXPLORACION");
});

test("kickoff REALIZADO (sesión pasada) sin publicar también sale de HAND_OFF (legacy)", () => {
  const r = inferLifecycleStage(signals({ kickoffSessionAt: d("2025-11-05") }));
  expect(r.stage).toBe("EXPLORACION");
  expect(r.reasons.join(" ")).toContain("página sin publicar");
});

test("sesión de kickoff FUTURA no saca de HAND_OFF", () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const r = inferLifecycleStage(signals({ kickoffSessionAt: future }));
  expect(r.stage).toBe("HAND_OFF");
});

test("cascada: cada gate cumplido avanza UNA etapa", () => {
  const base = signals({ kickoffPublishedAt: d("2026-07-01") });
  base.gates.ENTENDIMIENTO_CERRADO = d("2026-07-05");
  expect(inferLifecycleStage(base).stage).toBe("DIAGNOSTICO");
  base.gates.DIAGNOSTICO_COMPARTIDO = d("2026-07-08");
  expect(inferLifecycleStage(base).stage).toBe("PLANIFICACION");
  base.gates.CRONOGRAMA_CONSENSUADO = d("2026-07-10");
  expect(inferLifecycleStage(base).stage).toBe("CONFIGURACION_TECNICA");
  base.gates.DEMO_APROBADA = d("2026-07-20");
  expect(inferLifecycleStage(base).stage).toBe("ADOPCION");
  base.gates.CLIENTE_OPERANDO = d("2026-08-01");
  expect(inferLifecycleStage(base).stage).toBe("VALIDACION_USO");
});

test("salto por UUS: score >= umbral cumple VALIDACION_USO sin gate marcado", () => {
  const s = signals({
    kickoffPublishedAt: d("2026-07-01"),
    uusScore: 72,
    gates: {
      ENTENDIMIENTO_CERRADO: d("2026-07-05"),
      DIAGNOSTICO_COMPARTIDO: d("2026-07-08"),
      CRONOGRAMA_CONSENSUADO: d("2026-07-10"),
      DEMO_APROBADA: d("2026-07-20"),
      CLIENTE_OPERANDO: d("2026-08-01"),
    },
  });
  const r = inferLifecycleStage(s);
  expect(r.stage).toBe("ENTREGA");
  expect(r.reasons.join(" ")).toContain("UUS 72");
});

test("UUS por debajo del umbral NO salta la validación (y la razón lo dice)", () => {
  const s = signals({
    kickoffPublishedAt: d("2026-07-01"),
    uusScore: 41,
    gates: {
      ENTENDIMIENTO_CERRADO: d("2026-07-05"),
      DIAGNOSTICO_COMPARTIDO: d("2026-07-08"),
      CRONOGRAMA_CONSENSUADO: d("2026-07-10"),
      DEMO_APROBADA: d("2026-07-20"),
      CLIENTE_OPERANDO: d("2026-08-01"),
    },
  });
  const r = inferLifecycleStage(s);
  expect(r.stage).toBe("VALIDACION_USO");
  expect(r.reasons.join(" ")).toContain("41");
});

test("completed → FINALIZADO gane quien gane la cascada", () => {
  expect(inferLifecycleStage(signals({ projectStatus: "completed" })).stage).toBe("FINALIZADO");
});

test("ciclo corto: kickoff publicado → OPERACION_CONTINUA; entrega → FINALIZADO", () => {
  const s = signals({ cycle: "short", kickoffPublishedAt: d("2026-07-01") });
  expect(inferLifecycleStage(s).stage).toBe("OPERACION_CONTINUA");
  s.gates.ENTREGA_REALIZADA = d("2026-12-01");
  expect(inferLifecycleStage(s).stage).toBe("FINALIZADO");
});

test("override del CSE gana sobre la inferida", () => {
  const inferred = inferLifecycleStage(signals()); // HAND_OFF
  const r = resolveLifecycleStage(inferred, "ADOPCION");
  expect(r.effective).toBe("ADOPCION");
  expect(r.source).toBe("override");
  const sin = resolveLifecycleStage(inferred, null);
  expect(sin.effective).toBe("HAND_OFF");
  expect(sin.source).toBe("inferred");
});

test("stageAtOrAfter — orden de madurez, con OPERACION_CONTINUA en tier post-configuración", () => {
  expect(stageAtOrAfter("HAND_OFF", "CONFIGURACION_TECNICA")).toBe(false);
  expect(stageAtOrAfter("PLANIFICACION", "CONFIGURACION_TECNICA")).toBe(false);
  expect(stageAtOrAfter("CONFIGURACION_TECNICA", "CONFIGURACION_TECNICA")).toBe(true);
  expect(stageAtOrAfter("ENTREGA", "CONFIGURACION_TECNICA")).toBe(true);
  // Continuidad operando = las alarmas de cronograma aplican
  expect(stageAtOrAfter("OPERACION_CONTINUA", "CONFIGURACION_TECNICA")).toBe(true);
});

test("resolveLifecycleCycle — override curado pisa; si no, sale del tag `recurrente`", () => {
  // Override duro gana sin importar los tags.
  expect(resolveLifecycleCycle({ lifecycleCycle: "short", tags: [] })).toBe("short");
  expect(resolveLifecycleCycle({ lifecycleCycle: "full", tags: ["recurrente"] })).toBe("full");
  // Sin override: el tag `recurrente` (del handoff) define el ciclo corto.
  expect(resolveLifecycleCycle({ lifecycleCycle: null, tags: ["recurrente"] })).toBe("short");
  expect(resolveLifecycleCycle({ lifecycleCycle: null, tags: ["marketing_hub", "recurrente"] })).toBe("short");
  // Sin el tag = implementación (ciclo completo). El NOMBRE ya no influye.
  expect(resolveLifecycleCycle({ lifecycleCycle: null, tags: [] })).toBe("full");
  expect(resolveLifecycleCycle({ lifecycleCycle: null, tags: ["sales_hub"] })).toBe("full");
});

test("suggestAdoptionMode — grande por seats o contactos → pilotos; chica → directa; sin datos → null", () => {
  expect(suggestAdoptionMode({ seatsTotal: 40, marketingContactsLimit: null })).toBe("por_pilotos");
  expect(suggestAdoptionMode({ seatsTotal: 5, marketingContactsLimit: 50_000 })).toBe("por_pilotos");
  expect(suggestAdoptionMode({ seatsTotal: 8, marketingContactsLimit: 2_000 })).toBe("directa");
  expect(suggestAdoptionMode({ seatsTotal: null, marketingContactsLimit: null })).toBeNull();
});

test("stagePosition — chip 'Etapa N/M' por ciclo", () => {
  expect(stagePosition("DIAGNOSTICO", "full")).toEqual({ index: 3, total: 9 });
  expect(stagePosition("OPERACION_CONTINUA", "short")).toEqual({ index: 2, total: 4 });
});
