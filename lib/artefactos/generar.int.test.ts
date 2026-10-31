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
import { conReunionesDeLaCopia, conSeccionQuitada } from "./contexto-de-la-copia";
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
    porQueVacias: {},
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

  it("⛔ el plan de adopción recibe la modalidad: sin ella inventaría las olas y las rutinas", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "adoption-plan", plantillaId: "adopcion-por-niveles", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    expect(JSON.stringify(generacion.fn.mock.calls.at(-1))).toContain("MODALIDAD DE ADOPCIÓN");
  });

  it("⛔ sin reuniones elegidas lee las del proyecto con texto, y con elegidas solo esas; nunca las de otra empresa", async () => {
    const p = await proyecto();
    const otra = await proyecto();
    const reunion = async (id: string, projectId: string, clientId: string, dicho: string) => {
      await prisma.firefliesSession.create({
        data: {
          id,
          title: `Reunión ${id}`,
          date: new Date("2026-09-10T15:00:00Z"),
          participants: ["ana@cliente.test", "csm@smarteamcr.com"],
          resolvedClientId: clientId,
          transcript: `${dicho} `.repeat(30),
        },
      });
      await prisma.sessionProject.create({ data: { sessionId: id, projectId } });
    };
    await reunion("s-propia", p.id, p.clientId, "Quieren el pipeline de distribuidores");
    // Colgada de ESTE proyecto, con el dueño en otra empresa: el vínculo cruzado que dejó el leak. El chokepoint la descarta.
    await reunion("s-ajena", p.id, otra.clientId, "Secreto de la otra empresa");

    const sola = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-marketing", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: sola.canvasId, agentRunId: null });
    const mensaje = generacion.fn.mock.calls.at(-1)?.[1] as string;
    expect(mensaje).toContain("Quieren el pipeline de distribuidores");
    expect(mensaje).toContain("LAS REUNIONES DEL PROYECTO");
    expect(mensaje).not.toContain("Secreto de la otra empresa");

    await reunion("s-otra-propia", p.id, p.clientId, "Hablamos del frente de servicio");
    const conFoco = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-marketing", porEmail: null });
    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: conFoco.canvasId }, select: { sections: true } });
    await prisma.projectCanvas.update({ where: { id: conFoco.canvasId }, data: { sections: conReunionesDeLaCopia(fila.sections, ["s-otra-propia"]) as object[] } });
    await generarCopia({ projectId: p.id, canvasId: conFoco.canvasId, agentRunId: null });
    const elegida = generacion.fn.mock.calls.at(-1)?.[1] as string;
    expect(elegida).toContain("Hablamos del frente de servicio");
    expect(elegida).not.toContain("Quieren el pipeline de distribuidores");
  });

  it("⛔ sin elegidas lee lo elegido en su tipo y deja afuera lo que se sacó de su tipo, no de otro", async () => {
    const p = await proyecto();
    const reunion = async (id: string, dicho: string, afinado: { kickoffOverride?: boolean; planningOverride?: boolean }) => {
      await prisma.firefliesSession.create({
        data: {
          id,
          title: `Reunión ${id}`,
          date: new Date("2026-09-10T15:00:00Z"),
          participants: ["csm@smarteamcr.com"],
          resolvedClientId: p.clientId,
          transcript: `${dicho} `.repeat(30),
        },
      });
      await prisma.sessionProject.create({ data: { sessionId: id, projectId: p.id, ...afinado } });
    };
    // Puertas adentro: entra porque alguien la eligió, no por la regla de las que entran solas.
    await reunion("s-elegida", "Lo que eligió el equipo", { kickoffOverride: true });
    await reunion("s-sacada", "Lo que el equipo sacó", { kickoffOverride: false, planningOverride: true });
    const c = await crearCopia({ projectId: p.id, tipo: "kickoff", plantillaId: "kickoff", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    const mensaje = generacion.fn.mock.calls.at(-1)?.[1] as string;
    expect(mensaje).toContain("Lo que eligió el equipo");
    expect(mensaje).not.toContain("Lo que el equipo sacó");
  });

  it("⛔ el informe de avance no lee el cronograma; el diagnóstico sí, y los cuestionarios solo donde los lee el de siempre", async () => {
    const p = await proyecto();
    const t = await prisma.projectTimeline.create({ data: { projectId: p.id } });
    await prisma.timelinePhase.create({ data: { timelineId: t.id, name: "Fase Delicada", durationWeeks: 2, order: 0 } });
    const informe = await crearCopia({ projectId: p.id, tipo: "delivery", plantillaId: "informe-de-avance", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: informe.canvasId, agentRunId: null });
    expect(generacion.fn.mock.calls.at(-1)?.[1] as string).not.toContain("Fase Delicada");
    const d = await crearCopia({ projectId: p.id, tipo: "diagnosis", plantillaId: "diagnostico-esencial", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: d.canvasId, agentRunId: null });
    expect(generacion.fn.mock.calls.at(-1)?.[1] as string).toContain("Fase Delicada");
  });

  it("la plantilla por niveles pide las olas; lo que el agente deja vacío guarda su porqué", async () => {
    const p = await proyecto();
    generacion.fn.mockImplementation(async () => ({ sections: [{ key: "plan_despliegue", data: { intro: "", items: [] } }], porQueVacias: { plan_despliegue: "No encontré quién entra primero." } }));
    const c = await crearCopia({ projectId: p.id, tipo: "adoption-plan", plantillaId: "adopcion-por-niveles", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    expect(generacion.fn.mock.calls.at(-1)?.[1] as string).toContain("escribe el plan de despliegue por olas");
    const b = await prisma.canvasBlock.findFirst({ where: { section: { canvasId: c.canvasId, key: "plan_despliegue" } }, select: { data: true } });
    expect(JSON.stringify(b?.data)).toContain("No encontré quién entra primero.");
  });

  it("las plantillas de marketing escriben los canales, los formularios y los informes; la completa no", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-marketing", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    const pedidas = (generacion.fn.mock.calls.at(-1)?.[0] as BcTemplateDef).sections.filter((s) => s.agentGenerated !== false).map((s) => s.key);
    expect(pedidas).toEqual(expect.arrayContaining(["canales_entrada", "formularios", "informes"]));
    const completa = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: completa.canvasId, agentRunId: null });
    const deLaCompleta = (generacion.fn.mock.calls.at(-1)?.[0] as BcTemplateDef).sections.filter((s) => s.agentGenerated !== false).map((s) => s.key);
    expect(deLaCompleta).not.toContain("formularios");
    // Lo que no escribe dice quién lo llena, solo para el equipo.
    const bloque = await prisma.canvasBlock.findFirst({ where: { section: { canvasId: completa.canvasId, key: "formularios" } }, select: { data: true } });
    expect(JSON.stringify(bloque?.data)).toContain("La IA no escribe los formularios");
  });

  it("el informe de avance no dice que el proyecto terminó", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "delivery", plantillaId: "informe-de-avance", porEmail: null });
    const cierre = await prisma.canvasBlock.findFirst({ where: { section: { canvasId: c.canvasId, key: "cierre" } }, select: { data: true } });
    expect(JSON.stringify(cierre?.data)).toContain("Así vamos");
    expect(JSON.stringify(cierre?.data)).not.toContain("Hasta acá llega");
  });

  it("⛔ una copia de Ejecución lee el handoff entero: es interna, y sin él pagaría una corrida a ciegas", async () => {
    const p = await proyecto();
    const h = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "handoff", name: "Handoff", sections: [] } });
    const s = await prisma.canvasSection.create({ data: { canvasId: h.id, key: "contexto_del_negocio", label: "Contexto", order: 0 } });
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "TEXT", content: "Lo vendido: tres pipelines", source: "AGENT", status: "CONFIRMED" } });
    const c = await crearCopia({ projectId: p.id, tipo: "implementation", nombre: "Ventas", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });
    expect(JSON.stringify(generacion.fn.mock.calls.at(-1))).toContain("tres pipelines");
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
    generacion.fn.mockImplementation(async () => ({ porQueVacias: {}, sections: [{ key: "propiedades", data: { filas: [{ objeto: "Negocio", nombre: "Monto", tipo: "numero" }] } }] }));

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
    const i = await crearCopia({ projectId: p.id, tipo: "tech-requirements", porEmail: null });
    await generarCopia({ projectId: p.id, canvasId: i.canvasId, agentRunId: null });
    expect(generacion.fn.mock.calls[0][1] as string).not.toContain("Duplicar los test drive");
  });

  it("⛔ una sección borrada de una copia no vuelve al regenerar", async () => {
    const p = await proyecto();
    const c = await crearCopia({ projectId: p.id, tipo: "adoption-plan", plantillaId: "adopcion-equipo-comercial", porEmail: null });
    const s = await prisma.canvasSection.findFirstOrThrow({ where: { canvasId: c.canvasId, key: "reglas" }, select: { id: true } });
    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: c.canvasId }, select: { sections: true } });
    await prisma.canvasSection.delete({ where: { id: s.id } });
    await prisma.projectCanvas.update({ where: { id: c.canvasId }, data: { sections: conSeccionQuitada(fila.sections, "reglas") as never } });

    await generarCopia({ projectId: p.id, canvasId: c.canvasId, agentRunId: null });

    expect(await prisma.canvasSection.count({ where: { canvasId: c.canvasId, key: "reglas" } })).toBe(0);
    expect((generacion.fn.mock.calls[0][0] as BcTemplateDef).sections.map((x) => x.key)).not.toContain("reglas");
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
