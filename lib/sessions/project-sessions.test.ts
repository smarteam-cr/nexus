/**
 * lib/sessions/project-sessions.test.ts — lo que lee el agente de avance (memoria de la cuenta, etapa 3): la reunión
 * NUEVA entera y las demás con lo que ya dejaron, nunca 12 transcripciones.
 * Correr: `npx vitest run --project unit lib/sessions/project-sessions.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contenidoParaElAvance, laReunionNueva } from "./project-sessions";
import { TOPE_DE_LA_REUNION_ENTERA } from "./recortar-transcripcion";

const RAIZ = process.cwd();
const sinComentarios = (rel: string) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

describe("cuál es la reunión nueva", () => {
  const sesiones = [{ id: "vieja" }, { id: "media" }, { id: "nueva-sin-nada" }];

  it("la pedida (la del post-proceso), si está en la ventana", () => {
    expect(laReunionNueva(sesiones, () => true, "media")).toBe("media");
  });

  it("con el botón (o una pedida que no está), la más reciente que tenga algo que leer", () => {
    const conAlgo = (id: string) => id !== "nueva-sin-nada";
    expect(laReunionNueva(sesiones, conAlgo)).toBe("media");
    expect(laReunionNueva(sesiones, conAlgo, "de-otro-proyecto")).toBe("media");
  });

  it("sin nada que leer, ninguna", () => {
    expect(laReunionNueva(sesiones, () => false)).toBeNull();
  });
});

describe("lo que se lee de cada una", () => {
  it("la nueva entera: sus notas y la transcripción, recortada al tope (el principio y el final)", () => {
    const transcripcion = `INICIO ${"x".repeat(TOPE_DE_LA_REUNION_ENTERA * 2)} FINAL-ACORDADO`;
    const t = contenidoParaElAvance({ resumen: "Decisión: arrancar la fase 2", transcripcion, entera: true })!;
    expect(t).toContain("Decisión: arrancar la fase 2");
    expect(t).toContain("INICIO");
    expect(t).toContain("FINAL-ACORDADO");
    expect(t.length).toBeLessThanOrEqual(TOPE_DE_LA_REUNION_ENTERA + 200);
  });

  it("las demás, solo lo que dejaron (nunca su transcripción)", () => {
    expect(contenidoParaElAvance({ resumen: "Minuta: se aprobó el pipeline", transcripcion: "NO-SE-LEE", entera: false })).toBe("Minuta: se aprobó el pipeline");
    expect(contenidoParaElAvance({ resumen: "  ", transcripcion: "NO-SE-LEE", entera: false })).toBeNull();
  });
});

describe("⛔ el avance no vuelve a releer 12 transcripciones", () => {
  it("project-sessions no usa fetchTranscriptContent y trae la transcripción solo de la nueva", () => {
    const src = sinComentarios("lib/sessions/project-sessions.ts");
    expect(src).not.toContain("fetchTranscriptContent");
    expect(src).toContain("resumenDeReunion(");
    expect(src, "la transcripción se pide para todas").toMatch(/findUnique\(\{ where: \{ id: nuevaId \}, select: \{ transcript: true \} \}\)/);
  });

  it("regenerate-progress lee la ventana nueva, queda a nombre del agente y suma la memoria sin repetir reuniones", () => {
    const src = sinComentarios("lib/timeline/regenerate-progress.ts");
    expect(src).toContain("getSessionsForProgress(projectId, { nuevaId: opts.asOfSessionId ?? null })");
    expect(src).toContain("conContextoDeIA(");
    expect(src).toContain('agentSlug: AGENT_ID_PROGRESS');
    expect(src).toMatch(/memoriaDelProyecto\(projectId, \{ lector: "avance", yaLeidas: pastSessions\.map\(\(s\) => s\.id\) \}\)/);
  });
});
