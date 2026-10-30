/**
 * lib/artefactos/generar.int.test.ts — GENERAR UNA COPIA contra una base REAL, con el modelo simulado (etapa V3 de
 * docs/artefactos-plan.md): una copia nunca le escribe al documento de siempre, usa la plantilla que tiene anotada, deja lo
 * curado intacto y respeta lo que su tipo no reescribe. Correr con la base local:
 * `npx vitest run --project integration lib/artefactos/generar.int.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));

const generacion = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/business-cases/canvas-agent", async (original) => ({
  ...(await original<typeof import("@/lib/business-cases/canvas-agent")>()),
  generateSectionsForTemplate: generacion.fn,
}));

import { prisma } from "@/lib/db/prisma";
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { SIN_ESCALA_TAG } from "@/lib/tags/catalog";
import { crearCopia } from "./copias-server";
import { copiaParaGenerar, generarCopia } from "./generar-server";

async function proyecto() {
  const c = await prisma.client.create({ data: { name: "Cliente generar (test)", kind: "CLIENTE" } });
  return prisma.project.create({ data: { clientId: c.id, name: "Implementación generar" } });
}

beforeEach(() => {
  generacion.fn.mockReset();
  // Devuelve una sección por cada una que le pidieron, salvo las que le dijeron que salte.
  generacion.fn.mockImplementation(async (tpl: BcTemplateDef, _msg: string, _b: unknown, saltar?: Set<string>) => ({
    sections: tpl.sections
      .filter((s) => s.agentGenerated !== false && !s.ctxDriven && !saltar?.has(s.key))
      .map((s) => ({ key: s.key, data: { intro: `IA: ${s.key}` } })),
  }));
});

describe("generar una copia", () => {
  it("⛔ rechaza el documento de siempre (se genera con su botón) y un documento de otro proyecto", async () => {
    const p = await proyecto();
    const otro = await proyecto();
    const deSiempre = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "planning", name: "Planificación", sections: [] } });
    const copia = await crearCopia({ projectId: otro.id, tipo: "planning", porEmail: null });
    await expect(copiaParaGenerar(p.id, deSiempre.id)).rejects.toMatchObject({ status: 400 });
    await expect(copiaParaGenerar(p.id, copia.canvasId)).rejects.toMatchObject({ status: 404 });
  });

  it("usa la plantilla que la copia tiene anotada, también en un tipo nuevo, y no toca el cierre ni el documento de siempre", async () => {
    const p = await proyecto();
    const deSiempre = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "planning", name: "Planificación", sections: [] } });
    const sec = await prisma.canvasSection.create({ data: { canvasId: deSiempre.id, key: "pipelines", label: "Pipelines", order: 0 } });
    await prisma.canvasBlock.create({ data: { sectionId: sec.id, blockType: "CARD", data: { intro: "La de siempre" }, source: "AGENT", status: "CONFIRMED" } });

    const c = await crearCopia({ projectId: p.id, tipo: "adoption-plan", plantillaId: "adopcion-tecnica", porEmail: null });
    const cierreAntes = await prisma.canvasBlock.findFirstOrThrow({ where: { section: { canvasId: c.canvasId, key: "cierre" } }, select: { id: true, data: true } });

    const r = await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    expect(r.sectionCount).toBeGreaterThan(0);

    const tpl = generacion.fn.mock.calls[0][0] as BcTemplateDef;
    expect(tpl.sections.map((s) => s.key)).toContain("administradores");
    expect(tpl.sections.map((s) => s.key)).not.toContain("comportamientos");
    const escritas = await prisma.canvasBlock.findMany({ where: { section: { canvasId: c.canvasId, key: "administradores" } }, select: { data: true, source: true } });
    expect(escritas).toEqual([{ data: { intro: "IA: administradores" }, source: "AGENT" }]);

    const cierre = await prisma.canvasBlock.findFirstOrThrow({ where: { section: { canvasId: c.canvasId, key: "cierre" } }, select: { id: true, data: true } });
    expect(cierre).toEqual(cierreAntes);
    expect(await prisma.canvasBlock.findMany({ where: { section: { canvasId: deSiempre.id } }, select: { data: true } })).toEqual([{ data: { intro: "La de siempre" } }]);
  });

  it("usa el nombre que se ve, no el guardable, en lo que le dice al modelo", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "planning", nombre: "Planificación", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    const mensaje = generacion.fn.mock.calls[0][1] as string;
    expect(mensaje).toContain("Planificación «Planificación»");
    expect(mensaje).not.toContain("· copia");
  });

  it("en un diagnóstico no reescribe lo que el ejecutivo marcó revisado", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "diagnosis", plantillaId: "diagnostico-esencial", porEmail: null });
    const s = await prisma.canvasSection.findFirstOrThrow({ where: { canvasId: c.canvasId, key: "desafio" }, select: { id: true } });
    const revisado = { intro: "Ajustado a mano", revisadaAt: "2026-10-29T10:00:00.000Z" };
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: revisado, source: "HUMAN", status: "CONFIRMED" } });

    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });

    expect((generacion.fn.mock.calls[0][3] as Set<string>).has("desafio")).toBe(true);
    expect(await prisma.canvasBlock.findMany({ where: { sectionId: s.id }, select: { data: true } })).toEqual([{ data: revisado }]);
  });

  it("una copia de planificación conserva las propiedades de una persona", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-esencial", porEmail: null });
    const s = await prisma.canvasSection.findFirstOrThrow({ where: { canvasId: c.canvasId, key: "propiedades" }, select: { id: true } });
    const dePersona = { id: "p1", autor: "persona", objeto: "Contacto", nombre: "Marca", tipo: "texto" };
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { filas: [dePersona] }, source: "HUMAN", status: "CONFIRMED" } });
    generacion.fn.mockImplementation(async () => ({ sections: [{ key: "propiedades", data: { filas: [{ objeto: "Negocio", nombre: "Monto", tipo: "numero" }] } }] }));

    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });

    const fila = await prisma.canvasBlock.findFirstOrThrow({ where: { sectionId: s.id }, select: { data: true } });
    expect(JSON.stringify(fila.data)).toContain("Marca");
    expect(JSON.stringify(fila.data)).toContain("Monto");
  });

  it("una copia duplicada de un documento viejo recibe sus secciones nuevas y oculta lo retirado", async () => {
    const p = await proyecto();
    const viejo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "diagnosis", name: "Diagnóstico", sections: [{ key: "recomendaciones", label: "Recomendaciones" }] } });
    const s = await prisma.canvasSection.create({ data: { canvasId: viejo.id, key: "recomendaciones", label: "Recomendaciones", order: 0 } });
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { intro: "de antes" }, source: "AGENT", status: "CONFIRMED" } });
    const c = await crearCopia({ projectId: p.id, tipo: "diagnosis", desdeCanvasId: viejo.id, porEmail: null });

    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });

    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: c.canvasId }, select: { sections: true, canvasSections: { select: { key: true } } } });
    expect(fila.canvasSections.map((x) => x.key)).toContain("objetivos");
    expect((fila.sections as Array<{ key: string; hidden?: boolean }>).find((e) => e.key === "recomendaciones")?.hidden).toBe(true);
  });

  it("⛔ la memoria le da lo que su documento de siempre lee aparte, y nada más: un diagnóstico lee los resultados, una integración no", async () => {
    const p = await proyecto();
    await prisma.project.update({
      where: { id: p.id },
      data: { handoffResultados: { resultados: [{ id: "R1", resultado: "Duplicar los test drive", metrica: "m", lineaBase: "1", meta: "2", plazo: "6 meses" }], generadoAt: "2026-10-29T10:00:00.000Z" } },
    });
    const d = await crearCopia({ projectId: p.id, tipo: "diagnosis", plantillaId: "diagnostico-esencial", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: d.canvasId, agentRunId: null });
    expect(generacion.fn.mock.calls[0][1] as string).toContain("Duplicar los test drive");

    generacion.fn.mockClear();
    const i = await crearCopia({ projectId: p.id, tipo: "integration", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: i.canvasId, agentRunId: null });
    expect(generacion.fn.mock.calls[0][1] as string).not.toContain("Duplicar los test drive");
  });

  it("un kickoff sin Escala no la genera y la vacía", async () => {
    const p = await proyecto();
    await prisma.project.update({ where: { id: p.id }, data: { tags: [SIN_ESCALA_TAG] } });
    const c = await crearCopia({ projectId: p.id, tipo: "kickoff", porEmail: null });
    const s = await prisma.canvasSection.findFirstOrThrow({ where: { canvasId: c.canvasId, key: "punto_de_partida" }, select: { id: true } });
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { intro: "de antes" }, source: "AGENT", status: "CONFIRMED" } });

    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });

    expect((generacion.fn.mock.calls[0][3] as Set<string>).has("punto_de_partida")).toBe(true);
    expect(await prisma.canvasBlock.count({ where: { sectionId: s.id } })).toBe(0);
  });
});
