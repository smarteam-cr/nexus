/**
 * lib/timeline/borrador-aplicar.int.test.ts — APLICAR EL BORRADOR contra una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up` y, si es nueva, `bootstrap`):
 *   npx vitest run lib/timeline/borrador-aplicar.int.test.ts --project integration
 *
 * El test unitario (escribir-estructura.test.ts) prueba el ORDEN con un `tx` falso. Lo que solo una
 * base prueba es lo que hace la transacción de verdad:
 *   · con la huella equivocada, el `throw` DESHACE también la escritura condicional del token (la
 *     propuesta sigue guardada y el cronograma, intacto);
 *   · aplicado, la propuesta se limpió, las fases quedaron en su orden denso, la fase nueva existe y
 *     la tarea que quedaba afuera de una fase acortada cayó en su última semana.
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso).
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { leerBorrador, planDeAplicacion, type Vivo } from "./borrador";
import { aplicarBorradorEnTx, ErrorAlAplicar } from "./escribir-estructura";
import type { ProposalLike } from "./proposal-deltas";

const RUN = "run-propuesta-test";

async function mundoMinimo() {
  const cliente = await prisma.client.create({ data: { name: "Cliente del borrador (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación (test)" } });
  const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id } });
  const crear = (name: string, order: number, durationWeeks: number) =>
    prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
  const a = await crear("Kick-off", 0, 1);
  const b = await crear("Diseño", 1, 2);
  const c = await crear("Pruebas", 2, 3);
  const d = await crear("Cierre", 3, 1);
  const tarea = await prisma.timelineTask.create({ data: { phaseId: c.id, title: "Pruebas de carga", weekIndex: 2 } });
  const fila = (f: typeof a) => ({
    id: f.id,
    name: f.name,
    durationWeeks: f.durationWeeks,
    startWeek: null,
    sessionCount: null,
    notes: null,
    activityType: null,
  });
  const propuesta: ProposalLike = {
    anchorStartDate: "2026-10-05T00:00:00.000Z",
    phases: [
      fila(a),
      { ...fila(b), name: "Diseño funcional" },
      { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: 1, notes: null },
      fila(d),
      { ...fila(c), durationWeeks: 2 },
    ],
  };
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingProposal: propuesta as unknown as Prisma.InputJsonValue, pendingProposalRunId: RUN },
  });
  const vivo: Vivo = { ancla: null, fases: [a, b, c, d].map(fila) };
  return { tl, a, b, c, d, tarea, propuesta, vivo };
}

describe("aplicar el borrador — DB real", () => {
  it("aplicado: la propuesta se limpia, las fases quedan en su orden y la tarea de la fase acortada se acomoda", async () => {
    const m = await mundoMinimo();
    const huella = planDeAplicacion(m.vivo, leerBorrador(m.propuesta, m.vivo)!, []).huella;
    const r = await prisma.$transaction((tx) =>
      aplicarBorradorEnTx(tx, { timelineId: m.tl.id, token: RUN, guardado: m.propuesta, foto: m.vivo, sin: [], huella, ahora: new Date() }),
    );
    expect(r.plan.marcadas).toBe(5);
    const tl = await prisma.projectTimeline.findUniqueOrThrow({
      where: { id: m.tl.id },
      select: { pendingProposal: true, pendingProposalRunId: true, anchorStartDate: true, lastEditedByHuman: true },
    });
    expect(tl.pendingProposal).toBeNull();
    expect(tl.pendingProposalRunId).toBeNull();
    expect(tl.anchorStartDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(tl.lastEditedByHuman).not.toBeNull();
    const fases = await prisma.timelinePhase.findMany({ where: { timelineId: m.tl.id }, orderBy: { order: "asc" } });
    expect(fases.map((f) => [f.name, f.order, f.durationWeeks])).toEqual([
      ["Kick-off", 0, 1],
      ["Diseño funcional", 1, 2],
      ["Piloto", 2, 2],
      ["Cierre", 3, 1],
      ["Pruebas", 4, 2],
    ]);
    expect((await prisma.timelineTask.findUniqueOrThrow({ where: { id: m.tarea.id } })).weekIndex).toBe(1);
  });

  it("⛔ con la huella equivocada NO queda nada escrito: tampoco la limpieza del token", async () => {
    /* La edición que la pone en rojo: comparar la huella fuera de la transacción, o escribir la
       limpieza en una transacción aparte. */
    const m = await mundoMinimo();
    await expect(
      prisma.$transaction((tx) =>
        aplicarBorradorEnTx(tx, { timelineId: m.tl.id, token: RUN, guardado: m.propuesta, foto: m.vivo, sin: [], huella: "otra", ahora: new Date() }),
      ),
    ).rejects.toMatchObject({ codigo: "PLAN_CAMBIO" });
    const tl = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: m.tl.id }, select: { pendingProposalRunId: true, pendingProposal: true } });
    expect(tl.pendingProposalRunId, "la limpieza del token no se deshizo").toBe(RUN);
    expect(tl.pendingProposal).not.toBeNull();
    const fases = await prisma.timelinePhase.findMany({ where: { timelineId: m.tl.id }, orderBy: { order: "asc" } });
    expect(fases.map((f) => f.name)).toEqual(["Kick-off", "Diseño", "Pruebas", "Cierre"]);
  });

  it("⛔ con otro token (la propuesta se reemplazó) no se escribe nada", async () => {
    const m = await mundoMinimo();
    const huella = planDeAplicacion(m.vivo, leerBorrador(m.propuesta, m.vivo)!, []).huella;
    const intento = prisma.$transaction((tx) =>
      aplicarBorradorEnTx(tx, { timelineId: m.tl.id, token: "otra-corrida", guardado: m.propuesta, foto: m.vivo, sin: [], huella, ahora: new Date() }),
    );
    await expect(intento).rejects.toBeInstanceOf(ErrorAlAplicar);
    const tl = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: m.tl.id }, select: { pendingProposalRunId: true } });
    expect(tl.pendingProposalRunId).toBe(RUN);
  });
});
