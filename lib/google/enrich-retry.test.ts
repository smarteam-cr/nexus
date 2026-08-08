import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  datosDeEscritura,
  esReintentable,
  esperaBackoffMs,
  esErrorDeCuota,
  MAX_ENRICH_ATTEMPTS,
  type LecturaDoc,
} from "./enrich-retry";

/**
 * lib/google/enrich-retry.test.ts — LA POLÍTICA DE ESCRITURA Y REINTENTO, COMO TABLA.
 *
 * El incidente que congela: un fallo de lectura (429, 403, red) se tragaba en un catch mudo
 * y la fila quedaba `enrichedAt` sellada PARA SIEMPRE — así se quemaron las corridas del
 * 17-may (528/1100) y 7-jul (47/73), y quedó CERO rastro del error. La regla nueva: un fallo
 * NUNCA sella; solo el éxito o el tope sellan, y siempre con procedencia escrita.
 */

const AHORA = new Date("2026-08-08T15:00:00Z");

const FALLO: LecturaDoc = { ok: false, error: "Quota exceeded", status: 429 };
const EXITO_CON_TRANSCRIPT: LecturaDoc = {
  ok: true,
  transcript: "x".repeat(5000),
  summary: { overview: "resumen" },
  diagnostico: { tabsVistos: ["Transcripción"], motivo: "pestana_reconocida" },
};
const EXITO_SIN_NADA: LecturaDoc = {
  ok: true,
  transcript: null,
  summary: null,
  diagnostico: { tabsVistos: ["Notas de Gemini"], motivo: "solo_notas" },
};

describe("datosDeEscritura — la tabla", () => {
  /**
   * ── LA GUARDA DEL INCIDENTE ─────────────────────────────────────────────────
   * La edición que la pone en rojo: volver a poner `enrichedAt: now` en la rama de fallo.
   * Es exactamente la línea que quemó 528 sesiones el 17 de mayo.
   */
  it("LA guarda: un fallo NO sella — attempts+1 y el error persistido", () => {
    const d = datosDeEscritura(FALLO, null, 0, AHORA);
    expect(d.enrichedAt, "un fallo volvió a sellar la fila: la quema del 17-may renace").toBeUndefined();
    expect(d.enrichAttempts).toBe(1);
    const err = JSON.parse(d.enrichError!);
    expect(err.error).toContain("Quota");
    expect(err.status).toBe(429);
    expect(err.at).toBe(AHORA.toISOString());
  });

  it("al 5º fallo se sella CON procedencia — el tope evita el loop infinito", () => {
    const d = datosDeEscritura(FALLO, null, MAX_ENRICH_ATTEMPTS - 1, AHORA);
    expect(d.enrichedAt).toEqual(AHORA);
    expect(d.enrichAttempts).toBe(MAX_ENRICH_ATTEMPTS);
    expect(JSON.parse(d.enrichError!).selladoPorTope).toBe(true);
  });

  it("el éxito con transcript sella limpio y resetea attempts", () => {
    const d = datosDeEscritura(EXITO_CON_TRANSCRIPT, EXITO_CON_TRANSCRIPT.ok ? EXITO_CON_TRANSCRIPT.summary : null, 3, AHORA);
    expect(d.enrichedAt).toEqual(AHORA);
    expect(d.enrichAttempts).toBe(0);
    expect(d.enrichError).toBeNull();
    expect(d.transcript).toHaveLength(5000);
  });

  it("el éxito SIN transcript sella con el DIAGNÓSTICO persistido", () => {
    /* Los nombres de las pestañas dejaban de existir con la rotación de logs del VPS — por
       eso la investigación tuvo que inferir en vez de leer. Ahora quedan en la fila. */
    const d = datosDeEscritura(EXITO_SIN_NADA, null, 0, AHORA);
    expect(d.enrichedAt).toEqual(AHORA);
    const err = JSON.parse(d.enrichError!);
    expect(err.diagnostico.motivo).toBe("solo_notas");
    expect(err.diagnostico.tabsVistos).toContain("Notas de Gemini");
  });

  it("un fallo nunca toca transcript ni summary existentes", () => {
    const d = datosDeEscritura(FALLO, null, 1, AHORA);
    expect("transcript" in d && d.transcript !== undefined).toBe(false);
    expect("summary" in d && d.summary !== undefined).toBe(false);
  });
});

describe("esReintentable — el backoff exponencial", () => {
  const errorDeHace = (horas: number) =>
    JSON.stringify({ error: "x", status: 429, at: new Date(AHORA.getTime() - horas * 3_600_000).toISOString() });

  it("congela el tope: attempts 0 y 5 nunca se reintentan", () => {
    expect(esReintentable(0, null, AHORA)).toBe(false);
    expect(esReintentable(MAX_ENRICH_ATTEMPTS, errorDeHace(100), AHORA)).toBe(false);
  });

  it("congela la espera: 3 intentos ⇒ 8 horas (7h no, 9h sí)", () => {
    expect(esReintentable(3, errorDeHace(7), AHORA)).toBe(false);
    expect(esReintentable(3, errorDeHace(9), AHORA)).toBe(true);
  });

  it("1 intento ⇒ 2 horas", () => {
    expect(esReintentable(1, errorDeHace(1), AHORA)).toBe(false);
    expect(esReintentable(1, errorDeHace(3), AHORA)).toBe(true);
  });

  it("error ilegible → se reintenta ya (el lado seguro no es esperar para siempre)", () => {
    expect(esReintentable(2, "esto no es json", AHORA)).toBe(true);
    expect(esReintentable(2, null, AHORA)).toBe(true);
  });
});

