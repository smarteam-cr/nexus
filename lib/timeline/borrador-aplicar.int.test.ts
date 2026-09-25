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
 *     publicada queda byte a byte igual. Y (revisión de E2b) su pedido no entra con un paso 1 del
 *     proyecto corriendo: la consulta real.
 *   · (E2c) el RECÁLCULO de una fase desfasada por el camino entero (marcar, estructura, fusionar y
 *     aplicar), y «Aplicar de todos modos»: sus tareas tal cual, las que caían después en la última
 *     semana; sin forzar, una pestaña de antes no escribe nada (tampoco la limpieza del token).
 *   · (E3) lo que dicta el chat: una tarea HECHA que se muda conserva su id y su estado; la fase que
 *     se va con una protegida se queda, y vacía se borra de verdad (con `tasks: { none: {} }` contra el
 *     Cascade real); AGENT pasa a MODIFIED; y «quitar una semana» en el tamaño de Wherex deja su tiempo.
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso).
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  borradorBase,
  claveDeCampo,
  claveDeFaseQueSeVa,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  fotoDeTarea,
  leerBorrador,
  mensajeDeRecalculoAlAplicar,
  planDeAplicacion,
  type Borrador,
  type CambioFaseSeVa,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type ContenidoDeTareaNueva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { aplicarBorradorEnTx, ErrorAlAplicar, type PedidoDeAplicar } from "./escribir-estructura";
import {
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  marcarTareasEnCurso,
  prevalidarPedidoDeTareas,
} from "./borrador-del-detalle";
import { ID_ESTRUCTURA_CRONOGRAMA } from "@/lib/agents/estructura-cronograma";
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
          // E3: el estado de la fase, como la pantalla y como aplicar (paridad de la huella).
          status: true,
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
    expect(r.tareas).toEqual({ creadas: 2, borradas: 1, cambiadas: 0, mudadas: 0 }); // E3 P1: más dos cuentas, en cero

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
    expect(r.tareas).toEqual({ creadas: 252, borradas: 252, cambiadas: 0, mudadas: 0 }); // E3 P1: más dos cuentas, en cero
    expect(await prisma.timelineTask.count({ where: { phase: { timelineId: tl.id } } })).toBe(252);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── E2b: «Regenerar» de UNA fase ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("«Regenerar» de una fase — DB real (E2b)", () => {
  it("⛔ con un paso 1 del proyecto corriendo, el pedido sin propuesta no entra (la consulta real)", async () => {
    /* Revisión de E2b: el vacío de «Regenerar» de una fase entraba mientras el paso 1 corría en otra
       pestaña, y el paso 1, ya pagado, no podía guardar. La misma consulta que la toma del paso 1, contra
       la base: uno de otro proyecto, uno terminado o uno fuera de la ventana no frenan. */
    const cliente = await prisma.client.create({ data: { name: "Cliente del paso 1 en curso (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación (test)" } });
    const otro = await prisma.project.create({ data: { clientId: cliente.id, name: "Otro proyecto (test)" } });
    const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id } });
    const pasoUno = (projectId: string, status: "RUNNING" | "DONE", haceMinutos = 0) =>
      prisma.agentRun.create({
        data: {
          clientId: cliente.id,
          projectId,
          agentSlug: ID_ESTRUCTURA_CRONOGRAMA,
          status,
          createdAt: new Date(Date.now() - haceMinutos * 60_000),
        },
      });
    const pedido = { token: null, version: null } as const;
    await pasoUno(otro.id, "RUNNING");
    await pasoUno(proyecto.id, "DONE");
    await pasoUno(proyecto.id, "RUNNING", 4);
    expect(await prevalidarPedidoDeTareas(tl.id, pedido), "frena por algo que no es un paso 1 en curso").toBeNull();
    await pasoUno(proyecto.id, "RUNNING");
    expect(await prevalidarPedidoDeTareas(tl.id, pedido)).toMatchObject({ error: "ESTRUCTURA_EN_CURSO" });
  });

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
    expect(r.tareas).toEqual({ creadas: 1, borradas: 1, cambiadas: 0, mudadas: 0 }); // E3 P1: más dos cuentas, en cero

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

// ─────────────────────────────────────────────────────────────────────────────
// ── E2c: la fase desfasada, recalculada o forzada ────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un proyecto cuya propuesta alarga «Pruebas» de 3 a 6 semanas, con sus tareas armadas para 6: se va
 * «Probar flujos» y entra «Pruebas de aceptación» en la semana 6. El CSE desmarca el cambio de
 * semanas: «Pruebas» sigue en 3 y sus tareas quedaron DESFASADAS.
 */
