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
 *   · (E2a) las tareas nuevas y las que se van en la MISMA transacción, con `createMany` por el
 *     adapter; la foto publicada queda byte a byte igual (el borrador nunca la parchea); una tarea
 *     creada después del borrador no se toca; y un caso del tamaño de Wherex deja su tiempo en consola.
 *   · (E2b) «Regenerar» de UNA fase por el camino entero del servidor (marcar, estructura, fusionar
 *     y aplicar): solo cambian las tareas de esa fase, aunque el modelo traiga otras, y la foto
 *     publicada queda byte a byte igual.
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso).
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  borradorBase,
  claveDeTareaQueSeVa,
  fotoDeTarea,
  leerBorrador,
  planDeAplicacion,
  type Borrador,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type ContenidoDeTareaNueva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { aplicarBorradorEnTx, ErrorAlAplicar, type PedidoDeAplicar } from "./escribir-estructura";
import { estructuraParaElDetalle, fusionarDetalleEnElBorrador, marcarTareasEnCurso } from "./borrador-del-detalle";
import { freezeBaseline } from "./baseline";
import type { ProposalLike } from "./proposal-deltas";

const RUN = "run-propuesta-test";
/** Lo que agrega E2a al pedido, en los casos de solo fases. */
const SIN_TAREAS = { tareas: null, puedeTocarTareas: true, actorEmail: null } as const;
/** El techo de la ruta (POST /timeline/borrador/aplicar). */
const TECHO = { maxWait: 20000, timeout: 60000 };

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
      aplicarBorradorEnTx(tx, { timelineId: m.tl.id, token: RUN, guardado: m.propuesta, foto: m.vivo, sin: [], huella, ahora: new Date(), ...SIN_TAREAS }),
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
        aplicarBorradorEnTx(tx, { timelineId: m.tl.id, token: RUN, guardado: m.propuesta, foto: m.vivo, sin: [], huella: "otra", ahora: new Date(), ...SIN_TAREAS }),
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
      aplicarBorradorEnTx(tx, { timelineId: m.tl.id, token: "otra-corrida", guardado: m.propuesta, foto: m.vivo, sin: [], huella, ahora: new Date(), ...SIN_TAREAS }),
    );
    await expect(intento).rejects.toBeInstanceOf(ErrorAlAplicar);
    const tl = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: m.tl.id }, select: { pendingProposalRunId: true } });
    expect(tl.pendingProposalRunId).toBe(RUN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── E2a: el borrador CON tareas ──────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const contenido = (title: string, weekIndex: number, extra: Partial<ContenidoDeTareaNueva> = {}): ContenidoDeTareaNueva => ({
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  needsValidation: false,
  motivoPorValidar: null,
  fuga: null,
  ...extra,
});

/** Lo vivo como lo ve la pantalla en el cable: fases en su orden, con sus tareas (sin `order`). */
async function vivoDeLaBase(timelineId: string): Promise<Vivo> {
  const tl = await prisma.projectTimeline.findUniqueOrThrow({
    where: { id: timelineId },
    select: {
      anchorStartDate: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          durationWeeks: true,
          startWeek: true,
          sessionCount: true,
          notes: true,
          activityType: true,
          tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }] },
        },
      },
    },
  });
  return {
    ancla: tl.anchorStartDate?.toISOString() ?? null,
    fases: tl.phases.map(({ tasks, ...f }) => ({
      ...f,
      activityType: f.activityType ?? null,
      tareas: tasks.map(
        (t): TareaDelVivo => ({
          id: t.id,
          title: t.title,
          weekIndex: t.weekIndex,
          notes: t.notes,
          party: t.party,
          type: t.type,
          status: t.status,
          source: t.source,
          inicioFijado: t.startDateOverride?.toISOString() ?? null,
          finFijado: t.dueDateOverride?.toISOString() ?? null,
        }),
      ),
    })),
  };
}

/**
 * Un proyecto con tareas y el v1 que dejaría «Regenerar todo»: una fase nueva (Piloto) con su tarea,
 * «Probar flujos» que se va y «Pruebas de carga» nueva. La corrida del paso 2 existe (la traza del
 * detalle es una FK).
 */
