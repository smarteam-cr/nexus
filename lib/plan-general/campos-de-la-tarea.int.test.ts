/**
 * lib/plan-general/campos-de-la-tarea.int.test.ts — `PATCH .../tasks/[taskId]/campos` contra una base REAL (2026-11-19).
 *
 * Es la ruta con que el plan general de la cuenta guarda lo que se edita en el panel de la tarea. Lo que no puede
 * romperse: la duración se recorta a lo que queda de la fase (como el PUT), mover la tarea de semana la acorta si ya no
 * cabe, se mueve a otra fase de SU cronograma con el orden pedido, nunca a la fase de otro proyecto, y una tarea de otro
 * proyecto no se toca. Los guards son falsos (la persona sale de ahí).
 * `npx vitest run --project integration lib/plan-general/campos-de-la-tarea.int.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const guards = vi.hoisted(() => ({ guardTimelineEdit: vi.fn(), guardTimelineDelete: vi.fn() }));
vi.mock("@/lib/auth/api-guards", () => guards);
// La ruta llama a lib/timeline/una-tarea.ts (2026-11-26), que es solo de servidor.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { DELETE, PATCH } from "@/app/api/projects/[projectId]/timeline/tasks/[taskId]/campos/route";

beforeEach(() => {
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: "cse@smarteam.cr" }, clientId: "x" });
  guards.guardTimelineDelete.mockResolvedValue({ user: { email: "cse@smarteam.cr" }, clientId: "x" });
});

async function cronograma(nombre: string) {
  const c = await prisma.client.create({ data: { name: nombre, kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: `Proyecto ${nombre}`, tags: [] } });
  const tl = await prisma.projectTimeline.create({ data: { projectId: p.id } });
  const a = await prisma.timelinePhase.create({ data: { timelineId: tl.id, name: "Loop A", order: 0, durationWeeks: 6, loopNumero: 1 } });
  const b = await prisma.timelinePhase.create({ data: { timelineId: tl.id, name: "Loop B", order: 1, durationWeeks: 4, loopNumero: 2 } });
  return { c, p, tl, a, b };
}

const tarea = (phaseId: string, title: string, weekIndex: number, order = 0, extra: { semanas?: number; source?: "AGENT" | "HUMAN" } = {}) =>
  prisma.timelineTask.create({ data: { phaseId, title, weekIndex, order, ...extra } });

const pedir = (projectId: string, taskId: string, body: unknown) =>
  PATCH({ json: async () => body } as unknown as NextRequest, { params: Promise.resolve({ projectId, taskId }) });

describe("PATCH campos: la duración y la semana", () => {
  it("la duración se recorta a lo que queda de la fase; 1 se guarda como null", async () => {
    const { p, a } = await cronograma("Dura (test)");
    const t = await tarea(a.id, "Larga", 3);
    expect((await (await pedir(p.id, t.id, { semanas: 9 })).json()).semanas).toBe(3); // semanas 4, 5 y 6 de una fase de 6
    expect((await (await pedir(p.id, t.id, { semanas: 1 })).json()).semanas).toBeNull();
  });

  it("mover de semana la acorta si ya no cabe; una semana fuera de la fase es 400", async () => {
    const { p, a } = await cronograma("Mover (test)");
    const t = await tarea(a.id, "Larga", 0, 0, { semanas: 4 });
    const r = await (await pedir(p.id, t.id, { weekIndex: 4 })).json();
    expect([r.weekIndex, r.semanas]).toEqual([4, 2]);
    expect((await pedir(p.id, t.id, { weekIndex: 6 })).status).toBe(400);
  });

  it("editarla la revisa: deja de estar por validar y la de la IA pasa a MODIFIED", async () => {
    const { p, a } = await cronograma("Revisar (test)");
    const t = await prisma.timelineTask.create({ data: { phaseId: a.id, title: "Sugerida", weekIndex: 0, source: "AGENT", needsValidation: true } });
    await pedir(p.id, t.id, { title: "Revisada", party: "CLIENTE", type: "SESSION", dueDateOverride: "2026-11-20" });
    const x = await prisma.timelineTask.findUniqueOrThrow({ where: { id: t.id } });
    expect([x.title, x.party, x.type, x.source, x.needsValidation]).toEqual(["Revisada", "CLIENTE", "SESSION", "MODIFIED", false]);
    expect(x.dueDateOverride?.toISOString().slice(0, 10)).toBe("2026-11-20");
  });
});

describe("PATCH campos: moverla de fase y de lugar", () => {
  it("a otra fase de su cronograma, en el lugar pedido, y las demás se corren", async () => {
    const { p, a, b } = await cronograma("Lugar (test)");
    const x = await tarea(b.id, "X", 1, 0);
    const y = await tarea(b.id, "Y", 1, 1);
    const t = await tarea(a.id, "Viaja", 0, 0, { semanas: 5 });
    const r = await (await pedir(p.id, t.id, { phaseId: b.id, weekIndex: 1, order: 1 })).json();
    expect([r.phaseId, r.weekIndex, r.semanas]).toEqual([b.id, 1, 3]); // la fase B tiene 4: de la 2 a la 4
    const orden = await prisma.timelineTask.findMany({ where: { phaseId: b.id, weekIndex: 1 }, orderBy: { order: "asc" }, select: { id: true } });
    expect(orden.map((o) => o.id)).toEqual([x.id, t.id, y.id]);
  });

  it("⛔ nunca a la fase de otro proyecto, y una tarea de otro proyecto no se toca", async () => {
    const uno = await cronograma("Uno (test)");
    const otro = await cronograma("Otro (test)");
    const t = await tarea(uno.a.id, "Mía", 0);
    expect((await pedir(uno.p.id, t.id, { phaseId: otro.a.id })).status).toBe(400);
    expect((await pedir(otro.p.id, t.id, { title: "Ajena" })).status).toBe(404);
    expect((await prisma.timelineTask.findUniqueOrThrow({ where: { id: t.id } })).phaseId).toBe(uno.a.id);
  });
});

describe("DELETE campos", () => {
  it("borra la tarea de su proyecto; la de otro proyecto es 404", async () => {
    const uno = await cronograma("Borrar (test)");
    const otro = await cronograma("Ajeno (test)");
    const t = await tarea(uno.a.id, "Se va", 0);
    const llamar = (projectId: string) => DELETE({} as NextRequest, { params: Promise.resolve({ projectId, taskId: t.id }) });
    expect((await llamar(otro.p.id)).status).toBe(404);
    expect((await llamar(uno.p.id)).status).toBe(200);
    expect(await prisma.timelineTask.findUnique({ where: { id: t.id } })).toBeNull();
  });
});
