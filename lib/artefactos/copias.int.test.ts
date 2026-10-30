/**
 * lib/artefactos/copias.int.test.ts — varias copias de un tipo en un proyecto, de punta a punta contra una base REAL
 * (etapa V3 de docs/artefactos-plan.md): crear en blanco con una plantilla, duplicar, renombrar, ordenar arrastrando,
 * marcar terminada y archivar; y que el documento de siempre no cambie en nada. Correr con la base local:
 * `npx vitest run --project integration lib/artefactos/copias.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { plantillaDelDocumento } from "@/lib/entregables/registro";
import { SECCIONES_DEL_PLAN_DE_ADOPCION_COMERCIAL } from "./tipos";
import { archivarCopia, crearCopia, documentosDelTipo, marcarTerminado, ordenarDelTipo, renombrarArtefacto } from "./copias-server";
import { nombreDelArtefacto } from "./copias";

async function proyectoConPlanificacion() {
  const c = await prisma.client.create({ data: { name: "Cliente V3 (test)", kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: "Implementación V3" } });
  const deSiempre = await prisma.projectCanvas.create({
    data: { projectId: p.id, slug: "planning", name: "Planificación", order: 3, sections: [{ key: "planificacion", label: "Plan" }] },
  });
  const s = await prisma.canvasSection.create({ data: { canvasId: deSiempre.id, key: "pipelines", label: "Pipelines", order: 0 } });
  await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { intro: "Ventas en 6 etapas" }, source: "AGENT", status: "CONFIRMED" } });
  return { cliente: c, proyecto: p, deSiempre };
}

describe("varias copias de un tipo en un proyecto", () => {
  it("crear, duplicar, renombrar, ordenar, terminar y archivar, sin tocar el documento de siempre", async () => {
    const { proyecto, deSiempre } = await proyectoConPlanificacion();
    const antes = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id } });

    // En blanco, con la plantilla esencial: nace sin slug, con su tipo, su nombre y la plantilla anotada.
    const a = await crearCopia({ projectId: proyecto.id, tipo: "planning", plantillaId: "planificacion-esencial", nombre: "Planificación — Marketing", porEmail: "ana@smarteam.test" });
    const filaA = await prisma.projectCanvas.findUniqueOrThrow({
      where: { id: a.canvasId },
      select: { slug: true, tipoArtefacto: true, name: true, titulo: true, sections: true, order: true, canvasSections: { orderBy: { order: "asc" }, select: { key: true } } },
    });
    expect(filaA).toMatchObject({ slug: null, tipoArtefacto: "planning", titulo: "Planificación — Marketing" });
    expect(filaA.order).toBeGreaterThan(antes.order);
    expect(filaA.canvasSections.map((s) => s.key)).toContain("planificacion");
    expect(filaA.canvasSections.map((s) => s.key)).toContain("cierre");
    expect(plantillaDelDocumento("planning", filaA.sections)).toMatchObject({ guardada: true, plantilla: { id: "planificacion-esencial" } });

    // Sin nombre: «Planificación N», sin repetir. Un nombre de pieza queda guardable en `name` y tal cual en `titulo`.
    const b = await crearCopia({ projectId: proyecto.id, tipo: "planning", porEmail: null });
    expect(b.nombre).toMatch(/^Planificación \d+$/);
    const k = await crearCopia({ projectId: proyecto.id, tipo: "planning", nombre: "Planificación", porEmail: null });
    const filaK = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: k.canvasId }, select: { name: true, titulo: true, slug: true, tipoArtefacto: true } });
    expect(filaK.titulo).toBe("Planificación");
    expect(filaK.name).not.toBe("Planificación");
    expect(nombreDelArtefacto(filaK)).toBe("Planificación");

    // La búsqueda por tipo de siempre sigue devolviendo el documento de siempre, con tres copias al lado.
    const porTipo = await prisma.projectCanvas.findFirst({ where: { projectId: proyecto.id, ...canvasOf("planning") }, select: { id: true } });
    expect(porTipo?.id).toBe(deSiempre.id);

    // Duplicar el de siempre: lo escrito pasa; el de siempre no se toca.
    const d = await crearCopia({ projectId: proyecto.id, tipo: "planning", desdeCanvasId: deSiempre.id, nombre: "Planificación — WhatsApp", porEmail: null });
    const bloquesD = await prisma.canvasBlock.findMany({ where: { section: { canvasId: d.canvasId, key: "pipelines" } }, select: { data: true, source: true } });
    expect(bloquesD).toEqual([{ data: { intro: "Ventas en 6 etapas" }, source: "AGENT" }]);
    // Duplicar algo de otro tipo, o de otro proyecto, no.
    await expect(crearCopia({ projectId: proyecto.id, tipo: "diagnosis", desdeCanvasId: deSiempre.id, porEmail: null })).rejects.toMatchObject({ status: 400 });
    const otro = await proyectoConPlanificacion();
    await expect(crearCopia({ projectId: proyecto.id, tipo: "planning", desdeCanvasId: otro.deSiempre.id, porEmail: null })).rejects.toMatchObject({ status: 404 });

    // Renombrar: la copia y también el de siempre (en `titulo`; su `name` no se toca).
    await renombrarArtefacto(proyecto.id, a.canvasId, "  Plan de Marketing  ");
    await renombrarArtefacto(proyecto.id, deSiempre.id, "Plan general");
    const ds = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id }, select: { name: true, titulo: true, slug: true } });
    expect(ds).toMatchObject({ name: "Planificación", titulo: "Plan general", slug: "planning" });
    await expect(renombrarArtefacto(otro.proyecto.id, a.canvasId, "x")).rejects.toMatchObject({ status: 404 });

    // Ordenar: todos los del tipo, cada uno una vez, en los lugares que ya ocupaban.
    const vivos = await documentosDelTipo(proyecto.id, "planning");
    expect(vivos[0].id).toBe(deSiempre.id);
    const nuevoOrden = [d.canvasId, deSiempre.id, a.canvasId, b.canvasId, k.canvasId];
    await ordenarDelTipo(proyecto.id, "planning", nuevoOrden);
    expect((await documentosDelTipo(proyecto.id, "planning")).map((x) => x.id)).toEqual(nuevoOrden);
    const lugares = vivos.map((v) => v.order).sort((x, y) => x - y);
    expect((await documentosDelTipo(proyecto.id, "planning")).map((x) => x.order)).toEqual(lugares);
    await expect(ordenarDelTipo(proyecto.id, "planning", nuevoOrden.slice(1))).rejects.toMatchObject({ status: 409 });

    // Terminada y de vuelta a en construcción.
    expect((await marcarTerminado(proyecto.id, a.canvasId, true, "ana@smarteam.test")).terminadoEn).not.toBeNull();
    expect(await prisma.projectCanvas.findUniqueOrThrow({ where: { id: a.canvasId }, select: { terminadoPor: true } })).toEqual({ terminadoPor: "ana@smarteam.test" });
    expect((await marcarTerminado(proyecto.id, a.canvasId, false, null)).terminadoEn).toBeNull();

    // Archivar: la copia sale de los vivos y su enlace deja de abrir; el de siempre no se archiva.
    await prisma.accesoAlDocumento.create({ data: { canvasId: b.canvasId, clientId: proyecto.clientId, accessToken: "b".repeat(64) } });
    await archivarCopia(proyecto.id, b.canvasId, "ana@smarteam.test");
    expect((await documentosDelTipo(proyecto.id, "planning")).map((x) => x.id)).not.toContain(b.canvasId);
    expect((await prisma.accesoAlDocumento.findUniqueOrThrow({ where: { canvasId: b.canvasId } })).revokedAt).not.toBeNull();
    await expect(archivarCopia(proyecto.id, deSiempre.id, null)).rejects.toMatchObject({ status: 409 });

    // El documento de siempre: mismo id, mismo slug, mismo contenido.
    const despues = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id } });
    expect({ slug: despues.slug, name: despues.name, sections: despues.sections, disabledAt: despues.disabledAt }).toEqual({
      slug: antes.slug,
      name: antes.name,
      sections: antes.sections,
      disabledAt: antes.disabledAt,
    });
  });

  it("un tipo nuevo nace con las secciones de su plantilla, y un tipo de una sola copia no admite otra", async () => {
    const { proyecto } = await proyectoConPlanificacion();
    const adopcion = await crearCopia({ projectId: proyecto.id, tipo: "adoption-plan", plantillaId: "adopcion-equipo-comercial", porEmail: null });
    const keys = (await prisma.canvasSection.findMany({ where: { canvasId: adopcion.canvasId }, orderBy: { order: "asc" }, select: { key: true } })).map((s) => s.key);
    expect(new Set(keys)).toEqual(new Set(SECCIONES_DEL_PLAN_DE_ADOPCION_COMERCIAL));
    // El cierre curado nace sembrado.
    expect(await prisma.canvasBlock.count({ where: { section: { canvasId: adopcion.canvasId, key: "cierre" } } })).toBe(1);

    const integracion = await crearCopia({ projectId: proyecto.id, tipo: "integration", porEmail: null });
    const keysI = (await prisma.canvasSection.findMany({ where: { canvasId: integracion.canvasId }, select: { key: true } })).map((s) => s.key);
    expect(keysI).toContain("mapa_integracion");
    expect(keysI).not.toContain("estimacion");

    await expect(crearCopia({ projectId: proyecto.id, tipo: "timeline", porEmail: null })).rejects.toMatchObject({ status: 400 });
    await expect(crearCopia({ projectId: proyecto.id, tipo: "delivery", porEmail: null })).rejects.toMatchObject({ status: 400 });
    await expect(crearCopia({ projectId: proyecto.id, tipo: "planning", plantillaId: "no-existe", porEmail: null })).rejects.toMatchObject({ status: 400 });
  });

  it("una copia del kickoff no lleva las secciones que leen el proyecto, pero sí su cierre", async () => {
    const { proyecto } = await proyectoConPlanificacion();
    const k = await crearCopia({ projectId: proyecto.id, tipo: "kickoff", porEmail: null });
    const keys = (await prisma.canvasSection.findMany({ where: { canvasId: k.canvasId }, select: { key: true } })).map((s) => s.key);
    expect(keys).not.toContain("cronograma");
    expect(keys).not.toContain("procesos");
    expect(keys).toContain("cierre");
    expect(keys).toContain("bienvenida");
  });
});