async function mundoConTareas() {
  const cliente = await prisma.client.create({ data: { name: "Cliente con tareas (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación con tareas (test)" } });
  const tl = await prisma.projectTimeline.create({
    data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-05T00:00:00.000Z") },
  });
  const crear = (name: string, order: number, durationWeeks: number) =>
    prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
  const a = await crear("Kick-off", 0, 1);
  const b = await crear("Diseño", 1, 2);
  const c = await crear("Pruebas", 2, 3);
  const tarea = (phaseId: string, title: string, weekIndex: number, order: number, extra: Partial<Prisma.TimelineTaskUncheckedCreateInput> = {}) =>
    prisma.timelineTask.create({ data: { phaseId, title, weekIndex, order, source: "AGENT", status: "PENDING", ...extra } });
  const seVa = await tarea(c.id, "Probar flujos", 0, 0);
  const queda = await tarea(c.id, "Pruebas con usuarios", 2, 0);
  const humana = await tarea(c.id, "Validar con el cliente", 1, 0, { source: "HUMAN" });
  const hecha = await tarea(b.id, "Mapear procesos", 1, 0, { status: "DONE" });
  const corrida = await prisma.agentRun.create({ data: { clientId: cliente.id, projectId: proyecto.id, status: "DONE" } });

  const vivo = await vivoDeLaBase(tl.id);
  const propuesta: ProposalLike = {
    anchorStartDate: null,
    phases: [
      ...vivo.fases.map(({ tareas: _t, ...f }) => {
        void _t;
        return f;
      }),
      { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null },
    ],
  };
  const base = borradorBase({ propuesta, vivo, pedido: "regenerar" });
  const piloto = base.cambios.find((x) => x.tipo === "fase-nueva")!.clave;
  const tareaDeSeVa = vivo.fases.find((f) => f.id === c.id)!.tareas!.find((t) => t.id === seVa.id)!;
  const cambioSeVa: CambioTareaSeVa = {
    tipo: "tarea-se-va",
    clave: claveDeTareaQueSeVa(seVa.id),
    tareaId: seVa.id,
    faseId: c.id,
    desde: fotoDeTarea(tareaDeSeVa),
  };
  const nuevas: CambioTareaNueva[] = [
    { tipo: "tarea-nueva", clave: "t:carga", fase: c.id, tarea: contenido("Pruebas de carga", 2) },
    { tipo: "tarea-nueva", clave: "t:piloto", fase: piloto, tarea: contenido("Piloto con cinco usuarios", 0, { needsValidation: true }) },
  ];
  const v1: Borrador = {
    ...base,
    version: 2,
    cambios: [...base.cambios, cambioSeVa, ...nuevas],
    tareas: { corrida: corrida.id, listas: true },
    tareasArmadasPara: { [c.id]: { nombre: "Pruebas", semanas: 3 }, [piloto]: { nombre: "Piloto", semanas: 2 } },
  };
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: {
      pendingProposal: v1 as unknown as Prisma.InputJsonValue,
      pendingProposalRunId: RUN,
      pendingProgress: { tasks: [{ id: seVa.id, done: true }] } as unknown as Prisma.InputJsonValue,
    },
  });
  return { proyecto, tl, a, b, c, seVa, queda, humana, hecha, corrida, v1 };
}

/** El pedido que mandaría la pantalla: la huella contra lo vivo de AHORA (como el cable). */
async function pedidoDeLaPantalla(timelineId: string, v1: Borrador): Promise<PedidoDeAplicar> {
  const vivo = await vivoDeLaBase(timelineId);
  return {
    timelineId,
    token: RUN,
    guardado: v1,
    foto: null,
    sin: [],
    huella: planDeAplicacion(vivo, leerBorrador(v1, vivo)!, [], { tareas: "listas" }).huella,
    ahora: new Date(),
    tareas: "listas",
    puedeTocarTareas: true,
    actorEmail: "cse@smarteam.cr",
  };
}

