/**
 * lib/canvas/planificacion-generate.int.test.ts — la corrida de la Planificación contra una base REAL, con el modelo
 * simulado (2026-10-29, feedback de Elías sobre la de SmartAgro). Lo que se prueba:
 *   · las reuniones del proyecto con texto llegan al modelo sin que nadie las elija, y las sacadas no;
 *   · lo que queda vacío lleva su porqué, sin inventar contenido, y regenerar con contenido lo quita;
 *   · lo que escribió una persona en una sección curada no se toca;
 *   · el Brief traído se lee como fuente, no se pisa al regenerar y ⛔ nunca sale en la foto que ve el cliente;
 *   · traer el Brief a una planificación esencial no le suma las secciones de la completa.
 *
 * Corre contra nexus_test (local embebida, ver test/setup.integration.ts). La base llega VACÍA a cada caso.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const crear = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: crear } } }));

import { prisma } from "@/lib/db/prisma";
import { porQueVacia } from "@/lib/landing/por-que-vacia";
import { POR_QUE_DE_LAS_CURADAS } from "@/lib/planificacion/por-que-vacia";
import { BRIEF_IMPORTADO_KEY, briefDesdeLibro } from "@/lib/planificacion/brief-importado";
import { estadoDelBriefEnLaPlanificacion, guardarBriefEnLaPlanificacion } from "@/lib/planificacion/brief-importado-server";
import { fronteraDeLaPieza } from "@/lib/contexto/frontera-de-los-documentos";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { loadCanvasesConContenido } from "@/lib/pieces/piece-content";
import { publicarDocumento } from "@/lib/projects/publicar-documento";
import { PLANIFICACION_ESENCIAL_TEMPLATE, PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";
import { PLANIFICACION_CANVAS } from "@/lib/canvas/canvas-defs";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { ensurePlanificacionCanvas, runPlanificacionGeneration } from "./planificacion-generate";

const largo = (t: string, n: number) => Array.from({ length: Math.ceil(n / (t.length + 1)) }, () => t).join(" ");

/** La respuesta del modelo: JSON con lo que se le pase, cierre normal. */
const respuesta = (obj: unknown) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] });

