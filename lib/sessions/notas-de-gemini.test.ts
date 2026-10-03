/**
 * lib/sessions/notas-de-gemini.test.ts
 *
 * Correr: `npx vitest run lib/sessions/notas-de-gemini.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TOPE_SIN_TITULOS, notasPriorizadas, partirNotas } from "./notas-de-gemini";

const NOTAS = [
  "Revisión semanal",
  "",
  "Resumen",
  "x".repeat(3000),
  "",
  "Decisiones",
  "Acordada",
  "Se aprueba el piloto con dos vendedores.",
  "",
  "Próximos pasos",
  "[Rodrigo] Entregar base datos: Proporcionar la base de datos de clientes a más tardar el miércoles 7 de octubre.",
  "",
  "Detalles",
  "Conversaron sobre el alias de remitente.",
].join("\n");

describe("qué parte de las notas llega a los agentes", () => {
  it("caso real Spectrum: con un resumen largo, la fecha de los próximos pasos SIGUE llegando", () => {
    const t = notasPriorizadas(NOTAS);
    expect(t).toContain("a más tardar el miércoles 7 de octubre");
    expect(t).toContain("Se aprueba el piloto con dos vendedores.");
    expect(t).toContain("Conversaron sobre el alias de remitente.");
  });

  it("el resumen se acorta para dejar lugar a lo que tiene fechas", () => {
    expect(notasPriorizadas(NOTAS).length).toBeLessThan(NOTAS.length);
  });

  it("sin los títulos de Gemini se corta como siempre", () => {
    const plano = "y".repeat(5000);
    expect(partirNotas(plano)).toBeNull();
    expect(notasPriorizadas(plano)).toHaveLength(TOPE_SIN_TITULOS);
  });

  it("acepta «Pasos siguientes» como título de los próximos pasos", () => {
    const t = notasPriorizadas("Resumen\nalgo\nPasos siguientes\n[Ana] Llamar al cliente el lunes.");
    expect(t).toContain("[Ana] Llamar al cliente el lunes.");
  });

  it("fetchTranscriptContent usa las notas priorizadas, no los primeros 1.500 caracteres", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/sessions/transcript.ts"), "utf8");
    expect(src).toContain("notasPriorizadas(overview)");
    expect(src, "volvió el corte ciego del resumen").not.toContain("overview.trim().slice(0, 1500)");
  });
});