describe("aplicar el borrador CON tareas — DB real (E2a)", () => {
  it("⭐ las nuevas y las que se van en UNA transacción, con createMany por el adapter", async () => {
    const m = await mundoConTareas();
    const pedido = await pedidoDeLaPantalla(m.tl.id, m.v1);
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    expect(r.tareas).toEqual({ creadas: 2, borradas: 1 });

    expect(await prisma.timelineTask.findUnique({ where: { id: m.seVa.id } }), "no se quitó la que se iba").toBeNull();
    for (const id of [m.queda.id, m.humana.id, m.hecha.id]) {
      expect(await prisma.timelineTask.findUnique({ where: { id } }), "se tocó una que no se iba").not.toBeNull();
    }
    const piloto = await prisma.timelinePhase.findFirstOrThrow({ where: { timelineId: m.tl.id, name: "Piloto" } });
    const nuevas = await prisma.timelineTask.findMany({
      where: { phase: { timelineId: m.tl.id }, title: { in: ["Pruebas de carga", "Piloto con cinco usuarios"] } },
      orderBy: { title: "asc" },
    });
    expect(nuevas.map((t) => [t.phaseId, t.title, t.weekIndex, t.order, t.status, t.source, t.needsValidation])).toEqual([
      [piloto.id, "Piloto con cinco usuarios", 0, 0, "PENDING", "AGENT", true],
      [m.c.id, "Pruebas de carga", 2, 1, "PENDING", "AGENT", false],
    ]);
    const tl = await prisma.projectTimeline.findUniqueOrThrow({
      where: { id: m.tl.id },
      select: { pendingProposal: true, pendingProgress: true, detailGeneratedByAgentRunId: true },
    });
    expect(tl.pendingProposal).toBeNull();
    expect(tl.pendingProgress, "el borrador de avance quedó con ids que ya no están").toBeNull();
    expect(tl.detailGeneratedByAgentRunId).toBe(m.corrida.id);
  });

  it("⛔ en un proyecto PUBLICADO con una tarea movida a mano después, la foto publicada queda byte a byte igual", async () => {
    /* El borrador solo crea y borra: no llama a `patchBaselinePhaseTasks`, que re-sincronizaría con
       lo vivo la semana que el CSE movió a mano (el portafolio perdería ese atraso). La edición que
       la pone en rojo: parchear la foto desde el aplicar del borrador. */
    const m = await mundoConTareas();
    const congelada = await freezeBaseline(m.proyecto.id, null);
    expect(congelada.created).toBe(true);
    const antes = await prisma.timelineBaseline.findFirstOrThrow({ where: { timelineId: m.tl.id, isActive: true } });
    // Después de publicar, el CSE movió a mano «Pruebas con usuarios» de la semana 3 a la 2.
    await prisma.timelineTask.update({ where: { id: m.queda.id }, data: { weekIndex: 1, source: "MODIFIED" } });

    const pedido = await pedidoDeLaPantalla(m.tl.id, m.v1);
    await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);

    const despues = await prisma.timelineBaseline.findFirstOrThrow({ where: { timelineId: m.tl.id, isActive: true } });
    expect(despues.id).toBe(antes.id);
    expect(JSON.stringify(despues.snapshot)).toBe(JSON.stringify(antes.snapshot));
  });

  it("⛔ una tarea creada DESPUÉS del borrador no se toca", async () => {
    const m = await mundoConTareas();
    const tardia = await prisma.timelineTask.create({
      data: { phaseId: m.c.id, title: "Revisar reportes", weekIndex: 0, order: 1, source: "AGENT", status: "PENDING" },
    });
    const pedido = await pedidoDeLaPantalla(m.tl.id, m.v1);
    await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    const sigue = await prisma.timelineTask.findUnique({ where: { id: tardia.id } });
    expect(sigue, "se borró una tarea que el borrador no nombraba").not.toBeNull();
    expect(sigue!.title).toBe("Revisar reportes");
  });

  it("⏱ tamaño Wherex (12 fases, ~250 tareas): se quitan y se crean todas en una transacción, y deja el tiempo", async () => {
    /* Riesgo P2028 (plan §10.1): el techo es de 60 s. Esto no falla por tiempo —la base local no es
       el pooler remoto—; deja la medida en consola y prueba que la cuenta cierra. */
    const cliente = await prisma.client.create({ data: { name: "Cliente grande (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación grande (test)" } });
    const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id } });
    const corrida = await prisma.agentRun.create({ data: { clientId: cliente.id, projectId: proyecto.id, status: "DONE" } });
    const fases = [];
    for (let i = 0; i < 12; i++) {
      fases.push(await prisma.timelinePhase.create({ data: { timelineId: tl.id, name: `Fase ${i + 1}`, order: i, durationWeeks: 3, source: "AGENT" } }));
    }
    await prisma.timelineTask.createMany({
      data: fases.flatMap((f) =>
        Array.from({ length: 21 }, (_, k) => ({
          phaseId: f.id,
          title: `Tarea ${k + 1} de ${f.name}`,
          weekIndex: k % 3,
          order: Math.floor(k / 3),
          source: "AGENT" as const,
          status: "PENDING" as const,
        })),
      ),
    });
    const vivo = await vivoDeLaBase(tl.id);
    const cambios = [
      ...vivo.fases.flatMap((f) =>
        (f.tareas ?? []).map(
          (t): CambioTareaSeVa => ({
            tipo: "tarea-se-va",
            clave: claveDeTareaQueSeVa(t.id),
            tareaId: t.id,
            faseId: f.id,
            desde: fotoDeTarea(t),
          }),
        ),
      ),
      ...vivo.fases.flatMap((f) =>
        Array.from({ length: 21 }, (_, k): CambioTareaNueva => ({
          tipo: "tarea-nueva",
          clave: `t:${f.id}-${k}`,
          fase: f.id,
          tarea: contenido(`Nueva ${k + 1} de ${f.name}`, k % 3),
        })),
      ),
    ];
    const v1: Borrador = {
      formato: "borrador-v1",
      version: 1,
      origen: "contexto",
      observaciones: [],
      cambios,
      pedido: "regenerar",
      tareas: { corrida: corrida.id, listas: true },
      tareasArmadasPara: Object.fromEntries(vivo.fases.map((f) => [f.id, { nombre: f.name, semanas: 3 }])),
    };
    await prisma.projectTimeline.update({
      where: { id: tl.id },
      data: { pendingProposal: v1 as unknown as Prisma.InputJsonValue, pendingProposalRunId: RUN },
    });
    const pedido = await pedidoDeLaPantalla(tl.id, v1);
    const t0 = Date.now();
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    console.log(`[borrador-aplicar.int] Wherex: ${r.tareas.borradas} se van + ${r.tareas.creadas} nuevas en ${Date.now() - t0} ms`);
    expect(r.tareas).toEqual({ creadas: 252, borradas: 252 });
    expect(await prisma.timelineTask.count({ where: { phase: { timelineId: tl.id } } })).toBe(252);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── E2b: «Regenerar» de UNA fase ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("«Regenerar» de una fase — DB real (E2b)", () => {
  it("⭐ el camino entero (marcar, fusionar, aplicar) toca SOLO las tareas de esa fase, y la foto publicada queda byte a byte igual", async () => {
    /* La edición que la pone en rojo: fusionar sin el alcance guardado (`soloFases` null en
       fusionarDetalleEnElBorrador). Se irían las tareas de «Diseño» y entraría la que el modelo
       trajo para esa fase, que nadie pidió regenerar. */
    const cliente = await prisma.client.create({ data: { name: "Cliente de una fase (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación de una fase (test)" } });
    const tl = await prisma.projectTimeline.create({
      data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-05T00:00:00.000Z") },
    });
    const crear = (name: string, order: number, durationWeeks: number) =>
      prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
    await crear("Kick-off", 0, 1);
    const diseno = await crear("Diseño", 1, 2);
    const pruebas = await crear("Pruebas", 2, 3);
    const tarea = (phaseId: string, title: string, weekIndex: number, extra: Partial<Prisma.TimelineTaskUncheckedCreateInput> = {}) =>
      prisma.timelineTask.create({ data: { phaseId, title, weekIndex, order: 0, source: "AGENT", status: "PENDING", ...extra } });
    await tarea(diseno.id, "Mapear procesos", 0);
    await tarea(diseno.id, "Diseñar reportes", 1);
    const seVa = await tarea(pruebas.id, "Probar flujos", 0);
    const humana = await tarea(pruebas.id, "Validar con el cliente", 1, { source: "HUMAN" });
    const corrida = await prisma.agentRun.create({ data: { clientId: cliente.id, projectId: proyecto.id, status: "RUNNING" } });

    const congelada = await freezeBaseline(proyecto.id, null);
    expect(congelada.created).toBe(true);
    const fotoAntes = await prisma.timelineBaseline.findFirstOrThrow({ where: { timelineId: tl.id, isActive: true } });
    const fuera = () =>
      prisma.timelineTask.findMany({
        where: { phase: { timelineId: tl.id }, phaseId: { not: pruebas.id } },
        orderBy: { id: "asc" },
      });
    const fueraAntes = await fuera();

    // 1. La marca: sin propuesta abierta nace el vacío con `soloFase` (el alcance queda en el JSON).
    expect(await marcarTareasEnCurso({ timelineId: tl.id, pedido: { token: null, version: null }, corrida: corrida.id, soloFase: pruebas.id })).toBeNull();
    // 2. Lo que lee el agente, y 3. lo que armó: tareas para Diseño Y para Pruebas.
    const supuesta = await estructuraParaElDetalle(tl.id, corrida.id);
    expect(supuesta).not.toBeNull();
    const detalle = {
      timelineDetail: {
        phases: [
          { id: diseno.id, tasks: [{ title: "Rediseñar todo", weekIndex: 0 }] },
          { id: pruebas.id, tasks: [{ title: "Pruebas de carga", weekIndex: 2 }] },
        ],
      },
    };
    const fusion = await fusionarDetalleEnElBorrador({
      timelineId: tl.id,
      corrida: corrida.id,
      estructura: supuesta!.estructura,
      analysisJson: detalle,
      huellas: null,
      cortado: false,
    });
    expect(fusion.estado).toBe("listas");
    const guardado = (await prisma.projectTimeline.findUniqueOrThrow({ where: { id: tl.id }, select: { pendingProposal: true } }))
      .pendingProposal as { soloFase?: string; cambios: Array<{ fase?: string; faseId?: string }> };
    expect(guardado.soloFase).toBe(pruebas.id);
    expect(guardado.cambios.map((c) => c.fase ?? c.faseId), "la propuesta trae cambios de otra fase").toEqual(
      guardado.cambios.map(() => pruebas.id),
    );

    // 4. Aplicar, como la pantalla: la huella contra lo vivo de ahora y el token = la corrida.
    const vivo = await vivoDeLaBase(tl.id);
    const pedido: PedidoDeAplicar = {
      timelineId: tl.id,
      token: corrida.id,
      guardado,
      foto: null,
      sin: [],
      huella: planDeAplicacion(vivo, leerBorrador(guardado, vivo)!, [], { tareas: "listas" }).huella,
      ahora: new Date(),
      tareas: "listas",
      puedeTocarTareas: true,
      actorEmail: "cse@smarteam.cr",
    };
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    expect(r.tareas).toEqual({ creadas: 1, borradas: 1 });

    expect(await fuera(), "se tocó una tarea de otra fase").toEqual(fueraAntes);
    const dePruebas = await prisma.timelineTask.findMany({ where: { phaseId: pruebas.id }, orderBy: { title: "asc" } });
    expect(dePruebas.map((t) => [t.title, t.source])).toEqual([
      ["Pruebas de carga", "AGENT"],
      ["Validar con el cliente", "HUMAN"],
    ]);
    expect(dePruebas.find((t) => t.title === "Validar con el cliente")!.id).toBe(humana.id);
    expect(await prisma.timelineTask.findUnique({ where: { id: seVa.id } })).toBeNull();
    const tlDespues = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: tl.id }, select: { pendingProposal: true } });
    expect(tlDespues.pendingProposal).toBeNull();
    const fotoDespues = await prisma.timelineBaseline.findFirstOrThrow({ where: { timelineId: tl.id, isActive: true } });
    expect(fotoDespues.id).toBe(fotoAntes.id);
    expect(JSON.stringify(fotoDespues.snapshot)).toBe(JSON.stringify(fotoAntes.snapshot));
  });
});
