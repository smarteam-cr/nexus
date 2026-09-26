/**
 * lib/timeline/recalculo-rutas.test.ts — E2c P2: EL SERVIDOR del recálculo de las tareas de las fases
 * desfasadas. Lo escribió P2 inerte; desde P3 la pantalla manda `recalcular` y `forzar`.
 *
 * Correr: `npx vitest run lib/timeline/recalculo-rutas.test.ts --project unit`.
 *
 * El harness es el de borrador-rutas.test.ts (la base y los guards FALSOS, hoisted): el helper y las
 * rutas reales corren contra esto, y se cuentan las escrituras. Lo que cuida (spec de E2c, §3 y §5 P2):
 *   1. el pedido: `recalcular` solo con token y con techo;
 *   2. la prevalidación: las tareas «listas», ningún recálculo en curso y alguna fase desfasada;
 *   3. la marca: `recalculo` aparte de `tareas`, condicionada a token + versión;
 *   4. la estructura que lee el agente: con lo desmarcado y el alcance del JSON guardado;
 *   5. la fusión: reemplaza solo las tareas de esas fases, en su lugar; la fase que no calza conserva
 *      las suyas y queda en `recalculo` con su motivo; NUNCA borra;
 *   6. el estado del recálculo, deducido de su corrida;
 *   7. aplicar con `forzar`;
 *   8. analyze: el alcance del prompt sale del JSON guardado.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

// ── La base y los guards FALSOS (hoisted): las rutas reales corren contra esto ──────────────────
// (copiado de borrador-rutas.test.ts: los dos archivos se pueden correr solos)
const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  timelinePhase: { findFirst: vi.fn(), findMany: vi.fn() },
  timelineTask: { findMany: vi.fn() },
  agentRun: { findUnique: vi.fn(), update: vi.fn() },
  timelineChange: { create: vi.fn() },
  project: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const guards = vi.hoisted(() => ({
  guardTimelineEdit: vi.fn(),
  guardIaDelCronograma: vi.fn(),
}));
vi.mock("@/lib/auth/api-guards", () => guards);

import { POST as aplicarPOST } from "@/app/api/projects/[projectId]/timeline/borrador/aplicar/route";
import { ErrorAlAplicar, type ResultadoDeAplicar } from "@/lib/timeline/escribir-estructura";
import { FORMATO_BORRADOR, leerBorrador, type FaseDesfasada } from "@/lib/timeline/borrador";
import {
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  leerEstadoDeLasTareas,
  leerPedidoDeTareas,
  marcarTareasEnCurso,
  MENSAJE_NADA_QUE_RECALCULAR,
  MENSAJE_SIN_TAREAS_QUE_ARMAR,
  MENSAJE_TAREAS_EN_CURSO,
  MOTIVO_RECALCULO_CORTADO,
  MOTIVO_RECALCULO_EDITADA,
  motivoDelRecalculo,
  MOTIVO_RECALCULO_PERDIDO,
  MOTIVO_RECALCULO_SIN_TAREAS,
  MOTIVO_TAREAS_CORTADAS,
  prevalidarPedidoDeTareas,
  VUELTAS_DE_LA_FUSION,
} from "@/lib/timeline/borrador-del-detalle";
import { Prisma } from "@prisma/client";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/** Blanquea comentarios conservando saltos: NOMBRAR un problema para explicarlo no es causarlo. */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");

const APLICAR = "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts";
const ANALYZE = "app/api/clients/[id]/analyze/route.ts";
const ESCRIBIR = "lib/timeline/escribir-estructura.ts";

// ── El cronograma de la base: Kick-off (1 sem) · Diseño (2) · Pruebas (3) ─────────────────────────

const tareaDB = (id: string, title: string, weekIndex: number, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  weekIndex,
  order: 0,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  startDateOverride: null,
  dueDateOverride: null,
  needsValidation: false,
  ...extra,
});
const faseDB = (id: string, name: string, order: number, durationWeeks: number, tasks: unknown[]) => ({
  id,
  name,
  order,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tasks,
});
const A1 = tareaDB("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN" });
const B1 = tareaDB("b1", "Mapear procesos", 0);
const C1 = tareaDB("c1", "Probar flujos", 2);
/** Las fases de la base; `durPruebas` = la duración de «Pruebas» AHORA (5 = la editaron a mano). */
const fasesDB = (durPruebas = 3) => [
  faseDB("a", "Kick-off", 0, 1, [A1]),
  faseDB("b", "Diseño", 1, 2, [B1]),
  faseDB("c", "Pruebas", 2, durPruebas, [C1]),
];

// ── El borrador guardado: «Pruebas» pasa a 4 semanas y las tareas de tres fases, «listas» ──────────

