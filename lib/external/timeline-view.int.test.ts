/**
 * lib/external/timeline-view.int.test.ts — lo que cruza al cliente del cronograma, contra una base REAL (D0).
 *
 * `tarea-del-cronograma.test.ts` prueba la regla; esto prueba que `readClientTimeline` la aplica sobre filas de verdad: de
 * una tarea confirmada, una «por validar» y una suspendida, al cliente solo le llega la confirmada. Reemplaza a la guarda
 * que buscaba el texto del filtro en el archivo, que seguía en verde aunque la línea quedara comentada (/revisar,
 * 2026-10-24). Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { readClientTimeline } from "./timeline-view";

describe("readClientTimeline — solo cruzan las tareas confirmadas (D0)", () => {
  it("con el detalle confirmado, al cliente le llega la tarea confirmada y no la «por validar» ni la suspendida", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente Cronograma (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Proyecto Cronograma (test)" } });
    const tl = await prisma.projectTimeline.create({
      data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-26"), detailConfirmedAt: new Date() },
    });
    const fase = await prisma.timelinePhase.create({ data: { timelineId: tl.id, name: "Configuración", order: 0, durationWeeks: 2 } });
    await prisma.timelineTask.createMany({
      data: [
        { phaseId: fase.id, title: "Confirmada", weekIndex: 0, order: 0 },
        { phaseId: fase.id, title: "Inventada por el agente", weekIndex: 0, order: 1, needsValidation: true },
        { phaseId: fase.id, title: "Descartada", weekIndex: 1, order: 2, status: "SUSPENDED" },
      ],
    });

    const vista = await readClientTimeline(proyecto.id);

    const titulos = vista.phases.flatMap((f) => (f.tasks ?? []).map((t) => t.title));
    expect(titulos).toEqual(["Confirmada"]);
  });

  it("sin el detalle confirmado, no cruza ninguna tarea", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente Sin Detalle (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Proyecto Sin Detalle (test)" } });
    const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-26") } });
    const fase = await prisma.timelinePhase.create({ data: { timelineId: tl.id, name: "Configuración", order: 0, durationWeeks: 2 } });
    await prisma.timelineTask.create({ data: { phaseId: fase.id, title: "Confirmada", weekIndex: 0, order: 0 } });

    const vista = await readClientTimeline(proyecto.id);

    expect(vista.phases.flatMap((f) => f.tasks ?? [])).toEqual([]);
  });
});
