import { describe, it, expect } from "vitest";
import { computeDetailTasksForPhase, sanitizeTaskTitle } from "./compute-detail-tasks";

describe("sanitizeTaskTitle", () => {
  it("saca el marcador 'por validar' del título", () => {
    expect(sanitizeTaskTitle("⚠️ [Por validar]: Configurar el flujo")).toBe("Configurar el flujo");
    expect(sanitizeTaskTitle("Por validar - Revisar campos")).toBe("Revisar campos");
  });

  it("deja el título tal cual si no hay marcador", () => {
    expect(sanitizeTaskTitle("Configurar el flujo")).toBe("Configurar el flujo");
  });

  it("si el saneo deja vacío, conserva el original trimeado", () => {
    expect(sanitizeTaskTitle("  Por validar:  ")).toBe("Por validar:");
  });
});

describe("computeDetailTasksForPhase", () => {
  it("clampea weekIndex al rango [0, durationWeeks)", () => {
    const out = computeDetailTasksForPhase("Sales Hub", 3, "CONFIGURACION", [
      { title: "A", weekIndex: -5 },
      { title: "B", weekIndex: 99 },
    ]);
    expect(out.map((t) => t.weekIndex)).toEqual([0, 2]);
  });

  it("order incremental por semana, no global", () => {
    const out = computeDetailTasksForPhase("Sales Hub", 2, "CONFIGURACION", [
      { title: "A", weekIndex: 0 },
      { title: "B", weekIndex: 0 },
      { title: "C", weekIndex: 1 },
    ]);
    expect(out.map((t) => [t.weekIndex, t.order])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it("party DEV solo se acepta en fase técnica (isDevIntegrationPhaseName)", () => {
    const enTecnica = computeDetailTasksForPhase("Desarrollo / Integración", 1, null, [
      { title: "A", party: "dev" },
    ]);
    expect(enTecnica[0].party).toBe("DEV");

    const fueraDeTecnica = computeDetailTasksForPhase("Sales Hub", 1, null, [
      { title: "A", party: "dev" },
    ]);
    expect(fueraDeTecnica[0].party).toBe("SMARTEAM"); // party inválida fuera de técnica → fallback
  });

  it("fallback de party por activityType cuando el agente no manda una válida", () => {
    const configuracion = computeDetailTasksForPhase("Sales Hub", 1, "CONFIGURACION", [{ title: "A" }]);
    expect(configuracion[0].party).toBe("SMARTEAM");

    const otraActividad = computeDetailTasksForPhase("Sales Hub", 1, "ADOPCION", [{ title: "A" }]);
    expect(otraActividad[0].party).toBe("AMBOS");

    const sinActividad = computeDetailTasksForPhase("Sales Hub", 1, null, [{ title: "A" }]);
    expect(sinActividad[0].party).toBe("SMARTEAM");
  });

  it("type default TASK; SESSION solo si el agente lo pide", () => {
    const out = computeDetailTasksForPhase("Sales Hub", 1, null, [
      { title: "A" },
      { title: "B", type: "session" },
    ]);
    expect(out.map((t) => t.type)).toEqual(["TASK", "SESSION"]);
  });

  it("skipTitles deduplica por título normalizado (case-insensitive)", () => {
    const out = computeDetailTasksForPhase("Sales Hub", 1, null, [
      { title: "Ya existe" },
      { title: "Nueva" },
    ], new Set(["ya existe"]));
    expect(out.map((t) => t.title)).toEqual(["Nueva"]);
  });

  it("descarta entradas sin título", () => {
    const out = computeDetailTasksForPhase("Sales Hub", 1, null, [{ title: "" }, { title: "  " }, {}]);
    expect(out).toEqual([]);
  });

  it("needsValidation viene de porValidar === true", () => {
    const out = computeDetailTasksForPhase("Sales Hub", 1, null, [
      { title: "A", porValidar: true },
      { title: "B" },
    ]);
    expect(out.map((t) => t.needsValidation)).toEqual([true, false]);
  });
});