const DUR_C = {
  tipo: "fase-cambia",
  clave: "fase:c:durationWeeks",
  faseId: "c",
  fase: "Pruebas",
  campo: "durationWeeks",
  desde: 3,
  a: 4,
};
const seVa = (t: ReturnType<typeof tareaDB>, faseId: string) => ({
  tipo: "tarea-se-va",
  clave: `tarea:${t.id}:se-va`,
  tareaId: t.id,
  faseId,
  desde: { title: t.title, weekIndex: t.weekIndex, notes: null, party: "SMARTEAM", type: "TASK", inicioFijado: null, finFijado: null },
});
const nueva = (clave: string, fase: string, title: string, weekIndex: number) => ({
  tipo: "tarea-nueva",
  clave,
  fase,
  tarea: { title, weekIndex, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
});
/** Las tareas de «Pruebas» van EN EL MEDIO: el recálculo las tiene que dejar en su lugar. */
const CAMBIOS = [
  DUR_C,
  seVa(B1, "b"),
  nueva("t:b-1", "b", "Mapear procesos de venta", 0),
  seVa(C1, "c"),
  nueva("t:c-1", "c", "Pruebas de aceptación", 3),
  nueva("t:a-1", "a", "Accesos", 0),
];
const ARMADAS = {
  a: { nombre: "Kick-off", semanas: 1 },
  b: { nombre: "Diseño", semanas: 2 },
  c: { nombre: "Pruebas", semanas: 4 },
};
const guardadoCon = (extra: Record<string, unknown> = {}) => ({
  formato: FORMATO_BORRADOR,
  version: 5,
  origen: "contexto",
  observaciones: [],
  cambios: CAMBIOS,
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: true },
  tareasArmadasPara: ARMADAS,
  ...extra,
});
/** El recálculo de «Pruebas» con su cambio de semanas desmarcado, como lo deja la marca. */
const RECALCULO = { corrida: "run-r", fases: [{ id: "c", nombre: "Pruebas" }], sin: [DUR_C.clave] };
const SIN = [DUR_C.clave];

/** La base devuelve este cronograma (con el borrador `guardado`) a cualquier lectura de projectTimeline. */
const enLaBase = (guardado: unknown, durPruebas = 3) =>
  db.projectTimeline.findUnique.mockResolvedValue({
    id: "tl",
    pendingProposal: guardado,
    pendingProposalRunId: "run-1",
    anchorStartDate: null,
    closeDateOverride: null,
    project: { tags: [] },
    phases: fasesDB(durPruebas),
  });
/** La corrida `id` (y solo esa) en `status`, con `minutos` desde su último latido. */
const corridas = (porId: Record<string, { status: string; minutos: number; output?: string | null; currentPhase?: string | null }>) =>
  db.agentRun.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const c = porId[where.id];
    return c
      ? { status: c.status, updatedAt: new Date(Date.now() - c.minutos * 60_000), currentPhase: c.currentPhase ?? null, output: c.output ?? null }
      : null;
  });
const claves = () => {
  let n = 0;
  return () => `clave-${++n}`;
};
const pedirRecalculo = (sin: string[] = SIN, version = 5) => ({ token: "run-1", version, recalcular: { sin } });

beforeEach(() => {
  vi.resetAllMocks();
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: "cse@smarteam.cr" } });
  guards.guardIaDelCronograma.mockResolvedValue(null);
});

describe("1 · leerPedidoDeTareas — `recalcular` solo con token y con techo", () => {
  it("⛔ con token: `{ sin }` tal cual; con token null, o pasado de sus techos: inválido", () => {
    /* La edición que la pone en rojo: aceptar `recalcular` con token null (se «recalcularía» sobre un
       borrador que no existe) o sin techo (un canal para meter una lista sin fin en la propuesta). */
    expect(leerPedidoDeTareas({ token: "run-1", version: 5, recalcular: { sin: SIN } })).toEqual({
      token: "run-1",
      version: 5,
      recalcular: { sin: SIN },
    });
    expect(leerPedidoDeTareas({ token: "run-1", version: 5, recalcular: { sin: [] } })).toEqual({
      token: "run-1",
      version: 5,
      recalcular: { sin: [] },
    });
    expect(leerPedidoDeTareas({ token: "run-1", version: 5, recalcular: null }), "null es no pedirlo").toEqual({ token: "run-1", version: 5 });
    const enElTecho = { sin: [...Array.from({ length: 1999 }, (_, k) => `k${k}`), "x".repeat(300)] };
    expect(leerPedidoDeTareas({ token: "run-1", version: 5, recalcular: enElTecho })).toMatchObject({ recalcular: enElTecho });

    expect(leerPedidoDeTareas({ token: null, recalcular: { sin: SIN } }), "recalcular sin borrador abierto").toBe("invalido");
    expect(leerPedidoDeTareas({ token: null, recalcular: null })).toEqual({ token: null, version: null });
    for (const malo of [
      { sin: Array.from({ length: 2001 }, (_, k) => `k${k}`) },
      { sin: ["x".repeat(301)] },
      { sin: [""] },
      { sin: [1] },
      { sin: "fase:c:durationWeeks" },
      {},
      [SIN],
      "fase:c:durationWeeks",
    ]) {
      expect(leerPedidoDeTareas({ token: "run-1", version: 5, recalcular: malo }), JSON.stringify(malo).slice(0, 40)).toBe("invalido");
    }
  });
});