async function mundo() {
  await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteamcr.com"] } });
  const cliente = await prisma.client.create({ data: { name: "Agro (test)", emailDomains: ["agro.test"] } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Agro - Implementación" } });
  const reunion = (id: string, dia: number, texto: string) =>
    prisma.firefliesSession.create({
      data: {
        id,
        title: `Reunión ${id}`,
        date: new Date(Date.UTC(2026, 8, dia, 15)),
        participants: ["heilyn@agro.test", "csm@smarteamcr.com"],
        resolvedClientId: cliente.id,
        transcript: largo(texto, 300),
      },
    });
  await reunion("ses-viva", 10, "PIPELINE-DE-DIAGNOSTICO cuatro etapas");
  await reunion("ses-sacada", 12, "LO-QUE-SE-SACO del contexto");
  await prisma.sessionProject.createMany({
    data: [
      { sessionId: "ses-viva", projectId: proyecto.id },
      { sessionId: "ses-sacada", projectId: proyecto.id, planningOverride: false },
    ],
  });
  return { cliente, proyecto };
}

const seccion = (canvasId: string, key: string) =>
  prisma.canvasSection.findUnique({ where: { canvasId_key: { canvasId, key } }, select: { id: true, blocks: { select: { data: true, source: true } } } });

beforeEach(() => crear.mockReset());

describe("la corrida de la Planificación (2026-10-29) — DB real, modelo simulado", () => {
  it("⛔ lo que se escribe a mitad de la corrida en una curada no se pisa", async () => {
    const { proyecto } = await mundo();
    const canvasId = await ensurePlanificacionCanvas(proyecto.id);
    const usuarios = (await seccion(canvasId, "usuarios_permisos"))!;
    const vacio = await prisma.canvasBlock.create({
      data: { sectionId: usuarios.id, blockType: "CARD", data: { intro: "", equipos: [], usuarios: [] }, order: 0, source: "HUMAN", status: "CONFIRMED" },
    });
    const formularios = (await seccion(canvasId, "formularios"))!;
    const escrito = { intro: "", equipos: [], usuarios: [{ id: "u1", nombre: "Heilyn", correo: "h@agro.test" }] };
    const form = { intro: "El formulario del sitio", items: [] };
    // Mientras el modelo piensa, el cliente escribe en su enlace y alguien del equipo crea la sección.
    crear.mockImplementation(async () => {
      await prisma.canvasBlock.update({ where: { id: vacio.id }, data: { data: escrito } });
      await prisma.canvasBlock.create({ data: { sectionId: formularios.id, blockType: "CARD", data: form, order: 0, source: "HUMAN", status: "CONFIRMED" } });
      return respuesta({ planificacion: { headline: "Plan" } });
    });
    await runPlanificacionGeneration({ projectId: proyecto.id, canvasId });
    expect((await seccion(canvasId, "usuarios_permisos"))?.blocks.map((b) => b.data)).toEqual([escrito]);
    expect((await seccion(canvasId, "formularios"))?.blocks.map((b) => b.data)).toEqual([form]);
  });

  it("lo escrito a mano en una sección que el agente deja vacía se queda, sin el aviso", async () => {
    const { proyecto } = await mundo();
    const canvasId = await ensurePlanificacionCanvas(proyecto.id);
    const pipelines = (await seccion(canvasId, "pipelines"))!;
    const escrito = { intro: "El pipeline que acordamos en el pasillo", pipelines: [] };
    await prisma.canvasBlock.create({ data: { sectionId: pipelines.id, blockType: "CARD", data: escrito, order: 0, source: "HUMAN", status: "CONFIRMED" } });
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" }, __vacias: { pipelines: "No encontré con qué." } }));
    await runPlanificacionGeneration({ projectId: proyecto.id, canvasId });
    const s = (await seccion(canvasId, "pipelines"))!;
    expect(s.blocks.map((b) => b.data)).toEqual([escrito]);
    expect(s.blocks[0].source).toBe("HUMAN");
  });

  it("lo que se escribe a mitad de la corrida en una generable que el agente deja vacía también se queda", async () => {
    const { proyecto } = await mundo();
    const canvasId = await ensurePlanificacionCanvas(proyecto.id);
    const pipelines = (await seccion(canvasId, "pipelines"))!;
    const escrito = { intro: "Lo escrito mientras generaba", pipelines: [] };
    crear.mockImplementation(async () => {
      await prisma.canvasBlock.create({ data: { sectionId: pipelines.id, blockType: "CARD", data: escrito, order: 0, source: "HUMAN", status: "CONFIRMED" } });
      return respuesta({ planificacion: { headline: "Plan" } });
    });
    await runPlanificacionGeneration({ projectId: proyecto.id, canvasId });
    expect((await seccion(canvasId, "pipelines"))?.blocks.map((b) => b.data)).toEqual([escrito]);
  });

  it("deja en la corrida qué reuniones leyó", async () => {
    const { proyecto, cliente } = await mundo();
    const run = await prisma.agentRun.create({ data: { clientId: cliente.id, projectId: proyecto.id, status: "RUNNING" } });
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    await runPlanificacionGeneration({ projectId: proyecto.id, agentRunId: run.id });
    expect((await prisma.agentRun.findUnique({ where: { id: run.id } }))?.sourceSessionIds).toEqual(["ses-viva"]);
  });

  it("las elegidas a mano van primero: los últimos seguimientos no las desplazan", async () => {
    const { proyecto, cliente } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "ses-taller", title: "Taller", date: new Date(Date.UTC(2026, 3, 1, 15)), participants: ["heilyn@agro.test"], resolvedClientId: cliente.id, transcript: largo("TALLER-VIEJO", 300) },
    });
    await prisma.sessionProject.create({ data: { sessionId: "ses-taller", projectId: proyecto.id, planningOverride: true, source: "manual" } });
    for (let i = 0; i < 8; i++) {
      await prisma.firefliesSession.create({
        data: { id: `ses-seg-${i}`, title: `Seguimiento ${i}`, date: new Date(Date.UTC(2026, 9, i + 1, 15)), participants: ["heilyn@agro.test"], resolvedClientId: cliente.id, transcript: largo("SEGUIMIENTO", 300) },
      });
      await prisma.sessionProject.create({ data: { sessionId: `ses-seg-${i}`, projectId: proyecto.id } });
    }
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    await runPlanificacionGeneration({ projectId: proyecto.id });
    const mensaje = crear.mock.calls[0][0].messages[0].content as string;
    const encabezado = mensaje.split("\n").find((l) => l.includes("Reunión ses-taller") || l.includes("Taller"));
    expect(encabezado).toBeDefined();
    expect(encabezado).not.toContain("en resumen");
    expect(mensaje).toContain("TALLER-VIEJO");
  });

  it("⛔ con solo el Brief, el agente recibe igual la regla de lo que no pasa al cliente", async () => {
    const cliente = await prisma.client.create({ data: { name: "Sin reuniones (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Sin reuniones" } });
    const brief = briefDesdeLibro({ titulo: "B", url: "", pestanas: [{ nombre: "P", celdas: [["DATO-DEL-BRIEF"]] }] }, { importadoEn: "", importadoPor: "x" });
    await guardarBriefEnLaPlanificacion(proyecto.id, brief);
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    await runPlanificacionGeneration({ projectId: proyecto.id });
    const mensaje = crear.mock.calls[0][0].messages[0].content as string;
    const regla = fronteraDeLaPieza("planning");
    expect(mensaje.indexOf(regla)).toBeLessThan(mensaje.indexOf("DATO-DEL-BRIEF"));
    expect(mensaje.lastIndexOf(regla)).toBeGreaterThan(mensaje.indexOf("DATO-DEL-BRIEF"));
  });

  it("le llegan las reuniones del proyecto sin elegir; la sacada no", async () => {
    const { proyecto } = await mundo();
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    await runPlanificacionGeneration({ projectId: proyecto.id });
    const mensaje = crear.mock.calls[0][0].messages[0].content as string;
    expect(mensaje).toContain("PIPELINE-DE-DIAGNOSTICO");
    expect(mensaje).not.toContain("LO-QUE-SE-SACO");
    expect(mensaje).not.toContain("SIN REUNIONES ELEGIDAS");
  });

  it("lo vacío dice por qué: la frase del agente, las curadas quién las llena, sin diagnóstico y con adopción directa", async () => {
    const { proyecto } = await mundo();
    crear.mockResolvedValue(
      respuesta({ planificacion: { headline: "Plan" }, __vacias: { pipelines: "No encontré en las reuniones con qué llenar los pipelines." } }),
    );
    const { canvasId } = await runPlanificacionGeneration({ projectId: proyecto.id });
    const razon = async (key: string) => porQueVacia((await seccion(canvasId, key))?.blocks[0]?.data);
    expect(await razon("pipelines")).toBe("No encontré en las reuniones con qué llenar los pipelines.");
    expect(await razon("formularios")).toBe(POR_QUE_DE_LAS_CURADAS.formularios);
    expect(await razon("acciones_en_detalle")).toMatch(/no hay diagnóstico/);
    // Se mudó al plan de adopción: una planificación nueva no la trae.
    expect(await seccion(canvasId, "plan_despliegue")).toBeNull();
    expect(await razon("automatizaciones")).toMatch(/No encontré en las reuniones, el handoff ni el diagnóstico/);
    expect(await razon("planificacion")).toBeNull();
  });

  it("⛔ una planificación vieja conserva sus olas y sus rutinas, visibles, al regenerar", async () => {
    const { proyecto } = await mundo();
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    const { canvasId } = await runPlanificacionGeneration({ projectId: proyecto.id });
    const s = await prisma.canvasSection.create({ data: { canvasId, key: "plan_despliegue", label: "Plan de despliegue por olas", order: 90 } });
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { items: [{ title: "Ola 1", detail: "Ventas de CR" }] }, source: "AGENT", status: "CONFIRMED" } });

    await runPlanificacionGeneration({ projectId: proyecto.id });

    const b = await prisma.canvasBlock.findFirstOrThrow({ where: { sectionId: s.id } });
    expect((b.data as { items: Array<{ title: string }> }).items[0].title).toBe("Ola 1");
    const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    const entrada = (c.sections as Array<{ key: string; hidden?: boolean }>).find((e) => e.key === "plan_despliegue");
    expect(entrada?.hidden ?? false).toBe(false);
  });

  it("regenerar con contenido quita el porqué; lo que escribió una persona en una curada no se toca", async () => {
    const { proyecto } = await mundo();
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    const { canvasId } = await runPlanificacionGeneration({ projectId: proyecto.id });
    const cotizaciones = (await seccion(canvasId, "cotizaciones"))!;
    await prisma.canvasBlock.deleteMany({ where: { sectionId: cotizaciones.id } });
    const escrito = { intro: "", propiedades: "Validez", formato: "", ajustes: "" };
    await prisma.canvasBlock.create({ data: { sectionId: cotizaciones.id, blockType: "CARD", data: escrito, order: 0, source: "HUMAN", status: "CONFIRMED" } });

    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" }, pipelines: { intro: "Dos pipelines.", pipelines: [] } }));
    await runPlanificacionGeneration({ projectId: proyecto.id });
    expect(porQueVacia((await seccion(canvasId, "pipelines"))?.blocks[0]?.data)).toBeNull();
    const despues = (await seccion(canvasId, "cotizaciones"))!;
    expect(despues.blocks).toHaveLength(1);
    expect(despues.blocks[0].data).toEqual(escrito);
    expect(despues.blocks[0].source).toBe("HUMAN");
  });

  it("el Brief traído se lee como fuente y regenerar no lo pisa", async () => {
    const { proyecto } = await mundo();
    const brief = briefDesdeLibro(
      { titulo: "Brief Agro", url: "https://docs.google.com/spreadsheets/d/x/edit", pestanas: [{ nombre: "Usuarios", celdas: [["DATO-DEL-BRIEF", "Ventas"]] }] },
      { importadoEn: "2026-10-29T12:00:00.000Z", importadoPor: "ana@smarteamcr.com" },
    );
    const { canvasId, creoLaPlanificacion } = await guardarBriefEnLaPlanificacion(proyecto.id, brief);
    expect(creoLaPlanificacion).toBe(true);

    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    await runPlanificacionGeneration({ projectId: proyecto.id });
    expect(crear.mock.calls[0][0].messages[0].content as string).toContain("DATO-DEL-BRIEF");
    const s = (await seccion(canvasId, BRIEF_IMPORTADO_KEY))!;
    expect(s.blocks).toHaveLength(1);
    expect((s.blocks[0].data as { titulo: string }).titulo).toBe("Brief Agro");
    expect(porQueVacia(s.blocks[0].data)).toBeNull();

    // ⛔ El enlace del cliente y el PDF filtran por `hiddenKeysFrom`, con el Json real del documento.
    const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
    expect(hiddenKeysFrom(c?.sections).has(BRIEF_IMPORTADO_KEY)).toBe(true);
    // ⛔ Otro agente no lo lee, con `soloVisibles` o sin él, ni al aviso de una sección vacía.
    for (const opts of [{}, { soloVisibles: true }]) {
      const texto = await loadCanvasContext(proyecto.id, "planning", opts);
      expect(texto).not.toContain("DATO-DEL-BRIEF");
      expect(texto).not.toContain("La IA no escribe");
    }
  });

  it("⛔ publicar no congela el Brief ni los avisos: la foto no los tiene", async () => {
    const { proyecto } = await mundo();
    const brief = briefDesdeLibro({ titulo: "B", url: "", pestanas: [{ nombre: "P", celdas: [["DATO-DEL-BRIEF"]] }] }, { importadoEn: "", importadoPor: "x" });
    const { canvasId } = await guardarBriefEnLaPlanificacion(proyecto.id, brief);
    crear.mockResolvedValue(respuesta({ planificacion: { headline: "Plan" } }));
    await runPlanificacionGeneration({ projectId: proyecto.id });
    const r = await publicarDocumento(proyecto.id, "planificacion");
    expect(r.status).toBe(200);
    const foto = JSON.stringify((await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { publishedSnapshot: true } }))?.publishedSnapshot);
    expect(foto).toContain("Plan");
    expect(foto).not.toContain("DATO-DEL-BRIEF");
    expect(foto).not.toContain(BRIEF_IMPORTADO_KEY);
    expect(foto).not.toContain("__porQueVacia");
  });

  it("traer el Brief no vuelve generada la Planificación, y solo con él no se publica", async () => {
    const { proyecto } = await mundo();
    const brief = briefDesdeLibro({ titulo: "B", url: "", pestanas: [{ nombre: "P", celdas: [["x"]] }] }, { importadoEn: "", importadoPor: "x" });
    const { canvasId } = await guardarBriefEnLaPlanificacion(proyecto.id, brief);
    const con = await loadCanvasesConContenido(proyecto.id, [{ id: canvasId, slug: "planning" }]);
    expect(con.has(canvasId)).toBe(false);
    expect((await publicarDocumento(proyecto.id, "planificacion")).status).toBe(409);
  });

  it("volver a traer guarda la foto de antes y reemplaza; `estado` dice que ya hay Brief", async () => {
    const { proyecto } = await mundo();
    const hoja = (t: string) => briefDesdeLibro({ titulo: t, url: "", pestanas: [{ nombre: "P", celdas: [["x"]] }] }, { importadoEn: "", importadoPor: "x" });
    const { canvasId } = await guardarBriefEnLaPlanificacion(proyecto.id, hoja("Primera"));
    expect(await estadoDelBriefEnLaPlanificacion(proyecto.id)).toEqual({ hayPlanificacion: true, yaTieneBrief: true, titulo: "Primera" });
    await guardarBriefEnLaPlanificacion(proyecto.id, hoja("Segunda"));
    const s = (await seccion(canvasId, BRIEF_IMPORTADO_KEY))!;
    expect(s.blocks).toHaveLength(1);
    expect((s.blocks[0].data as { titulo: string }).titulo).toBe("Segunda");
    expect(await prisma.versionDeDocumento.count({ where: { canvasId, origen: "Antes de volver a traer el Brief" } })).toBe(1);
  });

  it("traer el Brief a una planificación esencial no le suma las secciones de la completa", async () => {
    const { proyecto } = await mundo();
    const canvasId = await ensurePlanificacionCanvas(proyecto.id, PLANIFICACION_ESENCIAL_TEMPLATE);
    // La esencial nació sin el Brief (un documento de antes de esta sección).
    await prisma.canvasSection.deleteMany({ where: { canvasId, key: BRIEF_IMPORTADO_KEY } });
    const antes = await prisma.canvasSection.count({ where: { canvasId } });
    expect(antes).toBeLessThan(PLANIFICACION_TEMPLATE.sections.length);
    const brief = briefDesdeLibro({ titulo: "B", url: "", pestanas: [{ nombre: "P", celdas: [["x"]] }] }, { importadoEn: "", importadoPor: "x" });
    const r = await guardarBriefEnLaPlanificacion(proyecto.id, brief);
    expect(r).toEqual({ canvasId, creoLaPlanificacion: false });
    expect(await prisma.canvasSection.count({ where: { canvasId } })).toBe(antes + 1);
    expect(await prisma.projectCanvas.count({ where: canvasOfNested(PLANIFICACION_CANVAS.slug, { projectId: proyecto.id }) })).toBe(1);
  });
});