describe("los helpers del lote", () => {
  it("esperaBackoffMs: exponencial con techo de 60s", () => {
    expect(esperaBackoffMs(0)).toBe(0);
    expect(esperaBackoffMs(1)).toBe(2000);
    expect(esperaBackoffMs(3)).toBe(8000);
    expect(esperaBackoffMs(10)).toBe(60000);
  });
  it("esErrorDeCuota: 429 y 5xx sí; 403/404 no (un permiso puntual no frena el lote)", () => {
    expect(esErrorDeCuota(429)).toBe(true);
    expect(esErrorDeCuota(500)).toBe(true);
    expect(esErrorDeCuota(503)).toBe(true);
    expect(esErrorDeCuota(403)).toBe(false);
    expect(esErrorDeCuota(404)).toBe(false);
    expect(esErrorDeCuota(null)).toBe(false);
  });
});

// ── Candados fs-scan sobre el pipeline ───────────────────────────────────────

const RAIZ = process.cwd();
const fuente = (rel: string): string =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n");

describe("candado: el pipeline no puede volver a tragar ni sellar", () => {
  it("LA guarda: meet-enrichment no tiene NINGÚN catch mudo", () => {
    /* Los tres catch mudos (fetchDocContent, readDriveFile, searchDriveForTranscript) son la
       mitad de la quema del 17-may: el fallo se disfrazaba de «sin contenido» y el escritor
       sellaba. La edición que la pone en rojo: reponer cualquier `catch { return ... }` sin
       propagar el error. */
    const src = fuente("lib/google/meet-enrichment.ts");
    expect(src, "volvió un catch mudo — el fallo se disfraza de «sin contenido»").not.toMatch(
      /catch\s*\{/,
    );
    // Y toda escritura pasa por la política pura, no por un data armado a mano.
    const escrituras = src.match(/firefliesSession\.update\(/g)?.length ?? 0;
    const conPolitica = src.match(/datosDeEscritura\(/g)?.length ?? 0;
    expect(escrituras, "cambió la forma de las escrituras; revisar esta guarda").toBeGreaterThan(0);
    expect(
      conPolitica,
      "hay una escritura que no pasa por datosDeEscritura: puede sellar en fallo",
    ).toBeGreaterThanOrEqual(escrituras);
  });

  it("las pasadas no toman reuniones que no ocurrieron ni filas en reintento", () => {
    /* 88/171 sesiones de Desarrollo se sellaron ANTES de la reunión (sin filtro de fecha), y
       sin el filtro de attempts las pasadas pisarían el backoff del job. */
    const src = fuente("lib/google/meet-enrichment.ts");
    const pasadas = src.split("enrichGoogleMeetSessions")[1]?.split("drenarReintentos")[0] ?? "";
    expect(pasadas.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(pasadas.match(/enrichAttempts: 0/g)?.length, "las pasadas toman filas en reintento").toBe(2);
    expect(pasadas.match(/date: \{ lt: yaOcurrio \}/g)?.length, "volvió el enriquecimiento de reuniones futuras").toBe(2);
  });

  it("el job de reintento existe y drena con tope", () => {
    const src = fuente("lib/jobs/defs.ts");
    expect(src, "el job de reintento desapareció: lo fallido queda muerto para siempre").toContain(
      '"google-enrich-retry"',
    );
    expect(src).toContain("drenarReintentos(");
  });

  it("el force del endpoint resetea también attempts y error", () => {
    /* Sin esto, una fila sellada por tope es invisible para las pasadas (toman attempts 0) y
       el force no fuerza nada. */
    const src = fuente("app/api/integrations/google/enrich/route.ts");
    expect(src.match(/enrichAttempts: 0/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src.match(/enrichError: null/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("candado: toda impersonación pasa por el chokepoint", () => {
  /**
   * ── R3 ──────────────────────────────────────────────────────────────────────
   * ~267 reuniones con organizador EXTERNO estaban al 7% de éxito porque siempre se
   * impersonaba al organizador — imposible por diseño cuando es el cliente o una sala.
   * La edición que la pone en rojo: volver a llamar `fetchDocContent(s.organizerEmail…)`
   * en vez de resolver por `elegirImpersonado`.
   */
  it("LA guarda: nadie lee con organizerEmail directo", () => {
    const src = fuente("lib/google/meet-enrichment.ts");
    expect(src, "el núcleo dejó de elegir al impersonado").toContain("elegirImpersonado(");
    expect(src, "volvió la impersonación directa del organizador").not.toMatch(
      /fetchDocContent\(\s*s\.organizerEmail/,
    );
    expect(src).not.toMatch(/searchDriveForTranscript\(\s*s\.organizerEmail/);
    // Y el where ya no exige organizador: una reunión creada por el cliente con un invitado
    // nuestro ES leíble ahora.
    const pasadas = src.split("enrichGoogleMeetSessions")[1] ?? "";
    expect(pasadas, "las pasadas volvieron a exigir organizerEmail y re-excluyen las ~267").not.toContain(
      "organizerEmail: { not: null }",
    );
  });
});