describe("2 · prevalidarPedidoDeTareas con `recalcular` — antes de pagar la corrida", () => {
  it("⛔ tareas que no están listas, un recálculo en curso o nada desfasado: 409; con desfasadas, sigue", async () => {
    /* La edición que la pone en rojo: recalcular sobre tareas que no están (no hay nada armado que
       recalcular), pagar dos corridas sobre lo mismo, o pagar una sin ninguna fase desfasada. */
    enLaBase(guardadoCon({ tareas: { corrida: "run-2", listas: false } }));
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo())).toEqual({ error: "NO_SE_PUEDE", message: MENSAJE_SIN_TAREAS_QUE_ARMAR });

    enLaBase(guardadoCon({ recalculo: { ...RECALCULO, corrida: "run-r0" } }));
    corridas({ "run-r0": { status: "RUNNING", minutos: 1 } });
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo())).toEqual({ error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO });
    // Uno que ya falló no frena: es «Volver a intentar».
    corridas({ "run-r0": { status: "ERROR", minutos: 1 } });
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo()), "el recálculo fallido frena el reintento").toBeNull();

    enLaBase(guardadoCon());
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo([]))).toEqual({
      error: "NADA_QUE_RECALCULAR",
      message: MENSAJE_NADA_QUE_RECALCULAR,
    });
    // Con todas las tareas de «Pruebas» desmarcadas tampoco: no hay nada que recalcular.
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo([...SIN, "tarea:c1:se-va", "t:c-1"]))).toMatchObject({
      error: "NADA_QUE_RECALCULAR",
    });
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo(SIN, 4)), "otra versión").toMatchObject({ error: "PROPUESTA_CAMBIO" });
  });

  it("⭐ con una fase desfasada: null, y la desfasada se calcula sobre las fases CON sus tareas", async () => {
    /* La edición que la pone en rojo: no leer las fases (o leerlas sin tareas): el plan sin lo vivo no
       sabe qué fase quedó desfasada. */
    enLaBase(guardadoCon());
    expect(await prevalidarPedidoDeTareas("tl", pedirRecalculo())).toBeNull();
    const { select } = db.projectTimeline.findUnique.mock.calls[0][0];
    expect(select.phases, "no lee las fases").toBeDefined();
    expect(select.phases.select.tasks, "lee las fases sin sus tareas").toBeDefined();
    expect(select.pendingProposal && select.pendingProposalRunId && select.anchorStartDate).toBe(true);
    expect(db.projectTimeline.updateMany, "la prevalidación escribió").not.toHaveBeenCalled();
  });
});

describe("3 · marcarTareasEnCurso con `recalcular` — la marca va en `recalculo`, nunca en `tareas`", () => {
  it("⛔ `recalculo` con {id, nombre} y solo lo desmarcado de la estructura; `tareas` intacto; versión + 1", async () => {
    /* [D5] Si la marca reusara `tareas`, un fallo se leería como «faltan todas», «Volver a intentar»
       armaría todas las fases y la corrida chica quedaría como la que armó el cronograma. La edición
       que la pone en rojo: reusar `tareas`, guardar todo `sin` (las casillas de tareas no rehacen la
       estructura), o escribir sin token + versión. */
    enLaBase(guardadoCon());
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const pedido = pedirRecalculo([DUR_C.clave, "tarea:b1:se-va", "t:b-1", "fase:x:name", DUR_C.clave]);
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido, corrida: "run-r" })).toBeNull();
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(1);
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: { path: ["version"], equals: 5 } });
    expect(data.pendingProposalRunId, "el token del borrador no cambia").toBeUndefined();
    expect(data.pendingProposal).toEqual({ ...guardadoCon(), version: 6, recalculo: RECALCULO });
    expect(data.pendingProposal.tareas, "la marca reusó `tareas`").toEqual({ corrida: "run-2", listas: true });
  });

  it("otra versión, o nada que recalcular: el veto, sin escribir; si la escritura no entra, PROPUESTA_CAMBIO", async () => {
    enLaBase(guardadoCon());
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: pedirRecalculo(SIN, 4), corrida: "run-r" })).toMatchObject({
      error: "PROPUESTA_CAMBIO",
    });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: pedirRecalculo([]), corrida: "run-r" })).toMatchObject({
      error: "NADA_QUE_RECALCULAR",
    });
    expect(db.projectTimeline.updateMany, "escribió con un veto").not.toHaveBeenCalled();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: pedirRecalculo(), corrida: "run-r" })).toMatchObject({
      error: "PROPUESTA_CAMBIO",
    });
  });
});

