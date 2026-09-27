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
 *
 * L6: la misma fusión con el porqué (`extras.explicar`, un doble: ningún test llama a la API). Lo que solo una base
 * prueba: la explicación sale de la MISMA escritura, sigue sin ser «vieja» después de pasar por jsonb (que reordena
 * las claves), la conservan las casillas y la apertura del chat (la ruta de operaciones), y una fusión perdida deja en
 * la corrida lo que leyó.
 */
import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const guards = vi.hoisted(() => ({ guardTimelineEdit: vi.fn(), guardIaDelCronograma: vi.fn() }));
vi.mock("@/lib/auth/api-guards", () => guards);

import { prisma } from "@/lib/db/prisma";
import { POST as operaciones } from "@/app/api/projects/[projectId]/timeline/borrador/operaciones/route";
import { FASE_QUE_SE_ALARGA, FASE_TERMINADA, leerFixtureGrande } from "./__fixtures__/propuesta-grande";
import { esCambioDeTarea, faseDeLaTarea, leerBorrador, resumir } from "./borrador";
import {
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  SELECT_DE_FASES_CON_TAREAS,
  vivoDeLaBase,
} from "./borrador-del-detalle";
import { explicacionEnPantalla, type ExplicacionSinSello } from "./explicacion-de-la-propuesta";
import { POLITICA_DE_ATRASOS } from "./politica-de-atrasos";
import { semanaVencida } from "./vista-de-la-propuesta";
import { computePhaseRanges } from "./weeks";

type DatosDeFase = Prisma.TimelinePhaseUncheckedCreateInput;
type DatosDeTarea = Prisma.TimelineTaskCreateManyInput;

/** La propuesta grande sembrada, con el borrador del paso 1 esperando las tareas de UNA corrida. M3: `extra` se suma al
 *  borrador guardado (el reloj de la marca, `hoy`). */
async function sembrar(extra: Record<string, unknown> = {}) {
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
    ...extra,
  };
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingProposal: delPaso1 as unknown as Prisma.InputJsonValue, pendingProposalRunId: "run-paso1" },
  });
  return { fx, cliente, proyecto, tl, corrida };
}

describe("la fusión del paso 2 — DB real (L5)", () => {
  it("⭐ una fusión real escribe 110 cambios de tareas visibles y ninguno en la fase terminada", async () => {
    /* Las ediciones que la ponen en rojo: pasar `respetarTerminadas: false` en la fusión de «Regenerar todo»
       (la fase terminada recibe 8 tareas nuevas), o no emparejar las que vuelven (salen 130, no 110). */
    const { fx, tl, corrida } = await sembrar();

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

describe("L6 · el porqué en la fusión — DB real", () => {
  const RUN_PASO1 = "run-paso1";
  const EXPLICACION: ExplicacionSinSello = {
    general: { frase: "Tus instrucciones nuevas alargan la integración y suman un piloto.", fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] },
    fases: [
      {
        fase: FASE_QUE_SE_ALARGA,
        frase: "Se alarga porque tus instrucciones nuevas piden probar la integración antes de abrirla.",
        fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }],
      },
    ],
    sinMaterial: ["f02"],
    desde: "2026-09-25T15:00:00.000Z",
  };
  const leido = async (timelineId: string) =>
    (await prisma.projectTimeline.findUniqueOrThrow({ where: { id: timelineId }, select: { pendingProposal: true } })).pendingProposal as Record<
      string,
      unknown
    >;
  const pedir = (projectId: string, body: Record<string, unknown>) =>
    operaciones({ json: async () => ({ token: RUN_PASO1, ...body }) } as unknown as NextRequest, { params: Promise.resolve({ projectId }) });

  it("⭐ la explicación sale de la misma escritura, no es vieja al leerla de la base, y las casillas y la apertura la conservan", async () => {
    /* Las ediciones que la ponen en rojo: escribirla en otra escritura, una huella que depende del orden de las claves
       (jsonb las reordena: toda explicación saldría «de cuando se generó»), o que la ruta de operaciones reescriba la
       propuesta desde `leerBorrador` (perdería todo lo que no es del borrador, `explicacion` incluida). */
    guards.guardTimelineEdit.mockResolvedValue({ user: { email: "cse@smarteam.cr" } });
    const { fx, proyecto, tl, corrida } = await sembrar();
    const supuesta = await estructuraParaElDetalle(tl.id, corrida.id);
    let k = 0;
    let llamadas = 0;
    const fusion = await fusionarDetalleEnElBorrador({
      timelineId: tl.id,
      corrida: corrida.id,
      estructura: supuesta!.estructura,
      analysisJson: fx.paso2,
      huellas: null,
      cortado: false,
      nuevaClave: () => `int-${++k}`,
      extras: {
        explicar: async () => {
          llamadas++;
          return EXPLICACION;
        },
      },
    });
    expect(fusion.estado).toBe("listas");
    expect(llamadas).toBe(1);
    const g = await leido(tl.id);
    const enPantalla = explicacionEnPantalla(g);
    expect(enPantalla?.explicacion).toMatchObject({ ...EXPLICACION, corrida: corrida.id, version: g.version });
    expect(enPantalla?.vieja, "recién fusionada, leída de la base, ya se ve «de cuando se generó»").toBe(false);

    // Otra computadora desmarca una casilla (la versión sube) y el chat se abre (no sube): la explicación sigue igual.
    const tareaNueva = (leerBorrador(g)!.cambios.find((c) => c.tipo === "tarea-nueva") as { clave: string }).clave;
    const casilla = await pedir(proyecto.id, { version: g.version, origen: "casillas", operaciones: [{ op: "excluir", claves: [tareaNueva] }] });
    expect(casilla.status).toBe(200);
    const trasCasilla = await leido(tl.id);
    const apertura = await pedir(proyecto.id, { version: trasCasilla.version, origen: "apertura", operaciones: [{ op: "chat-abierto" }] });
    expect(apertura.status).toBe(200);
    const final = await leido(tl.id);
    expect(final.excluidos).toEqual([tareaNueva]);
    expect(final.chatAbiertoPara).toBeTruthy();
    expect(final.explicacion, "las casillas o la apertura perdieron la explicación").toEqual(g.explicacion);
    expect(explicacionEnPantalla(final)?.vieja, "desmarcar una casilla no cambia los cambios: no es vieja").toBe(false);
  });

  it("⭐ una fusión PERDIDA deja en la corrida lo que leyó (`fuentesDeLaGeneracion`)", async () => {
    /* La edición que la pone en rojo: que la ruta le pase a la fusión la salida sin lo leído (`avisarEnLaCorrida` pisa
       el `output` con lo que recibe). */
    const { fx, tl, corrida } = await sembrar();
    const supuesta = await estructuraParaElDetalle(tl.id, corrida.id);
    // Mientras la IA armaba, la propuesta se descartó.
    await prisma.projectTimeline.update({ where: { id: tl.id }, data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null } });
    const leidas = { instrucciones: fx.instrucciones.ahora, sesiones: [], en: "2026-09-26T18:00:00.000Z" };
    let llamadas = 0;
    const fusion = await fusionarDetalleEnElBorrador({
      timelineId: tl.id,
      corrida: corrida.id,
      estructura: supuesta!.estructura,
      analysisJson: { ...fx.paso2, fuentesDeLaGeneracion: leidas },
      huellas: null,
      cortado: false,
      extras: {
        explicar: async () => {
          llamadas++;
          return EXPLICACION;
        },
      },
    });
    expect(fusion.estado).toBe("perdido");
    expect(llamadas, "se pagó una explicación para una propuesta que ya no está").toBe(0);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: corrida.id }, select: { output: true } });
    const output = JSON.parse(run.output!);
    expect(output.fuentesDeLaGeneracion).toEqual(leidas);
    expect(output.timelineSyncError).toBeTruthy();
  });
});

