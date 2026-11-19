/**
 * lib/timeline/cierre-para-mostrar.test.ts — el cierre que se PINTA y la semana de una fecha (2026-11-19, Elías: el aviso
 * de «Lo acordado» decía 14 dic y el Gantt 15 dic). Pedidas por la revisión: sin estas, tocar una de las reglas no ponía
 * nada en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cierreFijadoDiverge, cierreParaMostrar, projectedEnd, semanaDeLaFecha } from "./weeks";

/* RC Inmobiliaria · DocuSign: arranque el martes 17 nov, 4 semanas. */
const ANCLA_RC = "2026-11-17T00:00:00.000Z";
const FASES_RC = [{ durationWeeks: 4, startWeek: null }];

describe("cierreParaMostrar — el último día de la última semana", () => {
  it("RC: el plan termina el lunes 14 dic (projectedEnd, exclusivo, sigue en el martes 15)", () => {
    const exclusivo = projectedEnd(ANCLA_RC, FASES_RC);
    expect(exclusivo.date!.toISOString().slice(0, 10)).toBe("2026-12-15");
    const c = cierreParaMostrar(exclusivo);
    expect(c.date!.toISOString().slice(0, 10)).toBe("2026-12-14");
    expect(c.label).toBe("14 dic 2026");
    expect(c.spanWeeks).toBe(4);
  });

  it("sin ancla no inventa nada", () => {
    expect(cierreParaMostrar(projectedEnd(null, FASES_RC))).toEqual({ spanWeeks: 4, date: null, label: null });
  });
});

describe("cierreFijadoDiverge — la pregunta de «el sistema sugiere otro cierre»", () => {
  const exclusivo = projectedEnd(ANCLA_RC, FASES_RC);

  it("no pregunta con el día que se pinta ahora (14) ni con el que se pintaba antes (15)", () => {
    expect(cierreFijadoDiverge("2026-12-14", exclusivo)).toBe(false);
    expect(cierreFijadoDiverge("2026-12-15", exclusivo)).toBe(false);
    expect(cierreFijadoDiverge(null, exclusivo)).toBe(false);
  });

  it("sí pregunta con cualquier otra fecha", () => {
    expect(cierreFijadoDiverge("2026-12-13", exclusivo)).toBe(true);
    expect(cierreFijadoDiverge("2026-12-21", exclusivo)).toBe(true);
  });

  it("el Gantt usa esta regla (no una condición propia)", () => {
    const gantt = fs.readFileSync(path.join(process.cwd(), "components/canvas/TimelineGantt.tsx"), "utf8");
    expect(gantt).toContain("const cierreDiverge = cierreFijadoDiverge(closeOverride, cierreExclusivo);");
  });
});

describe("semanaDeLaFecha — UNA regla para el aviso y la cabecera del Gantt", () => {
  it("RC: el viernes 11 dic cae en la semana 3 (martes 8 a lunes 14), la última del plan", () => {
    expect(semanaDeLaFecha(ANCLA_RC, "2026-12-11")).toBe(3);
    expect(semanaDeLaFecha(ANCLA_RC, "2026-12-14")).toBe(3);
    expect(semanaDeLaFecha(ANCLA_RC, "2026-12-15")).toBe(4);
    expect(semanaDeLaFecha(ANCLA_RC, "2026-11-16")).toBe(-1);
    expect(semanaDeLaFecha(null, "2026-12-11")).toBeNull();
  });

  it("el aviso y el Gantt la usan los dos", () => {
    const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
    expect(leer("lib/timeline/limites.ts")).toContain("semanaDeLaFecha(i.ancla!, vigentes.fecha.valor)");
    expect(leer("components/canvas/TimelineGantt.tsx")).toContain("semanaDeLaFecha(anchor, fechaLimite)");
  });
});