describe("4 · estructuraParaElDetalle — lo que lee el agente, con el alcance del JSON guardado", () => {
  it("⭐ el recálculo ve la estructura CON lo desmarcado y pide solo sus fases; otra corrida: null", async () => {
    /* La edición que la pone en rojo: armar la estructura sin `recalculo.sin` (el agente recalcularía
       para las 4 semanas que el CSE quitó), o sin `soloFases` (el prompt pediría todas las fases). */
    enLaBase(guardadoCon({ recalculo: RECALCULO }));
    const sobre = await estructuraParaElDetalle("tl", "run-r");
    expect(sobre, "el recálculo no encuentra su estructura").not.toBeNull();
    expect(sobre!.fases.map((f) => [f.id, f.durationWeeks])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(sobre!.soloFases).toEqual(["c"]);
    expect(await estructuraParaElDetalle("tl", "run-otra"), "corrió sobre el recálculo de otra corrida").toBeNull();
    // Sin las tareas «listas», el recálculo no tiene sobre qué correr.
    enLaBase(guardadoCon({ recalculo: RECALCULO, tareas: { corrida: "run-2", listas: false } }));
    expect(await estructuraParaElDetalle("tl", "run-r")).toBeNull();
  });

  it("el camino de siempre: «Regenerar» de una fase lleva `soloFases: [soloFase]`; todo el cronograma, ninguno", async () => {
    /* E2b D3: el alcance sale del JSON guardado, también para el prompt. La edición que la pone en
       rojo: no pasarlo (el prompt pediría todas las fases) o inventarlo sin `soloFase`. */
    enLaBase(guardadoCon({ cambios: [], tareas: { corrida: "run-f", listas: false }, tareasArmadasPara: {}, soloFase: "b" }));
    const deUnaFase = await estructuraParaElDetalle("tl", "run-f");
    expect(deUnaFase?.soloFases).toEqual(["b"]);
    expect(deUnaFase?.fases.map((f) => f.durationWeeks), "el camino de siempre mira lo desmarcado").toEqual([1, 2, 3]);
    enLaBase(guardadoCon({ tareas: { corrida: "run-2", listas: false } }));
    const todas = await estructuraParaElDetalle("tl", "run-2");
    expect(todas?.fases.find((f) => f.id === "c")?.durationWeeks, "sin mirar lo desmarcado").toBe(4);
    expect(todas && "soloFases" in todas, "inventó un alcance").toBe(false);
  });
});

describe("5 · fusionarDetalleEnElBorrador con un recálculo — solo cambian sus fases, y nunca se borra", () => {
  /** La estructura que VIO el agente: la que da `estructuraParaElDetalle` con la base de ANTES. */
  const loQueVio = async () => {
    enLaBase(guardadoCon({ recalculo: RECALCULO }));
    return (await estructuraParaElDetalle("tl", "run-r"))!.estructura;
  };
  /** Lo que devolvió el agente: tareas para «Pruebas» y, fuera del alcance, también para «Diseño». */
  const DEVUELTO = {
    timelineDetail: {
      phases: [
        { id: "a", tasks: [] },
        { id: "b", tasks: [{ title: "Algo que no se pidió", weekIndex: 0 }] },
        { id: "c", tasks: [{ title: "Probar con el cliente", weekIndex: 2 }] },
      ],
    },
  };
  const fusionar = async (extra: { analysisJson?: unknown; cortado?: boolean; durPruebasAhora?: number; guardado?: unknown } = {}) => {
    const estructura = await loQueVio();
    enLaBase(extra.guardado ?? guardadoCon({ recalculo: RECALCULO }), extra.durPruebasAhora ?? 3);
    db.projectTimeline.findUnique.mockClear();
    return fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida: "run-r",
      estructura,
      analysisJson: extra.analysisJson ?? DEVUELTO,
      huellas: null,
      cortado: extra.cortado ?? false,
      nuevaClave: claves(),
    });
  };
  const escrito = () => db.projectTimeline.updateMany.mock.calls[0][0].data.pendingProposal;

  it("⭐ reemplaza las tareas de «Pruebas» EN SU LUGAR y conserva todo lo demás", async () => {
    /* [D2] La edición que la pone en rojo: fusionarlo con `fusionarDetalle` (tiraría las tareas de las
       otras fases y pisaría `tareas`), agregar las nuevas al final, o escribir fases fuera del alcance. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await fusionar()).toEqual({ estado: "recalculadas", escritas: ["c"], fallidas: [] });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(1);
    const [{ where }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: { path: ["version"], equals: 5 } });
    const b = escrito();
    expect(b, "borró el borrador").not.toBe(Prisma.DbNull);
    expect(b.cambios.map((c: { clave: string }) => c.clave), "las tareas no quedaron en su lugar").toEqual([
      DUR_C.clave,
      "tarea:b1:se-va",
      "t:b-1",
      "tarea:c1:se-va",
      "t:clave-1",
      "t:a-1",
    ]);
    expect(b.cambios[4].tarea).toMatchObject({ title: "Probar con el cliente", weekIndex: 2 });
    expect(b.cambios.slice(0, 3), "tocó las tareas de otra fase").toEqual(CAMBIOS.slice(0, 3));
    expect(b.tareas, "pisó `tareas`: la corrida chica quedaría como la que armó todo").toEqual({ corrida: "run-2", listas: true });
    // ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan (R8 guarda la forma completa).
    expect(b.tareasArmadasPara).toEqual({ ...ARMADAS, c: { nombre: "Pruebas", semanas: 3, sesiones: null, semanaCero: false } });
    expect(b.recalculo, "el recálculo entero no se cerró").toBeNull();
    expect(b.version).toBe(6);
    expect(b.pedido).toBe("regenerar");
    expect(db.agentRun.update, "una fusión que entra no deja aviso en la corrida").not.toHaveBeenCalled();
  });

  it("⛔ «Pruebas» editada a mano mientras corría: NO se escribe, conserva sus tareas y queda con su motivo", async () => {
    /* [D11] La corrida escribe una fase solo si conserva la forma con que arrancó. La edición que la
       pone en rojo: no comparar la forma (se escribirían tareas armadas para 3 semanas en una fase de
       5), o reemplazar sus tareas por nada (se perdería lo pagado y «Aplicar de todos modos»). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await fusionar({ durPruebasAhora: 5 })).toEqual({ estado: "recalculadas", escritas: [], fallidas: ["c"] });
    const b = escrito();
    expect(b, "borró el borrador").not.toBe(Prisma.DbNull);
    expect(b.cambios, "escribió la fase que cambió").toEqual(CAMBIOS);
    expect(b.tareasArmadasPara).toEqual(ARMADAS);
    expect(b.recalculo).toEqual({ ...RECALCULO, motivo: MOTIVO_RECALCULO_EDITADA });
    expect(b.tareas).toEqual({ corrida: "run-2", listas: true });
  });

  it("⛔ la salida cortada en «Pruebas» o sin sus tareas: conserva las suyas, con su motivo; NUNCA borra", async () => {
    /* [D6] Una fase cortada o vacía no se reemplaza por nada. La edición que la pone en rojo: escribirla
       igual, o borrar el borrador como la fusión de siempre cuando no queda ningún cambio. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await fusionar({ cortado: true })).toEqual({ estado: "recalculadas", escritas: [], fallidas: ["c"] });
    expect(escrito(), "borró el borrador").not.toBe(Prisma.DbNull);
    expect(escrito().cambios).toEqual(CAMBIOS);
    expect(escrito().recalculo).toEqual({ ...RECALCULO, motivo: MOTIVO_RECALCULO_CORTADO });

    db.projectTimeline.updateMany.mockClear();
    const sinTareas = { timelineDetail: { phases: [{ id: "c", tasks: [] }] } };
    expect(await fusionar({ analysisJson: sinTareas })).toEqual({ estado: "recalculadas", escritas: [], fallidas: ["c"] });
    expect(escrito(), "borró el borrador").not.toBe(Prisma.DbNull);
    expect(escrito().cambios).toEqual(CAMBIOS);
    expect(escrito().recalculo).toEqual({ ...RECALCULO, motivo: MOTIVO_RECALCULO_SIN_TAREAS });

    /* Con varias fases que fallan por causas distintas, el motivo las dice todas (en su orden), cada una con
       SUS fases.
       ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: las causas se unían con «y» y no se
       sabía cuál había fallado por qué («se editó a mano… y la IA no devolvió sus tareas»). */
    db.projectTimeline.updateMany.mockClear();
    const dos = { ...RECALCULO, fases: [{ id: "b", nombre: "Diseño" }, { id: "c", nombre: "Pruebas" }] };
    const r = await fusionar({ guardado: guardadoCon({ recalculo: dos }), durPruebasAhora: 5, analysisJson: sinTareas });
    expect(r).toEqual({ estado: "recalculadas", escritas: [], fallidas: ["b", "c"] });
    expect(escrito(), "borró el borrador").not.toBe(Prisma.DbNull);
    expect(escrito().recalculo.motivo).toBe(`en «Pruebas», ${MOTIVO_RECALCULO_EDITADA}; en «Diseño», ${MOTIVO_RECALCULO_SIN_TAREAS}`);
  });

  it("⭐ motivoDelRecalculo: una causa, tal cual; causas distintas, cada una con sus fases y en su orden", () => {
    /* Revisión de E2c. La edición que la pone en rojo: volver a unir las causas sin decir de qué fase es
       cada una, o cambiar el texto de una sola causa (es el de siempre). */
    expect(motivoDelRecalculo([])).toBeNull();
    expect(motivoDelRecalculo([{ nombre: "Pruebas", motivo: MOTIVO_RECALCULO_CORTADO }])).toBe(MOTIVO_RECALCULO_CORTADO);
    expect(
      motivoDelRecalculo([
        { nombre: "Pruebas", motivo: MOTIVO_RECALCULO_CORTADO },
        { nombre: "Diseño", motivo: MOTIVO_RECALCULO_CORTADO },
      ]),
      "una sola causa en dos fases",
    ).toBe(MOTIVO_RECALCULO_CORTADO);
    expect(
      motivoDelRecalculo([
        { nombre: "Piloto", motivo: MOTIVO_RECALCULO_SIN_TAREAS },
        { nombre: "Pruebas", motivo: MOTIVO_RECALCULO_CORTADO },
        { nombre: "Diseño", motivo: MOTIVO_RECALCULO_SIN_TAREAS },
      ]),
    ).toBe(`en «Pruebas», ${MOTIVO_RECALCULO_CORTADO}; en «Piloto» y «Diseño», ${MOTIVO_RECALCULO_SIN_TAREAS}`);
  });

  it("⛔ otra corrida: «perdido», sin escribir y con el aviso en la corrida", async () => {
    /* La edición que la pone en rojo: fusionar sobre el recálculo de otra corrida. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await fusionar({ guardado: guardadoCon({ recalculo: { ...RECALCULO, corrida: "run-otra" } }) })).toEqual({ estado: "perdido" });
    expect(db.projectTimeline.updateMany, "escribió un recálculo que no era el suyo").not.toHaveBeenCalled();
    expect(db.agentRun.update).toHaveBeenCalledTimes(1);
  });

  /* ⚠ REESCRITA en E3 P2 (2026-09-25), con esta razón: el caso de «la escritura que no entra» decía
     «perdido, sin reintentar». Desde E3 las casillas del CSE y la marca del chat escriben el borrador
     mientras la IA recalcula (suben la versión): ahora la fusión vuelve a leer y a fusionar, y conserva lo
     desmarcado y lo que dictó el chat. Con otra corrida en la relectura, sigue siendo «perdido».
     La edición que la pone en rojo: volver a «perdido» sin releer, reemplazar las tareas del chat con las
     recalculadas, o dejar la forma ajustada de una fase que se volvió a armar (D9). */
  it("la escritura que no entra: vuelve a leer y reintenta, conservando lo desmarcado y lo del chat", async () => {
    const estructura = await loQueVio();
    const DEL_CHAT_EN_C = { ...nueva("t:chat-c", "c", "Revisión con el cliente", 0), porChat: true };
    const base = {
      id: "tl",
      pendingProposalRunId: "run-1",
      anchorStartDate: null,
      closeDateOverride: null,
      project: { tags: [] },
      phases: fasesDB(3),
    };
    const fusionarConLecturas = async (...guardados: unknown[]) => {
      db.projectTimeline.findUnique.mockReset();
      for (const g of guardados) db.projectTimeline.findUnique.mockResolvedValueOnce({ ...base, pendingProposal: g });
      return fusionarDetalleEnElBorrador({
        timelineId: "tl",
        corrida: "run-r",
        estructura,
        analysisJson: DEVUELTO,
        huellas: null,
        cortado: false,
        nuevaClave: claves(),
      });
    };
    const releido = guardadoCon({
      version: 6,
      recalculo: RECALCULO,
      cambios: [...CAMBIOS.slice(0, 4), DEL_CHAT_EN_C, ...CAMBIOS.slice(4)],
      excluidos: ["tarea:b1:se-va"],
      chatAbiertoPara: ["h-1"],
      ajustadasPorElChat: { c: { nombre: "Pruebas", semanas: 3 }, b: { nombre: "Diseño", semanas: 1 } },
    });
    db.projectTimeline.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await fusionarConLecturas(guardadoCon({ recalculo: RECALCULO }), releido)).toEqual({
      estado: "recalculadas",
      escritas: ["c"],
      fallidas: [],
    });
    expect(db.projectTimeline.updateMany, "no volvió a intentar").toHaveBeenCalledTimes(2);
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[1];
    expect(where.pendingProposal).toEqual({ path: ["version"], equals: 6 });
    const b = data.pendingProposal;
    expect(b.version).toBe(7);
    expect(b.excluidos, "perdió lo desmarcado").toEqual(["tarea:b1:se-va"]);
    expect(b.chatAbiertoPara).toEqual(["h-1"]);
    expect(b.cambios.map((c: { clave: string }) => c.clave), "reemplazó la tarea que dictó el chat").toContain("t:chat-c");
    expect(b.ajustadasPorElChat, "la fase recalculada conservó la forma del chat").toEqual({ b: { nombre: "Diseño", semanas: 1 } });
    expect(b.recalculo).toBeNull();
    expect(db.agentRun.update).not.toHaveBeenCalled();

    // En la relectura el recálculo ya es de OTRA corrida: «perdido», sin volver a escribir.
    db.projectTimeline.updateMany.mockReset();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await fusionarConLecturas(guardadoCon({ recalculo: RECALCULO }), guardadoCon({ version: 6, recalculo: { ...RECALCULO, corrida: "run-otra" } })),
    ).toEqual({ estado: "perdido" });
    expect(db.projectTimeline.updateMany, "escribió un recálculo que no era el suyo").toHaveBeenCalledTimes(1);
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toBe(MOTIVO_RECALCULO_PERDIDO);

    // Y si nunca entra, se rinde a las VUELTAS_DE_LA_FUSION, con el aviso del recálculo.
    db.agentRun.update.mockReset();
    db.projectTimeline.updateMany.mockReset();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    const siempre = Array.from({ length: VUELTAS_DE_LA_FUSION }, () => guardadoCon({ recalculo: RECALCULO }));
    expect(await fusionarConLecturas(...siempre)).toEqual({ estado: "perdido" });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(VUELTAS_DE_LA_FUSION);
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toBe(MOTIVO_RECALCULO_PERDIDO);
  });
});