async function mundoDesfasado() {
  const cliente = await prisma.client.create({ data: { name: "Cliente desfasado (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación desfasada (test)" } });
  const tl = await prisma.projectTimeline.create({
    data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-05T00:00:00.000Z") },
  });
  const crear = (name: string, order: number, durationWeeks: number) =>
    prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
  await crear("Kick-off", 0, 1);
  await crear("Diseño", 1, 2);
  const c = await crear("Pruebas", 2, 3);
  const seVa = await prisma.timelineTask.create({
    data: { phaseId: c.id, title: "Probar flujos", weekIndex: 0, order: 0, source: "AGENT", status: "PENDING" },
  });
  const corrida = await prisma.agentRun.create({ data: { clientId: cliente.id, projectId: proyecto.id, status: "DONE" } });
  const vivo = await vivoDeLaBase(tl.id);
  const tareaDeSeVa = vivo.fases.find((f) => f.id === c.id)!.tareas!.find((t) => t.id === seVa.id)!;
  const claveDur = claveDeCampo(c.id, "durationWeeks");
  const v1: Borrador = {
    formato: "borrador-v1",
    version: 3,
    origen: "contexto",
    observaciones: [],
    cambios: [
      { tipo: "fase-cambia", clave: claveDur, faseId: c.id, fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 6 },
      { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(seVa.id), tareaId: seVa.id, faseId: c.id, desde: fotoDeTarea(tareaDeSeVa) },
      { tipo: "tarea-nueva", clave: "t:aceptacion", fase: c.id, tarea: contenido("Pruebas de aceptación", 5) },
    ],
    pedido: "regenerar",
    tareas: { corrida: corrida.id, listas: true },
    tareasArmadasPara: { [c.id]: { nombre: "Pruebas", semanas: 6, sesiones: null, semanaCero: false } },
  };
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingProposal: v1 as unknown as Prisma.InputJsonValue, pendingProposalRunId: RUN },
  });
  return { cliente, proyecto, tl, c, seVa, sin: [claveDur] };
}

/** El pedido de la pantalla con lo desmarcado (y lo forzado): la huella contra lo vivo y lo guardado de AHORA. */
async function pedidoConLoMarcado(timelineId: string, sin: string[], forzar: string[] = []): Promise<PedidoDeAplicar> {
  const vivo = await vivoDeLaBase(timelineId);
  const { pendingProposal } = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: timelineId }, select: { pendingProposal: true } });
  return {
    timelineId,
    token: RUN,
    guardado: pendingProposal,
    foto: null,
    sin,
    huella: planDeAplicacion(vivo, leerBorrador(pendingProposal, vivo)!, sin, { tareas: "listas", forzar }).huella,
    ahora: new Date(),
    tareas: "listas",
    puedeTocarTareas: true,
    actorEmail: "cse@smarteam.cr",
    forzar,
  };
}