describe("M3 · lo que ya pasó no se reescribe — DB real", () => {
  it("⭐ una fusión real con el reloj de la marca no escribe nada en semanas vencidas (salvo un kickoff que sobra) y lo conserva", async () => {
    /* Decisión (a) de Elías (2026-09-27). La edición que la pone en rojo: saltar R13 en la fusión real (no pasarle
       `pasado` a `cambiosDeTareasDelDetalle`): salían 44 que se van y 44 nuevas en semanas que ya pasaron. */
    const fx = leerFixtureGrande();
    const hoy = new Date(fx.hoy);
    const reloj = { instante: hoy.toISOString(), semana: 18, politica: POLITICA_DE_ATRASOS };
    const { tl, corrida } = await sembrar({ hoy: reloj });

    // Lo que lee el agente: la semana de hoy y desde dónde se puede proponer.
    const supuesta = await estructuraParaElDetalle(tl.id, corrida.id);
    expect(supuesta?.loQueYaHay?.pasado?.semanaDeHoy).toBe(18);

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
    expect(borrador.hoy, "la fusión perdió el reloj").toEqual(reloj);
    const vivo = vivoDeLaBase(leido.anchorStartDate, leido.phases);
    const estructura = supuesta!.estructura;
    const rangos = computePhaseRanges(estructura.fases);
    const inicio = new Map(estructura.fases.map((f, i) => [f.id, rangos[i].start]));
    const semanaViva = new Map(vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, t.weekIndex] as const)));
    const vencida = (fase: string, semana: number) => semanaVencida(vivo.ancla, inicio.get(fase) ?? 0, semana, hoy);
    const enElPasado = borrador.cambios.filter(esCambioDeTarea).filter((c) => {
      if (c.tipo === "tarea-nueva") return vencida(c.fase, c.tarea.weekIndex);
      if (c.tipo === "tarea-se-va") return c.delSistema !== "hito" && vencida(c.faseId, semanaViva.get(c.tareaId) ?? c.desde.weekIndex);
      if (c.tipo === "tarea-cambia") return vencida(faseDeLaTarea(c), c.a.weekIndex ?? c.desde.weekIndex) || vencida(c.faseId, semanaViva.get(c.tareaId) ?? c.desde.weekIndex);
      return false;
    });
    expect(enElPasado, "la fusión real escribió cambios en semanas que ya pasaron").toEqual([]);
    const cuantos = (tipo: string) => borrador.cambios.filter((c) => c.tipo === tipo).length;
    expect([cuantos("tarea-se-va"), cuantos("tarea-nueva"), cuantos("tarea-cambia")]).toEqual([5, 13, 2]);
    expect(borrador.observaciones).toContain("No entran 51 tareas de la IA: caen en semanas que ya pasaron.");
  });
});