describe("6 · leerEstadoDeLasTareas — el estado del recálculo se DEDUCE de su corrida", () => {
  it("⭐ «armando» con su fase; «fallo» con el motivo guardado primero; sin recálculo, no está", async () => {
    /* [D6] La edición que la pone en rojo: guardar el estado en vez de deducirlo (un proceso muerto
       diría «recalculando» para siempre), o tapar el motivo del fallo parcial con el de la corrida. */
    const conRecalculo = guardadoCon({ recalculo: RECALCULO });
    corridas({ "run-r": { status: "RUNNING", minutos: 2, currentPhase: "Armando «Pruebas»" } });
    expect(await leerEstadoDeLasTareas(conRecalculo)).toEqual({
      estado: "listas",
      fase: null,
      motivo: null,
      recalculo: { estado: "armando", corrida: "run-r", fases: ["c"], nombres: ["Pruebas"], fase: "Armando «Pruebas»", motivo: null },
    });
    corridas({ "run-r": { status: "RUNNING", minutos: 31 } });
    expect((await leerEstadoDeLasTareas(conRecalculo))?.recalculo, "la corrida colgada sigue «armando»").toMatchObject({
      estado: "fallo",
      fase: null,
      motivo: MOTIVO_TAREAS_CORTADAS,
    });
    corridas({});
    expect((await leerEstadoDeLasTareas(conRecalculo))?.recalculo, "sin la fila de la corrida").toMatchObject({ estado: "fallo" });

    // El fallo parcial: la corrida terminó (DONE) y el motivo guardado va primero.
    const parcial = guardadoCon({ recalculo: { ...RECALCULO, motivo: MOTIVO_RECALCULO_EDITADA } });
    corridas({ "run-r": { status: "DONE", minutos: 1 } });
    expect((await leerEstadoDeLasTareas(parcial))?.recalculo, "el motivo guardado no fue primero").toMatchObject({
      estado: "fallo",
      motivo: MOTIVO_RECALCULO_EDITADA,
    });

    db.agentRun.findUnique.mockClear();
    const sin = await leerEstadoDeLasTareas(guardadoCon());
    expect(sin).toEqual({ estado: "listas", fase: null, motivo: null });
    expect(sin?.recalculo ?? null).toBeNull();
    expect(db.agentRun.findUnique, "leyó una corrida sin recálculo").not.toHaveBeenCalled();
  });
});

