import { describe, expect, it } from "vitest";
import { cosasPorComprobar, esClaveDePendiente, explicarMotivo, LO_QUE_LA_API_NO_MUESTRA, loQueLaApiNoMuestra } from "./comprobar";
import type { LecturaFallida, MotivoDeFalla } from "./lecturas";

/**
 * lib/auditoria-portal/comprobar.test.ts — LO QUE NO SE PUDO LEER, Y LO QUE LA API NO MUESTRA, SE
 * VUELVE UNA TAREA CON DÓNDE COMPROBARLA.
 */

describe("cosasPorComprobar", () => {
  it("sin fallas no hay nada que comprobar", () => {
    expect(cosasPorComprobar([])).toEqual([]);
  });

  it("agrupa por sección, sin repetir lecturas ni motivos, en el orden de la primera falla", () => {
    const fallidas: LecturaFallida[] = [
      { bloque: "workflows", que: "La lista de workflows del portal", motivo: "sin_permiso", status: 403 },
      { bloque: "totales", que: "Total de tickets", motivo: "sin_permiso", status: 403 },
      { bloque: "totales", que: "Total de tickets", motivo: "sin_permiso", status: 403 },
      { bloque: "totales", que: "Total de negocios", motivo: "limite", status: 429 },
    ];
    const cosas = cosasPorComprobar(fallidas);
    expect(cosas.map((c) => c.clave)).toEqual(["lectura:workflows", "lectura:totales"]);
    expect(cosas.every((c) => c.origen === "lectura")).toBe(true);
    const totales = cosas[1]!;
    expect(totales.faltantes).toEqual(["Total de tickets", "Total de negocios"]);
    expect(totales.motivos).toHaveLength(2);
    expect(totales.dondeComprobarlo).toMatch(/CRM/);
    expect(totales.consecuencia).toBeDefined();
  });

  it("lleva la revisión de quien ya la marcó", () => {
    const fallidas: LecturaFallida[] = [{ bloque: "pipelines", que: "Los pipelines de negocios", motivo: "red" }];
    const revision = { por: "Persona del equipo", en: "2026-10-04T12:00:00.000Z" };
    const [cosa] = cosasPorComprobar(fallidas, { "lectura:pipelines": revision });
    expect(cosa!.revision).toEqual(revision);
    expect(cosasPorComprobar(fallidas)[0]!.revision).toBeUndefined();
  });

  it("cada motivo dice qué hacer", () => {
    const motivos: MotivoDeFalla[] = ["sin_permiso", "credencial", "limite", "error_hubspot", "red"];
    for (const m of motivos) expect(explicarMotivo(m).length).toBeGreaterThan(20);
    expect(explicarMotivo("error_hubspot", 500)).toContain("500");
  });

  it("un 400 no pide reintentar: apunta a una propiedad que el portal no tiene", () => {
    const texto = explicarMotivo("error_hubspot", 400);
    expect(texto).toMatch(/propiedad que no existe/);
    expect(texto).not.toMatch(/vuelve a correrla/);
  });
});

describe("loQueLaApiNoMuestra", () => {
  it("son pendientes fijos, sin faltantes ni motivos, cada uno con dónde comprobarlo y por qué importa", () => {
    const cosas = loQueLaApiNoMuestra();
    expect(cosas).toHaveLength(LO_QUE_LA_API_NO_MUESTRA.length);
    for (const c of cosas) {
      expect(c.origen).toBe("api");
      expect(c.clave.startsWith("api:")).toBe(true);
      expect(c.faltantes).toEqual([]);
      expect(c.motivos).toEqual([]);
      expect(c.dondeComprobarlo.length).toBeGreaterThan(10);
      expect(c.porQue).toBeTruthy();
    }
    expect(new Set(cosas.map((c) => c.clave)).size).toBe(cosas.length);
  });

  it("una pregunta para Breeze dice si HubSpot documenta que la responde", () => {
    const conPregunta = loQueLaApiNoMuestra().filter((c) => c.breeze);
    expect(conPregunta.length).toBeGreaterThan(0);
    for (const c of conPregunta) {
      expect(c.breeze!.pregunta).toMatch(/\?$/);
      expect(typeof c.breeze!.confirmada).toBe("boolean");
    }
  });

  it("marca como revisado solo el que se marcó", () => {
    const cosas = loQueLaApiNoMuestra({ "api:plan": { por: "Persona del equipo", en: "2026-10-04T12:00:00.000Z" } });
    expect(cosas.filter((c) => c.revision).map((c) => c.clave)).toEqual(["api:plan"]);
  });
});

describe("esClaveDePendiente", () => {
  it("acepta las fijas y las de cada bloque de lectura; nada más", () => {
    expect(esClaveDePendiente("api:plan")).toBe(true);
    expect(esClaveDePendiente("lectura:workflows")).toBe(true);
    expect(esClaveDePendiente("lectura:usuarios")).toBe(true);
    expect(esClaveDePendiente("api:inventada")).toBe(false);
    expect(esClaveDePendiente("lectura:inventada")).toBe(false);
    expect(esClaveDePendiente("lectura:__proto__")).toBe(false);
    expect(esClaveDePendiente("")).toBe(false);
  });
});
