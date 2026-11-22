/**
 * lib/timeline/historial-del-cronograma.int.test.ts — el historial del cronograma contra una base REAL (21 nov): sus
 * versiones son las fotos que ya guardaba; el plan aprobado («Congelado») no es lo que ve el cliente; «Lo que ve el
 * cliente» es la versión igual a la foto publicada, y solo mientras siga compartido. Solo lee.
 *
 * Corre contra nexus_test (local embebida, ver test/setup.integration.ts). La base llega VACÍA a cada caso.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { cronogramaDeLaVersion, historialDelCronograma } from "./historial-del-cronograma-server";

const foto = (semanas: number) =>
  ({
    anchorStartDate: "2026-12-01T00:00:00.000Z",
    phases: [{ id: "f1", name: "Configuración", order: 0, durationWeeks: semanas, startWeek: null, sessionCount: 2, tasks: [{ id: "t1", title: "Pipeline", weekIndex: 0, order: 0 }] }],
  }) as unknown as Prisma.InputJsonValue;

async function mundo() {
  const cliente = await prisma.client.create({ data: { name: "Cafetalera (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Cafetalera - Implementación" } });
  const t = await prisma.projectTimeline.create({ data: { projectId: proyecto.id, anchorStartDate: new Date("2026-12-01T00:00:00.000Z") }, select: { id: true } });
  const fase = await prisma.timelinePhase.create({ data: { timelineId: t.id, name: "Configuración", order: 0, durationWeeks: 4, sessionCount: 2 }, select: { id: true } });
  await prisma.timelineTask.create({ data: { phaseId: fase.id, title: "Pipeline", weekIndex: 0 } });
  return { projectId: proyecto.id, timelineId: t.id, faseId: fase.id };
}

describe("el historial del cronograma, en la base", () => {
  it("lo publicado es lo que ve el cliente; el plan aprobado se congela sin serlo", async () => {
    const m = await mundo();
    await prisma.timelineChange.create({ data: { timelineId: m.timelineId, reason: "Aplicado lo del chat", kind: "AI_ASSIST", snapshot: foto(3), createdAt: new Date("2026-11-10T12:00:00.000Z") } });
    await prisma.timelineChange.create({ data: { timelineId: m.timelineId, reason: "Publicación al cliente", kind: "MANUAL", snapshot: foto(3), createdAt: new Date("2026-11-11T12:00:00.000Z") } });
    await prisma.timelineBaseline.create({ data: { timelineId: m.timelineId, version: 2, snapshot: foto(4), firmness: {}, capturedAt: new Date("2026-11-12T12:00:00.000Z") } });
    await prisma.projectTimeline.update({ where: { id: m.timelineId }, data: { publishedSnapshot: foto(3) } });

    // Sin compartir, nadie lo ve.
    expect((await historialDelCronograma(m.projectId))?.versiones.some((v) => v.esLoQueVeElCliente)).toBe(false);
    await prisma.project.update({ where: { id: m.projectId }, data: { timelinePublishedAt: new Date() } });
    const h = await historialDelCronograma(m.projectId);
    // El vivo (4 semanas) es igual al plan aprobado: esa es la actual.
    expect(h?.versiones.map((v) => [v.tipo, v.esActual, v.esLoQueVeElCliente])).toEqual([
      ["congelado", true, false],
      ["publicado", false, true],
      ["ia", false, false],
    ]);
    const id = h!.versiones[1].id!;
    expect((await cronogramaDeLaVersion(m.projectId, id))?.fases[0]).toMatchObject({ semanas: 3, tareas: [{ titulo: "Pipeline", semana: 0 }] });
  });

  it("una versión de otro proyecto es null (un 404 en la ruta)", async () => {
    const a = await mundo();
    const b = await mundo();
    const c = await prisma.timelineChange.create({ data: { timelineId: b.timelineId, reason: "x", kind: "MANUAL", snapshot: foto(2) }, select: { id: true } });
    expect(await cronogramaDeLaVersion(a.projectId, `cambio:${c.id}`)).toBeNull();
    expect(await cronogramaDeLaVersion(b.projectId, `cambio:${c.id}`)).not.toBeNull();
  });
});