describe("7 · POST /timeline/borrador/aplicar con `forzar`", () => {
  const pedir = (body: unknown) =>
    new Request("http://test.local/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest;
  const delProyecto = { params: Promise.resolve({ projectId: "p1" }) };
  const aplicar = (extra: Record<string, unknown>) =>
    aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: 5, ...extra }), delProyecto);

  it("⛔ un `forzar` que no es una lista de ids con techo: 400, sin leer ni abrir la transacción", async () => {
    for (const forzar of ["c", [1], [""], ["x".repeat(201)], Array.from({ length: 201 }, (_, k) => `f${k}`), null]) {
      const res = await aplicar({ forzar });
      expect(res.status, JSON.stringify(forzar).slice(0, 30)).toBe(400);
    }
    expect(db.projectTimeline.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("⛔ forzar con el recálculo «armando»: 409 ANTES de la transacción; sin forzar, o con el recálculo fallido, sigue", async () => {
    /* [D9] Forzar mientras el recálculo corre aplicaría tareas armadas para otra forma cuando las buenas
       están por llegar. La edición que la pone en rojo: no mirar el recálculo, o mirarlo después de
       abrir la transacción. */
    enLaBase(guardadoCon({ recalculo: RECALCULO }));
    corridas({ "run-r": { status: "RUNNING", minutos: 1 } });
    // Si la ruta siguiera de largo, la transacción respondería otra cosa (y quedaría llamada).
    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    const res = await aplicar({ forzar: ["c"] });
    expect(res.status).toBe(409);
    expect(await res.json(), "forzó con el recálculo en curso").toEqual({ error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO });
    expect(db.$transaction, "abrió la transacción").not.toHaveBeenCalled();

    const ruta = soloCodigo(leer(APLICAR));
    const i409 = ruta.indexOf('estadoDeTareas?.recalculo?.estado === "armando"');
    expect(i409, "no encontré el 409 de forzar").toBeGreaterThan(-1);
    expect(i409).toBeLessThan(ruta.indexOf("prisma.$transaction("));

    // Sin forzar, el recálculo en curso no frena aplicar (el plan decide); con él fallido, forzar sigue.
    expect((await aplicar({})).status).toBe(409);
    corridas({ "run-r": { status: "ERROR", minutos: 1 } });
    expect((await aplicar({ forzar: ["c"] })).status).toBe(409);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("⭐ `forzar` viaja al cuerpo probado y al plan, y la auditoría dice qué se aplicó sin recalcular", async () => {
    /* La edición que la pone en rojo: no pasarlo (el plan no forzaría nada y «Aplicar de todos modos»
       no haría nada), o no dejarlo dicho en el historial. */
    const ruta = soloCodigo(leer(APLICAR));
    const tx = ruta.slice(ruta.indexOf("prisma.$transaction("), ruta.indexOf("} catch (e) {"));
    expect(tx.length).toBeGreaterThan(80);
    expect(tx, "`forzar` no viaja a la transacción").toMatch(/\bforzar,/);
    expect(soloCodigo(leer(ESCRIBIR)), "el plan del servidor no fuerza").toContain(
      "planDeAplicacion(vivo, borrador, p.sin, { tareas: p.tareas, forzar: p.forzar })",
    );

    const razon = async (forzadas: Array<Pick<FaseDesfasada, "fase" | "nombre">>) => {
      const guardado = guardadoCon();
      db.projectTimeline.findUnique
        .mockResolvedValueOnce({ id: "tl", pendingProposal: guardado, pendingProposalRunId: "run-1" })
        .mockResolvedValueOnce({ anchorStartDate: null });
      db.timelinePhase.findMany.mockResolvedValue([]);
      db.$transaction.mockResolvedValue({
        borrador: leerBorrador(guardado, { ancla: null, fases: [] })!,
        plan: { marcadas: 3, total: 3, aplicadas: [], forzadas },
        avisos: [],
        anclaAntes: null,
        fasesAntes: [],
        tareasTocadas: 2,
        tareas: { creadas: 1, borradas: 1 },
      } as unknown as ResultadoDeAplicar);
      expect((await aplicar({ forzar: forzadas.map((f) => f.fase) })).status).toBe(200);
      const llamadas = db.timelineChange.create.mock.calls;
      return llamadas[llamadas.length - 1][0].data.reason as string;
    };
    expect(await razon([{ fase: "c", nombre: "Pruebas" }])).toMatch(/\. Sin recalcular: «Pruebas»\.$/);
    expect(await razon([])).not.toContain("Sin recalcular");
  });
});

describe("8 · analyze — el alcance del prompt sale del JSON guardado", () => {
  const ruta = soloCodigo(leer(ANALYZE));

  it("⛔ el prompt pide las fases de `soloFases` (una o las del recálculo), nunca las del body", () => {
    /* [D10] La edición que la pone en rojo: volver a armar el alcance del prompt con `regeneratePhaseId`
       del body (el recálculo, que no lo trae, pediría todas las fases). */
    expect(ruta).toContain("regenerarFaseIds: sobreDelDetalle?.soloFases ?? null,");
    expect(ruta, "volvió el alcance de una sola fase").not.toContain("regenerarFaseId:");
  });

  it("⛔ la ruta sigue sin escribir el borrador: la marca, la estructura y la fusión despachan en el helper", () => {
    /* La cuenta que dejó E2b: el fail-fast y el alta del cronograma que nunca existió. La edición que la
       pone en rojo: escribir el recálculo (o cualquier cosa del borrador) en la ruta. */
    expect(ruta.match(/prisma\.projectTimeline\./g) ?? []).toHaveLength(2);
  });
});
