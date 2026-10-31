/**
 * lib/artefactos/enlace.test.ts — lo puro del enlace propio de un documento de proyecto (etapa V4 de
 * docs/artefactos-plan.md): qué tipos se comparten, qué secciones salen por el enlace, dónde se abre su PDF, y que la
 * vista del cliente y el PDF tengan el adaptador de cada tipo que se comparte.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { seccionesQueSalenPorElEnlace, tipoCompartible, SECCIONES_INTERNAS } from "./secciones-del-enlace";
import { rutaDelEnlace } from "./enlaces";
import { TIPOS, TIPO_REQUERIMIENTO_TECNICO, TIPO_PLAN_DE_ADOPCION, admiteCopias, TIPO_HOJA_DE_RUTA, tipoDeArtefacto } from "./tipos";
import { printDocType } from "@/lib/print/doc-types";
import { motivoDeLaCopia } from "@/lib/invariantes/artefactos";

describe("qué tipos se comparten por su enlace propio", () => {
  it("los que lee el cliente y viven en un canvas; nunca uno interno", () => {
    expect(tipoCompartible("planning")).toBe(true);
    expect(tipoCompartible("diagnosis")).toBe(true);
    expect(tipoCompartible("kickoff")).toBe(true);
    expect(tipoCompartible(TIPO_PLAN_DE_ADOPCION)).toBe(true);
    expect(tipoCompartible(TIPO_REQUERIMIENTO_TECNICO)).toBe(true);
    // La exploración y la ejecución son internas: no tienen botón de compartir.
    expect(tipoCompartible("exploration")).toBe(false);
    expect(tipoCompartible("implementation")).toBe(false);
    expect(tipoCompartible("handoff")).toBe(false);
    expect(tipoCompartible(null)).toBe(false);
    expect(tipoCompartible("no-existe")).toBe(false);
  });

  it("todo tipo que admite copias y lee el cliente se comparte (un tipo nuevo no queda sin enlace en silencio)", () => {
    const sinEnlace = TIPOS.filter((t) => admiteCopias(t.id) && t.clientFacing && !tipoCompartible(t.id)).map((t) => t.id);
    expect(sinEnlace).toEqual([]);
  });
});

describe("qué secciones salen por el enlace", () => {
  it("la estimación del equipo técnico nunca sale del requerimiento técnico", () => {
    expect(SECCIONES_INTERNAS["tech-requirements"]).toContain("estimacion");
    expect(seccionesQueSalenPorElEnlace(TIPO_REQUERIMIENTO_TECNICO)("estimacion")).toBe(false);
    expect(seccionesQueSalenPorElEnlace(TIPO_REQUERIMIENTO_TECNICO)("arquitectura")).toBe(true);
  });

  it("lo que lee el proyecto no sale; la portada y el cierre sí, aunque pinten con su contexto", () => {
    const kickoff = seccionesQueSalenPorElEnlace("kickoff");
    expect(kickoff("cronograma")).toBe(false);
    expect(kickoff("procesos")).toBe(false);
    expect(kickoff("cierre")).toBe(true);
    expect(kickoff("bienvenida")).toBe(true);
    expect(kickoff("objetivos")).toBe(true);
  });

  it("una sección creada por una persona sale; una key que el tipo no conoce no (falla cerrado)", () => {
    const plan = seccionesQueSalenPorElEnlace("planning");
    expect(plan("custom:tabla:123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(plan("una_key_que_no_existe")).toBe(false);
    expect(seccionesQueSalenPorElEnlace("exploration")("exploracion")).toBe(false);
  });
});

describe("el PDF y el enlace de un artefacto", () => {
  it("una copia de la entrega se comparte, sin lo que calcula el documento de cierre; la entrega de siempre sigue con su superficie", () => {
    expect(tipoCompartible("delivery")).toBe(true);
    expect(tipoDeArtefacto("delivery")?.sinEnlaceElDeSiempre).toBe(true);
    expect(seccionesQueSalenPorElEnlace("delivery")("impacto")).toBe(false);
    expect(seccionesQueSalenPorElEnlace("delivery")("avance_por_frente")).toBe(true);
    expect(rutaDelEnlace({ projectId: "p1", canvasId: "c1" })).toBe("/api/projects/p1/artefactos/c1/enlace");
  });

  it("los tipos nuevos imprimen: tienen tipo de impresión y no son una pieza", () => {
    for (const id of [TIPO_PLAN_DE_ADOPCION, TIPO_HOJA_DE_RUTA, "integration"]) {
      expect(printDocType(id)).toMatchObject({ id, scope: "project-piece", pieceSlug: null, palette: "brand" });
    }
  });

  it("la vista del enlace y el editor tienen el adaptador de cada tipo que se comparte (y de los internos del motor)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/artefactos/adaptadores.ts"), "utf8");
    const bloque = /const ADAPTADORES[\s\S]*?\n};/.exec(src)?.[0] ?? "";
    const claves = new Set([...bloque.matchAll(/^  (?:"([a-z-]+)"|([a-z]+)|\[(TIPO_[A-Z_]+)\]):/gm)].map((m) => m[1] ?? m[2] ?? m[3]));
    const esperadas = TIPOS.filter((t) => tipoCompartible(t.id) || t.id === "exploration" || t.id === "implementation").map((t) =>
      t.id === TIPO_PLAN_DE_ADOPCION ? "TIPO_PLAN_DE_ADOPCION" : t.id === TIPO_REQUERIMIENTO_TECNICO ? "TIPO_REQUERIMIENTO_TECNICO" : t.id === TIPO_HOJA_DE_RUTA ? "TIPO_HOJA_DE_RUTA" : t.id,
    );
    expect([...claves].sort()).toEqual(esperadas.sort());
  });
});

describe("INV65: qué hace mala a una copia", () => {
  const sana = { slug: null, tipoArtefacto: "planning", projectId: "p1", name: "Planificación — Marketing" };
  it("una copia sana no tiene motivo", () => {
    expect(motivoDeLaCopia(sana)).toBeNull();
  });
  it("con slug, sin proyecto, con un tipo que no admite copias o con nombre de pieza, sí", () => {
    expect(motivoDeLaCopia({ ...sana, slug: "planning" })).toBe("tiene slug");
    expect(motivoDeLaCopia({ ...sana, projectId: null })).toBe("no es de un proyecto");
    expect(motivoDeLaCopia({ ...sana, tipoArtefacto: "timeline" })).toContain("no admite copias");
    expect(motivoDeLaCopia({ ...sana, tipoArtefacto: "inventado" })).toContain("no admite copias");
    expect(motivoDeLaCopia({ ...sana, name: "Planificación" })).toContain("se llama como una pieza");
  });
});