describe("la fase desfasada — DB real (E2c)", () => {
  it("⭐ recalculada por el camino entero (marcar, estructura, fusionar) y aplicada: sus tareas son las de la forma que queda", async () => {
    /* La edición que la pone en rojo: que el agente vea la estructura sin lo desmarcado (armaría otra
       vez para 6 semanas), o que la fusión del recálculo no reemplace las tareas de la fase (el aplicar
       seguiría bloqueado, o escribiría las armadas para 6). */
    const m = await mundoDesfasado();
    const corrida = await prisma.agentRun.create({ data: { clientId: m.cliente.id, projectId: m.proyecto.id, status: "RUNNING" } });
    // Con la fase desfasada, aplicar espera.
    const antes = await pedidoConLoMarcado(m.tl.id, m.sin);
    const vivo = await vivoDeLaBase(m.tl.id);
    expect(planDeAplicacion(vivo, leerBorrador(antes.guardado, vivo)!, m.sin, { tareas: "listas" }).bloqueoPorDesfasadas).toBe(true);

    // 1. La marca: el recálculo va en `recalculo`, nunca en `tareas`.
    expect(
      await marcarTareasEnCurso({ timelineId: m.tl.id, pedido: { token: RUN, version: 3, recalcular: { sin: m.sin } }, corrida: corrida.id }),
    ).toBeNull();
    // 2. Lo que lee el agente: «Pruebas» con sus 3 semanas, y solo esa fase.
    const supuesta = await estructuraParaElDetalle(m.tl.id, corrida.id);
    expect(supuesta).not.toBeNull();
    expect(supuesta!.estructura.fases.find((f) => f.id === m.c.id)!.durationWeeks, "el agente vio la forma armada, no la que queda").toBe(3);
    expect(supuesta!.soloFases).toEqual([m.c.id]);
    // 3. Lo que armó, fusionado: reemplaza las tareas de «Pruebas».
    const fusion = await fusionarDetalleEnElBorrador({
      timelineId: m.tl.id,
      corrida: corrida.id,
      estructura: supuesta!.estructura,
      analysisJson: { timelineDetail: { phases: [{ id: m.c.id, tasks: [{ title: "Pruebas cortas", weekIndex: 2 }] }] } },
      huellas: null,
      cortado: false,
    });
    expect(fusion).toEqual({ estado: "recalculadas", escritas: [m.c.id], fallidas: [] });
    await prisma.agentRun.update({ where: { id: corrida.id }, data: { status: "DONE" } });

    // 4. Aplicar con lo mismo desmarcado: ya no hay bloqueo y entran las recalculadas.
    const pedido = await pedidoConLoMarcado(m.tl.id, m.sin);
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    expect(r.tareas).toEqual({ creadas: 1, borradas: 1, cambiadas: 0, mudadas: 0 }); // E3 P1: más dos cuentas, en cero
    expect(r.plan.forzadas).toEqual([]);
    const pruebas = await prisma.timelinePhase.findUniqueOrThrow({ where: { id: m.c.id }, include: { tasks: true } });
    expect(pruebas.durationWeeks, "se aplicó el cambio de semanas desmarcado").toBe(3);
    expect(pruebas.tasks.map((t) => [t.title, t.weekIndex])).toEqual([["Pruebas cortas", 2]]);
    const tl = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: m.tl.id }, select: { pendingProposal: true } });
    expect(tl.pendingProposal).toBeNull();
  });

  it("⭐ «Aplicar de todos modos»: sus tareas tal cual, las que caían después en la ÚLTIMA semana; sin forzar, nada se escribe", async () => {
    /* Las ediciones que la ponen en rojo: aplicar tareas desfasadas sin forzar (una pestaña de antes),
       dejar escrita la limpieza del token con el rechazo, o no acotar la semana de las forzadas. */
    const m = await mundoDesfasado();
    // Una pestaña de antes (sin `forzar`): NO_SE_PUEDE con «recarga la página», y el throw deshace el token.
    const viejo = await pedidoConLoMarcado(m.tl.id, m.sin);
    const error = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, viejo), TECHO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorAlAplicar);
    expect(error).toMatchObject({ codigo: "NO_SE_PUEDE", message: mensajeDeRecalculoAlAplicar(["Pruebas"]) });
    const sigue = await prisma.projectTimeline.findUniqueOrThrow({
      where: { id: m.tl.id },
      select: { pendingProposal: true, pendingProposalRunId: true },
    });
    expect(sigue.pendingProposalRunId, "se escribió la limpieza del token").toBe(RUN);
    expect(sigue.pendingProposal).not.toBeNull();
    expect(await prisma.timelineTask.findUnique({ where: { id: m.seVa.id } }), "se aplicó una tarea desfasada").not.toBeNull();

    // Forzada: sus tareas tal cual; la de la semana 6 cae en la 3, la última de las que quedan.
    const pedido = await pedidoConLoMarcado(m.tl.id, m.sin, [m.c.id]);
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    expect(r.tareas).toEqual({ creadas: 1, borradas: 1, cambiadas: 0, mudadas: 0 }); // E3 P1: más dos cuentas, en cero
    expect(r.plan.forzadas.map((f) => f.fase)).toEqual([m.c.id]);
    const pruebas = await prisma.timelinePhase.findUniqueOrThrow({ where: { id: m.c.id }, include: { tasks: true } });
    expect(pruebas.durationWeeks).toBe(3);
    expect(pruebas.tasks.map((t) => [t.title, t.weekIndex])).toEqual([["Pruebas de aceptación", 2]]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── E3: lo que dicta el chat ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Un proyecto con tres fases: «Diseño» con una tarea HECHA y una de la IA, «Pruebas» y «Cierre». */
async function mundoDelChat() {
  const cliente = await prisma.client.create({ data: { name: "Cliente del chat (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación del chat (test)" } });
  const tl = await prisma.projectTimeline.create({
    data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-05T00:00:00.000Z") },
  });
  const crear = (name: string, order: number, durationWeeks: number) =>
    prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
  const diseno = await crear("Diseño", 0, 2);
  const pruebas = await crear("Pruebas", 1, 3);
  const cierre = await crear("Cierre", 2, 1);
  const tarea = (phaseId: string, title: string, weekIndex: number, order: number, extra: Partial<Prisma.TimelineTaskUncheckedCreateInput> = {}) =>
    prisma.timelineTask.create({ data: { phaseId, title, weekIndex, order, source: "AGENT", status: "PENDING", ...extra } });
  const hecha = await tarea(diseno.id, "Mapear procesos", 1, 0, { status: "DONE", actualStart: new Date("2026-10-06T00:00:00.000Z") });
  const deLaIa = await tarea(diseno.id, "Definir pipeline", 0, 0);
  const enPruebas = await tarea(pruebas.id, "Probar flujos", 2, 0);
  return { cliente, proyecto, tl, diseno, pruebas, cierre, hecha, deLaIa, enPruebas };
}

/** Guarda el v1 del chat y arma el pedido de la pantalla (la huella contra lo vivo de AHORA). */
async function pedidoDelChat(timelineId: string, cambios: (vivo: Vivo) => Borrador["cambios"]): Promise<PedidoDeAplicar> {
  const vivo = await vivoDeLaBase(timelineId);
  const v1: Borrador = {
    formato: "borrador-v1",
    version: 1,
    origen: "contexto",
    observaciones: [],
    cambios: cambios(vivo),
    pedido: "regenerar",
    tareas: { corrida: null, listas: true },
    tareasArmadasPara: {},
  };
  await prisma.projectTimeline.update({
    where: { id: timelineId },
    data: { pendingProposal: v1 as unknown as Prisma.InputJsonValue, pendingProposalRunId: RUN },
  });
  return {
    timelineId,
    token: RUN,
    guardado: v1,
    foto: null,
    sin: [],
    huella: planDeAplicacion(vivo, leerBorrador(v1, vivo)!, [], { tareas: "listas" }).huella,
    ahora: new Date(),
    tareas: "listas",
    puedeTocarTareas: false, // lo del chat pide la vara de editar, no la de la IA
    actorEmail: "cse@smarteam.cr",
  };
}
const tareaViva = (vivo: Vivo, id: string): TareaDelVivo => vivo.fases.flatMap((f) => f.tareas ?? []).find((t) => t.id === id)!;
const faseQueSeVa = (vivo: Vivo, id: string): CambioFaseSeVa => {
  const f = vivo.fases.find((x) => x.id === id)!;
  return {
    tipo: "fase-se-va",
    clave: claveDeFaseQueSeVa(id),
    faseId: id,
    desde: {
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
      status: f.status!,
      tareas: (f.tareas ?? []).map((t) => ({ id: t.id, foto: fotoDeTarea(t) })),
    },
    porChat: true,
  };
};
const cambiaLa = (vivo: Vivo, id: string, faseId: string, a: CambioTareaCambia["a"], extra: Partial<CambioTareaCambia> = {}): CambioTareaCambia => ({
  tipo: "tarea-cambia",
  clave: claveDeTareaQueCambia(id),
  tareaId: id,
  faseId,
  desde: fotoDeTarea(tareaViva(vivo, id)),
  a,
  porChat: true,
  ...extra,
});

describe("lo que dicta el chat — DB real (E3)", () => {
  it("⭐ una tarea HECHA que se muda conserva su id, su estado y sus fechas reales; la de la IA que cambia pasa a MODIFIED", async () => {
    /* D2. La edición que la pone en rojo: mudar recreando (borrar y crear: se pierde el estado, como
       hoy el PUT del chat), o dejar AGENT una tarea que editó una persona. */
    const m = await mundoDelChat();
    const pedido = await pedidoDelChat(m.tl.id, (vivo) => [
      cambiaLa(vivo, m.hecha.id, m.diseno.id, { fase: m.pruebas.id }),
      cambiaLa(vivo, m.deLaIa.id, m.diseno.id, { title: "Definir el pipeline de ventas" }),
    ]);
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    expect(r.tareas).toEqual({ creadas: 0, borradas: 0, cambiadas: 2, mudadas: 1 });
    const mudada = await prisma.timelineTask.findUniqueOrThrow({ where: { id: m.hecha.id } });
    expect([mudada.phaseId, mudada.status, mudada.weekIndex, mudada.order]).toEqual([m.pruebas.id, "DONE", 1, 0]);
    expect(mudada.actualStart?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    const renombrada = await prisma.timelineTask.findUniqueOrThrow({ where: { id: m.deLaIa.id } });
    expect([renombrada.title, renombrada.source, renombrada.phaseId]).toEqual(["Definir el pipeline de ventas", "MODIFIED", m.diseno.id]);
    expect(await prisma.timelineTask.count({ where: { phase: { timelineId: m.tl.id } } }), "se recreó una tarea").toBe(3);
  });

  it("⭐ la fase que se va con una protegida se queda con ella; vacía, se borra de verdad (el Cascade no se lleva nada)", async () => {
    /* D3. La edición que la pone en rojo: borrar la fase sin el `none` (el Cascade real se llevaría la
       HECHA), o no borrar la que quedó vacía. */
    const m = await mundoDelChat();
    const pedido = await pedidoDelChat(m.tl.id, (vivo) => [faseQueSeVa(vivo, m.diseno.id), faseQueSeVa(vivo, m.cierre.id)]);
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    expect(r.fasesBorradas).toEqual([m.cierre.id]);
    expect(r.tareas.borradas).toBe(1);
    const fases = await prisma.timelinePhase.findMany({ where: { timelineId: m.tl.id }, orderBy: { order: "asc" }, include: { tasks: true } });
    expect(fases.map((f) => [f.name, f.order, f.tasks.map((t) => t.title)])).toEqual([
      ["Diseño", 0, ["Mapear procesos"]],
      ["Pruebas", 1, ["Probar flujos"]],
    ]);
    // Sin su pendiente, lo que queda de «Diseño» está hecho: se cierra.
    expect(fases[0].status).toBe("DONE");
    const tl = await prisma.projectTimeline.findUniqueOrThrow({ where: { id: m.tl.id }, select: { pendingProposal: true } });
    expect(tl.pendingProposal).toBeNull();
  });

  it("⏱ tamaño Wherex: «quitar una semana» en las 12 fases (las tareas de las semanas siguientes se corren), y deja el tiempo", async () => {
    /* Riesgo 6 de E3: una llamada por cada tarea que cambia. El chat corre las tareas de a una fase; esto
       es el peor caso (las 12 a la vez, 168 tareas que se corren) y deja la medida en consola. No falla
       por tiempo —la base local no es el pooler remoto—: prueba que la cuenta cierra dentro del techo. */
    const cliente = await prisma.client.create({ data: { name: "Cliente grande del chat (test)" } });
    const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación grande del chat (test)" } });
    const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id } });
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
    const pedido = await pedidoDelChat(tl.id, (vivo) =>
      vivo.fases.flatMap((f): Borrador["cambios"] => {
        const duracion = claveDeCampo(f.id, "durationWeeks");
        return [
          { tipo: "fase-cambia", clave: duracion, faseId: f.id, fase: f.name, campo: "durationWeeks", desde: 3, a: 2, porChat: true },
          ...(f.tareas ?? []).filter((t) => t.weekIndex > 0).map((t) => cambiaLa(vivo, t.id, f.id, { weekIndex: t.weekIndex - 1 }, { conCambio: duracion })),
        ];
      }),
    );
    const t0 = Date.now();
    const r = await prisma.$transaction((tx) => aplicarBorradorEnTx(tx, pedido), TECHO);
    console.log(`[borrador-aplicar.int] Wherex, quitar una semana en 12 fases: ${r.tareas.cambiadas} tareas corridas en ${Date.now() - t0} ms`);
    expect(r.tareas).toEqual({ creadas: 0, borradas: 0, cambiadas: 168, mudadas: 0 });
    expect(r.avisos, "el aviso contó tareas que se corren con su propio cambio").toEqual([]);
    const porSemana = await prisma.timelineTask.groupBy({ by: ["weekIndex"], where: { phase: { timelineId: tl.id } }, _count: true });
    expect(Object.fromEntries(porSemana.map((g) => [g.weekIndex, g._count]))).toEqual({ 0: 168, 1: 84 });
  }, 60_000);
});
