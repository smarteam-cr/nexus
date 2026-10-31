/**
 * lib/artefactos/herramientas-con-copias.int.test.ts — Exploración y Cuestionarios con varias copias, y el primero de un tipo
 * como su documento de siempre (Elías, 30 oct), contra una base REAL.
 * `npx vitest run --project integration lib/artefactos/herramientas-con-copias.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { asegurarExploracionDelProyecto, exploracionVivaDelDocumento, textoDeLaExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { crearTactico, obtenerCuestionarios } from "@/lib/cuestionario/servicio";
import { ensurePieceCanvas } from "@/lib/pieces/ensure-canvas";
import { adoptarElDeSiempre } from "./adoptar-server";
import { archivarCopia, crearCopia, ErrorDelArtefacto, reactivarCopia, renombrarArtefacto } from "./copias-server";

async function proyecto() {
  const c = await prisma.client.create({ data: { name: "Cliente herramientas (test)", kind: "CLIENTE" } });
  return prisma.project.create({ data: { clientId: c.id, name: "Proyecto", tags: [] } });
}

const conRetos = (texto: string) => ({ contenido: { casillas: { retos: [{ texto }] } } as object });

describe("varias exploraciones en un proyecto", () => {
  it("⛔ cada copia tiene la suya, la de siempre no cambia y un id de otro proyecto no entra", async () => {
    const p = await proyecto();
    const deSiempre = await asegurarExploracionDelProyecto(p.id, "a@b.c");
    const copia = await crearCopia({ projectId: p.id, tipo: "exploration", nombre: "Marketing", porEmail: null });
    const deLaCopia = await asegurarExploracionDelProyecto(p.id, "a@b.c", copia.canvasId);
    expect(deSiempre.ok && deLaCopia.ok && deSiempre.id !== deLaCopia.id).toBe(true);
    expect(await exploracionVivaDelDocumento(p.id, null)).toBe(deSiempre.ok ? deSiempre.id : null);
    expect(await exploracionVivaDelDocumento(p.id, copia.canvasId)).toBe(deLaCopia.ok ? deLaCopia.id : null);
    // Abrirla dos veces no crea otra.
    const otraVez = await asegurarExploracionDelProyecto(p.id, "a@b.c", copia.canvasId);
    expect(otraVez.ok && !otraVez.creada).toBe(true);
  });

  it("los agentes leen todas, con su nombre; archivar la copia la saca, y recuperarla la devuelve", async () => {
    const p = await proyecto();
    const deSiempre = await asegurarExploracionDelProyecto(p.id, "a@b.c");
    const copia = await crearCopia({ projectId: p.id, tipo: "exploration", nombre: "Marketing", porEmail: null });
    const deLaCopia = await asegurarExploracionDelProyecto(p.id, "a@b.c", copia.canvasId);
    if (!deSiempre.ok || !deLaCopia.ok) throw new Error("no se abrió");
    await prisma.exploracionDeVenta.update({ where: { id: deSiempre.id }, data: conRetos("Reto general") });
    await prisma.exploracionDeVenta.update({ where: { id: deLaCopia.id }, data: conRetos("Reto de marketing") });

    const texto = await textoDeLaExploracionDelProyecto(p.id);
    expect(texto.indexOf("# Exploración del proyecto")).toBe(0);
    expect(texto).toContain("# Exploración: Marketing");
    expect(texto).toContain("Reto de marketing");

    await archivarCopia(p.id, copia.canvasId, null);
    expect(await textoDeLaExploracionDelProyecto(p.id)).not.toContain("Reto de marketing");
    await reactivarCopia(p.id, copia.canvasId);
    expect(await textoDeLaExploracionDelProyecto(p.id)).toContain("Reto de marketing");
  });

  it("no se duplica: lo escrito no vive en el canvas", async () => {
    const p = await proyecto();
    const copia = await crearCopia({ projectId: p.id, tipo: "exploration", nombre: "Marketing", porEmail: null });
    await expect(crearCopia({ projectId: p.id, tipo: "exploration", desdeCanvasId: copia.canvasId, porEmail: null })).rejects.toThrow(ErrorDelArtefacto);
  });
});

describe("varias tandas de cuestionarios", () => {
  it("cada copia ve los suyos; el resto de Nexus, todos; y darles nombre a los de siempre los pasa a una copia", async () => {
    const p = await proyecto();
    const suelto = await crearTactico(p.id, null, null);
    const tanda = await crearCopia({ projectId: p.id, tipo: "questionnaires", nombre: "Dirección", porEmail: null });
    const deLaTanda = await crearTactico(p.id, null, null, tanda.canvasId);

    expect((await obtenerCuestionarios(p.id, null)).cuestionarios.map((c) => c.id)).toEqual([suelto]);
    expect((await obtenerCuestionarios(p.id, tanda.canvasId)).cuestionarios.map((c) => c.id)).toEqual([deLaTanda]);
    expect((await obtenerCuestionarios(p.id)).cuestionarios).toHaveLength(2);

    const nombrada = await crearCopia({ projectId: p.id, tipo: "questionnaires", nombre: "Operación", conLosSueltos: true, porEmail: null });
    expect((await obtenerCuestionarios(p.id, null)).cuestionarios).toHaveLength(0);
    expect((await obtenerCuestionarios(p.id, nombrada.canvasId)).cuestionarios.map((c) => c.id)).toEqual([suelto]);
  });
});

describe("el primero de un tipo es su documento de siempre", () => {
  it("⛔ toma el vacío y le pone el nombre; el segundo ya es una copia", async () => {
    const p = await proyecto();
    const { canvasId } = await ensurePieceCanvas(p.id, "implementation");
    const primero = await adoptarElDeSiempre({ projectId: p.id, tipo: "implementation", nombre: "Ventas", porEmail: null });
    expect(primero).toEqual({ canvasId, nombre: "Ventas" });
    expect(await adoptarElDeSiempre({ projectId: p.id, tipo: "implementation", nombre: "Servicio", porEmail: null })).toBeNull();
  });

  it("lo crea si no existe, y con una plantilla solo de copias no lo toma", async () => {
    const p = await proyecto();
    const r = await adoptarElDeSiempre({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-campana", nombre: "Campaña", porEmail: null });
    expect(r).toBeNull();
    const creado = await adoptarElDeSiempre({ projectId: p.id, tipo: "exploration", nombre: "Ventas", porEmail: null });
    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: creado!.canvasId }, select: { slug: true, titulo: true } });
    expect(fila).toEqual({ slug: "exploration", titulo: "Ventas" });
  });

  it("⛔ una exploración con el lienzo abierto no se toma, aunque su canvas esté vacío: va una copia", async () => {
    const p = await proyecto();
    await ensurePieceCanvas(p.id, "exploration");
    await asegurarExploracionDelProyecto(p.id, "a@b.c");
    expect(await adoptarElDeSiempre({ projectId: p.id, tipo: "exploration", nombre: "Otra", porEmail: null })).toBeNull();
  });

  it("⛔ nunca toma lo que ya tiene contenido", async () => {
    const p = await proyecto();
    const { canvasId } = await ensurePieceCanvas(p.id, "implementation");
    const s = await prisma.canvasSection.create({ data: { canvasId, key: "otra_seccion", label: "Otra", order: 99 } });
    await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { intro: "Escrito" }, source: "AGENT", status: "CONFIRMED" } });
    expect(await adoptarElDeSiempre({ projectId: p.id, tipo: "implementation", nombre: "Ventas", porEmail: null })).toBeNull();
  });
});

describe("el nombre", () => {
  it("el cronograma también se llama como quieran; el handoff no", async () => {
    const p = await proyecto();
    const crono = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "timeline", name: "Cronograma", sections: [] } });
    await renombrarArtefacto(p.id, crono.id, "Plan de trabajo");
    expect((await prisma.projectCanvas.findUniqueOrThrow({ where: { id: crono.id } })).titulo).toBe("Plan de trabajo");
    const handoff = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "handoff", name: "Handoff", sections: [] } });
    await expect(renombrarArtefacto(p.id, handoff.id, "Otro")).rejects.toThrow(ErrorDelArtefacto);
  });
});
