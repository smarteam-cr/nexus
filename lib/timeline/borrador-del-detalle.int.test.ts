/**
 * lib/timeline/borrador-del-detalle.int.test.ts — L5 contra una base REAL: la fusión del paso 2 de «Regenerar
 * todo» deja quieto lo terminado y no reescribe por reescribir.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/timeline/borrador-del-detalle.int.test.ts --project integration
 *
 * Se siembra la propuesta grande anonimizada (__fixtures__/propuesta-grande.json: 12 fases, 112 tareas, una
 * fase terminada) con el borrador del paso 1 esperando las tareas de ESTA corrida, y se corre el camino del
 * servidor: lo que lee el agente (`estructuraParaElDetalle`) y la fusión de lo que devolvió
 * (`fusionarDetalleEnElBorrador`, con la salida real del paso 2). Lo guardado se lee como lo lee la pantalla
 * (`resumir`). Los unitarios (tareas-del-detalle.test.ts) prueban las reglas en memoria; esto prueba que el
 * servidor las usa con lo que lee de la base (el estado de la fase, la corrida, lo guardado).
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso).
 */
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { FASE_TERMINADA, leerFixtureGrande } from "./__fixtures__/propuesta-grande";
import { esCambioDeTarea, faseDeLaTarea, leerBorrador, resumir } from "./borrador";
import {
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  SELECT_DE_FASES_CON_TAREAS,
  vivoDeLaBase,
} from "./borrador-del-detalle";

type DatosDeFase = Prisma.TimelinePhaseUncheckedCreateInput;
type DatosDeTarea = Prisma.TimelineTaskCreateManyInput;

describe("la fusión del paso 2 — DB real (L5)", () => {
  it("⭐ una fusión real escribe 110 cambios de tareas visibles y ninguno en la fase terminada", async () => {
    /* Las ediciones que la ponen en rojo: pasar `respetarTerminadas: false` en la fusión de «Regenerar todo»
       (la fase terminada recibe 8 tareas nuevas), o no emparejar las que vuelven (salen 130, no 110). */
    const fx = leerFixtureGrande();
    const cliente = await prisma.client.create({ data: { name: "Cliente de la propuesta grande (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación grande (test)" } });
    const tl = await prisma.projectTimeline.create({
      data: { projectId: proyecto.id, anchorStartDate: new Date(`${fx.ancla}T00:00:00.000Z`) },
    });
    for (const f of fx.vivo.fases) {
      await prisma.timelinePhase.create({
        data: {
          id: f.id,
          timelineId: tl.id,
          name: f.name,
          order: f.order,
          durationWeeks: f.durationWeeks,
          startWeek: f.startWeek,
          sessionCount: f.sessionCount,
          notes: f.notes,
          activityType: f.activityType as DatosDeFase["activityType"],
          status: f.status as DatosDeFase["status"],
          statusSource: f.statusSource as DatosDeFase["statusSource"],
          source: f.source as DatosDeFase["source"],
        },
      });
    }
    await prisma.timelineTask.createMany({
      data: fx.vivo.fases.flatMap((f) =>
        f.tareas.map(
          (t): DatosDeTarea => ({
            id: t.id,
            phaseId: f.id,
            title: t.title,
            weekIndex: t.weekIndex,
            order: t.order,
            notes: t.notes,
            party: t.party,
            type: t.type,
            status: t.status as DatosDeTarea["status"],
            statusSource: t.statusSource as DatosDeTarea["statusSource"],
            source: t.source as DatosDeTarea["source"],
            needsValidation: t.needsValidation,
          }),
        ),
      ),
    });
    const corrida = await prisma.agentRun.create({ data: { clientId: cliente.id, projectId: proyecto.id, status: "RUNNING" } });
    // El borrador del paso 1 (las fases), esperando las tareas de ESTA corrida.
    const crudo = fx.borrador as { cambios: Array<{ tipo: string }> } & Record<string, unknown>;
    const delPaso1 = {
      ...crudo,
      cambios: crudo.cambios.filter((c) => !c.tipo.startsWith("tarea")),
      tareas: { corrida: corrida.id, listas: false },
      tareasArmadasPara: {},
    };
    await prisma.projectTimeline.update({
      where: { id: tl.id },
      data: { pendingProposal: delPaso1 as unknown as Prisma.InputJsonValue, pendingProposalRunId: "run-paso1" },
    });

    // Lo que lee el agente: la fase terminada, nombrada para no tocarse.
    const supuesta = await estructuraParaElDetalle(tl.id, corrida.id);
    expect(supuesta?.loQueYaHay?.terminadasQueNoSeTocan).toEqual([FASE_TERMINADA]);
    expect(supuesta?.loQueYaHay?.conAlcance).toBe(false);

    let k = 0;
    const fusion = await fusionarDetalleEnElBorrador({
      timelineId: tl.id,
      corrida: corrida.id,
      estructura: supuesta!.estructura,
      analysisJson: fx.paso2,
      huellas: null,
      cortado: false,
      nuevaClave: () => `int-${++k}`,
    });
    expect(fusion.estado).toBe("listas");

    const leido = await prisma.projectTimeline.findUniqueOrThrow({
      where: { id: tl.id },
      select: { pendingProposal: true, anchorStartDate: true, phases: SELECT_DE_FASES_CON_TAREAS },
    });
    const borrador = leerBorrador(leido.pendingProposal)!;
    const vivo = vivoDeLaBase(leido.anchorStartDate, leido.phases);
    const r = resumir(vivo, borrador, [], { tareas: "listas" });
    const signos: Record<string, number> = {};
    for (const g of r.grupos) for (const t of g.tareas) if (t.estado !== "ya-esta") signos[t.signo] = (signos[t.signo] ?? 0) + 1;
    expect(signos).toEqual({ "−": 49, "+": 57, "~": 4 });
    expect(
      borrador.cambios.filter(esCambioDeTarea).filter((c) => faseDeLaTarea(c) === FASE_TERMINADA),
      "la fase terminada recibe o pierde tareas",
    ).toEqual([]);
    expect(borrador.observaciones).toContain("«Fase B» está terminada: la IA no le propone tareas.");
    expect(borrador.observaciones).toContain("8 tareas vuelven con otra nota: se conserva la nota de hoy.");
  });
});
