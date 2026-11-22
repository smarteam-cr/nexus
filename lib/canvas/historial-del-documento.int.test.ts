/**
 * lib/canvas/historial-del-documento.int.test.ts — el historial de versiones de un canvas contra una base REAL (21 nov).
 * Lo que se prueba:
 *   · lo que escribe la IA queda como «Rehecho con IA» y es la actual; lo escrito a mano después sale como actual sin
 *     guardar, y al reemplazarlo se guarda como «Editado»;
 *   · publicar marca «Lo que ve el cliente» solo mientras siga compartido;
 *   · usar una versión (restaurar) deja «Vuelta a una anterior» como la actual y guarda la de antes;
 *   · las corridas del handoff de antes de la primera versión entran solo para leer.
 *
 * Corre contra nexus_test (local embebida, ver test/setup.integration.ts). La base llega VACÍA a cada caso.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { historialDelCanvas } from "./historial-del-documento-server";
import { guardarVersionDelDocumento, guardarVersionDeLaIA, guardarVersionPublicada, restaurarVersion } from "./versiones";

async function mundo(slug = "kickoff") {
  const cliente = await prisma.client.create({ data: { name: "Cafetalera (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Cafetalera - Implementación" } });
  const canvas = await prisma.projectCanvas.create({ data: { projectId: proyecto.id, name: slug, slug }, select: { id: true } });
  const seccion = await prisma.canvasSection.create({ data: { canvasId: canvas.id, key: "objetivos", label: "Objetivos" }, select: { id: true } });
  return { clienteId: cliente.id, projectId: proyecto.id, canvasId: canvas.id, sectionId: seccion.id };
}

async function escribir(sectionId: string, texto: string) {
  await prisma.canvasBlock.deleteMany({ where: { sectionId } });
  await prisma.canvasBlock.create({ data: { sectionId, blockType: "TEXT", content: texto } });
}

describe("el historial de un canvas, en la base", () => {
  it("la IA deja la actual; lo escrito a mano después sale sin guardar y se guarda como «Editado» al reemplazarlo", async () => {
    const m = await mundo();
    await escribir(m.sectionId, "Lo que escribió la IA.");
    await guardarVersionDeLaIA(m.canvasId, "ana@prueba.test");
    let h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones.map((v) => [v.tipo, v.esActual])).toEqual([["ia", true]]);

    await escribir(m.sectionId, "Lo corrigió Ana a mano.");
    h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones[0]).toMatchObject({ id: null, esActual: true });

    // Rehacer con IA: antes se guarda lo que había (el runner llama así).
    await guardarVersionDelDocumento(m.canvasId, { origen: "Antes de regenerar" });
    await escribir(m.sectionId, "Lo nuevo de la IA.");
    await guardarVersionDeLaIA(m.canvasId, null);
    h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones.map((v) => [v.tipo, v.esActual])).toEqual([
      ["ia", true],
      ["edicion", false],
      ["ia", false],
    ]);
    expect(h?.versiones[0].quien).toBe("Nexus");
  });

  it("publicar marca «Lo que ve el cliente» mientras siga compartido", async () => {
    const m = await mundo();
    await escribir(m.sectionId, "Versión que se sube.");
    await guardarVersionPublicada(m.canvasId, "ana@prueba.test");
    await prisma.projectCanvas.update({ where: { id: m.canvasId }, data: { publishedSnapshotAt: new Date() } });
    // Sin el proyecto compartido, nadie lo ve.
    expect((await historialDelCanvas(m.canvasId))?.versiones.some((v) => v.esLoQueVeElCliente)).toBe(false);
    await prisma.project.update({ where: { id: m.projectId }, data: { kickoffPublishedAt: new Date() } });
    await escribir(m.sectionId, "Un cambio que el cliente todavía no ve.");
    const h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones.map((v) => [v.id === null, v.esActual, v.esLoQueVeElCliente])).toEqual([
      [true, true, false],
      [false, false, true],
    ]);
  });

  it("usar una versión deja «Vuelta a una anterior» como la actual y guarda la de antes", async () => {
    const m = await mundo();
    await escribir(m.sectionId, "Primera.");
    await guardarVersionDeLaIA(m.canvasId, null);
    const primera = (await historialDelCanvas(m.canvasId))!.versiones[0].id!;
    await escribir(m.sectionId, "Segunda.");
    await guardarVersionDeLaIA(m.canvasId, null);
    const r = await restaurarVersion({ canvasId: m.canvasId, versionId: primera, actor: "elias@prueba.test" });
    expect(r.ok).toBe(true);
    const bloques = await prisma.canvasBlock.findMany({ where: { sectionId: m.sectionId }, select: { content: true } });
    expect(bloques.map((b) => b.content)).toEqual(["Primera."]);
    const h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones[0]).toMatchObject({ tipo: "restaurado", esActual: true, quien: "elias@prueba.test" });
    expect(h?.versiones.filter((v) => v.tipo === "ia")).toHaveLength(2);
  });

  it("presentar lo mismo que ya estaba le pone «Presentado» a esa versión, y el diagnóstico compartido la marca", async () => {
    const m = await mundo("diagnosis");
    await escribir(m.sectionId, "El diagnóstico.");
    await guardarVersionDeLaIA(m.canvasId, null);
    await guardarVersionDelDocumento(m.canvasId, { origen: "Presentado al cliente (v1)", creadaPor: "ana@prueba.test", protegida: true, tipo: "presentado" });
    await prisma.project.update({ where: { id: m.projectId }, data: { diagnosticoPublishedAt: new Date() } });
    const h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones).toHaveLength(1);
    expect(h?.versiones[0]).toMatchObject({ tipo: "presentado", esActual: true, esLoQueVeElCliente: true });
  });

  it("el requerimiento técnico compartido se ve en vivo: la actual es lo que ve el cliente", async () => {
    const m = await mundo("tech-requirements");
    await escribir(m.sectionId, "El requerimiento.");
    await guardarVersionDeLaIA(m.canvasId, null);
    expect((await historialDelCanvas(m.canvasId))?.enVivo).toBe(false);
    await prisma.project.update({ where: { id: m.projectId }, data: { desarrolloPublishedAt: new Date() } });
    await escribir(m.sectionId, "Editado en vivo.");
    const h = await historialDelCanvas(m.canvasId);
    expect(h?.enVivo).toBe(true);
    expect(h?.versiones[0]).toMatchObject({ id: null, esActual: true, esLoQueVeElCliente: true });
    expect(h?.versiones[1].esLoQueVeElCliente).toBe(false);
  });

  it("las corridas del handoff de antes de la primera versión entran solo para leer", async () => {
    const m = await mundo("handoff");
    const agente = await prisma.agent.create({ data: { name: "Handoff (test)", systemPrompt: "x", agentGroup: "handoff" }, select: { id: true } });
    const vieja = await prisma.agentRun.create({
      data: { agentId: agente.id, projectId: m.projectId, clientId: m.clienteId, status: "DONE", createdAt: new Date("2026-08-01T12:00:00.000Z") },
      select: { id: true },
    });
    await escribir(m.sectionId, "El handoff de hoy.");
    await guardarVersionDeLaIA(m.canvasId, null);
    // Una corrida DESPUÉS de la primera versión no entra: esa ya quedó como versión.
    await prisma.agentRun.create({ data: { agentId: agente.id, projectId: m.projectId, clientId: m.clienteId, status: "DONE" } });
    const h = await historialDelCanvas(m.canvasId);
    expect(h?.versiones.map((v) => [v.id, v.soloLectura, v.esActual])).toEqual([
      [h?.versiones[0].id, false, true],
      [`corrida:${vieja.id}`, true, false],
    ]);
  });
});
