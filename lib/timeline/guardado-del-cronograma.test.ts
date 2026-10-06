/**
 * lib/timeline/guardado-del-cronograma.test.ts — QUE EL AUTOGUARDADO Y EL DESHACER DEL CRONOGRAMA NO PIERDAN
 * DATOS (auditoría del deshacer, 2026-10-05).
 *
 * Correr: `npx vitest run --project unit lib/timeline/guardado-del-cronograma.test.ts`.
 *
 * Tres capas, como el resto de las guardas del cronograma:
 *  1. La lógica pura (lib/timeline/guardado-del-cronograma.ts), con sus casos.
 *  2. La CONDUCTA del PUT /timeline: la ruta real con Prisma y los guards falsos (vi.mock), mirando qué escribe.
 *  3. El cableado de la pantalla (CronogramaCanvas, TaskDetailDrawer): escaneos del código sin comentarios (los
 *     tests de este repo corren sin DOM). Cada tramo se verifica primero no vacío.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

// ── La base y los guards FALSOS (hoisted): el PUT real corre contra esto ──────────────────────────
const db = vi.hoisted(() => ({
  projectTimeline: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  timelinePhase: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  timelineTask: {
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
  timelineChange: { create: vi.fn() },
  project: { findUnique: vi.fn() },
  agentRun: { update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const guards = vi.hoisted(() => ({
  guardAccessToProject: vi.fn(),
  guardTimelineEdit: vi.fn(),
  guardTimelineDelete: vi.fn(),
}));
vi.mock("@/lib/auth/api-guards", () => guards);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/cs/timeline-events", async (original) => ({
  ...(await original<typeof import("@/lib/cs/timeline-events")>()),
  emitTimelineEventsSafe: vi.fn(),
}));

import { NextResponse } from "next/server";
import { PUT } from "@/app/api/projects/[projectId]/timeline/route";
import {
  adoptarIdsRecreados,
  borradasAMano,
  CODIGO_CRONOGRAMA_CAMBIO,
  datosParaRecrearFase,
  datosParaRecrearTarea,
  fotoVieja,
  honrarBorradas,
  huellasDeLasRecreadas,
  idsVigentes,
  idVigente,
  leerBorradas,
  leerIdsRecreados,
  leerRespaldoDeTarea,
  leerVersionBase,
  MENSAJE_CRONOGRAMA_CAMBIO,
  queHacerConLaTarea,
  trasUnGuardadoFallido,
  versionDelCronograma,
  type CronogramaVersionado,
  type FaseVersionada,
} from "./guardado-del-cronograma";
import { idsBorrablesPorOmision } from "./rescate-progreso";
import { fingerprintFromTitle } from "./particularidad-identity";
import { validateTimelinePayload } from "./validate";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
/** Blanquea comentarios conservando saltos: NOMBRAR un problema para explicarlo no es causarlo. */
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, "");
const sinEspacios = (s: string) => s.replace(/\s+/g, "");
const contiene = (src: string, esperado: string) => sinEspacios(src).includes(sinEspacios(esperado));
const tramo = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error(`no encuentro el inicio del tramo: «${desde}»`);
  const j = src.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error(`no encuentro el fin del tramo: «${hasta}» (después de «${desde}»)`);
  return src.slice(i, j);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 1 · LA LÓGICA PURA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const arbol = (): CronogramaVersionado => ({
  anchorStartDate: new Date("2026-10-05T00:00:00.000Z"),
  closeDateOverride: null,
  phases: [
    {
      id: "f2",
      name: "Configuración",
      order: 1,
      durationWeeks: 3,
      startWeek: null,
      sessionCount: 2,
      notes: null,
      activityType: "CONFIGURACION",
      tasks: [{ id: "t3", title: "Pipeline", weekIndex: 0, order: 0, notes: null, party: "SMARTEAM", type: "TASK" }],
    },
    {
      id: "f1",
      name: "Diseño",
      order: 0,
      durationWeeks: 2,
      startWeek: null,
      sessionCount: null,
      notes: null,
      activityType: null,
      tasks: [
        { id: "t2", title: "Mapear", weekIndex: 1, order: 0, notes: null, party: null, type: null },
        { id: "t1", title: "Kick-off", weekIndex: 0, order: 0, notes: null, party: "AMBOS", type: "SESSION" },
      ],
    },
  ],
});

describe("T2 · versionDelCronograma — la huella de lo que el PUT escribe", () => {
  it("no depende del orden en que la base devuelve fases y tareas, ni de Date vs ISO", () => {
    const a = arbol();
    const b = arbol();
    b.phases = [...b.phases].reverse().map((p) => ({ ...p, tasks: [...p.tasks].reverse() }));
    b.anchorStartDate = "2026-10-05T00:00:00.000Z";
    expect(versionDelCronograma(b)).toBe(versionDelCronograma(a));
  });

  it("cambia con cualquier campo que el PUT escribe (y con mover una tarea de fase)", () => {
    /* La edición que la pone en rojo: dejar afuera de la huella un campo que el PUT escribe — una foto vieja
       que solo difiere en ese campo pasaría y pisaría. */
    const base = versionDelCronograma(arbol());
    const variantes: Array<(c: CronogramaVersionado) => void> = [
      (c) => ((c.phases[1] as { name: string }).name = "Diseño 2"),
      (c) => ((c.phases[1] as { durationWeeks: number }).durationWeeks = 4),
      (c) => ((c.phases[1] as { startWeek: number | null }).startWeek = 1),
      (c) => ((c.phases[0] as { sessionCount: number | null }).sessionCount = 3),
      (c) => ((c.phases[0] as { order: number }).order = 5),
      (c) => ((c.phases[0] as { notes: string | null }).notes = "nota"),
      (c) => ((c.phases[0] as { activityType: string | null }).activityType = "ADOPCION"),
      (c) => ((c.phases[1].tasks[0] as { title: string }).title = "Mapear procesos"),
      (c) => ((c.phases[1].tasks[0] as { weekIndex: number }).weekIndex = 0),
      (c) => ((c.phases[1].tasks[0] as { order: number }).order = 3),
      (c) => ((c.phases[1].tasks[0] as { notes: string | null }).notes = "x"),
      (c) => ((c.phases[1].tasks[0] as { party: string | null }).party = "CLIENTE"),
      (c) => ((c.phases[1].tasks[0] as { type: string | null }).type = "SESSION"),
      (c) => ((c.phases[1].tasks[0] as { startDateOverride?: string }).startDateOverride = "2026-10-07"),
      (c) => ((c.phases[1].tasks[0] as { dueDateOverride?: string }).dueDateOverride = "2026-10-09"),
      (c) => (c.anchorStartDate = "2026-10-12T00:00:00.000Z"),
      (c) => (c.closeDateOverride = "2026-12-01T00:00:00.000Z"),
      // Una tarea BORRADA, una tarea NUEVA, una fase borrada.
      (c) => ((c.phases[1] as unknown as { tasks: unknown[] }).tasks = c.phases[1].tasks.slice(1)),
      (c) => ((c.phases[0] as unknown as { tasks: unknown[] }).tasks = [...c.phases[0].tasks, { id: "t9", title: "Nueva", weekIndex: 0, order: 1 }]),
      (c) => (c.phases = c.phases.slice(1)),
      // La MISMA tarea en otra fase (lo que hace el aplicar de una propuesta al mudarla).
      (c) => {
        const t = c.phases[1].tasks[0];
        (c.phases[1] as unknown as { tasks: unknown[] }).tasks = c.phases[1].tasks.slice(1);
        (c.phases[0] as unknown as { tasks: unknown[] }).tasks = [...c.phases[0].tasks, t];
      },
    ];
    variantes.forEach((cambiar, i) => {
      const c = arbol();
      cambiar(c);
      expect(versionDelCronograma(c), `la variante #${i} no cambió la versión`).not.toBe(base);
    });
  });

  it("⛔ NO cambia con lo que el PUT no escribe (el estado de una tarea va por PATCH)", () => {
    /* Si el estado entrara, marcar una tarea hecha volvería vieja la foto de la misma pantalla: el autoguardado
       siguiente chocaría con un 409 sin que nadie más tocara nada. La edición que la pone en rojo: meter el
       estado (o el origen) en la huella. */
    const c = arbol();
    const conEstado = {
      ...c,
      phases: c.phases.map((p) => ({ ...p, status: "DONE", tasks: p.tasks.map((t) => ({ ...t, status: "DONE", source: "HUMAN" })) })),
    };
    expect(versionDelCronograma(conEstado)).toBe(versionDelCronograma(arbol()));
  });

  it("la versión base solo se compara si vino (los demás llamadores del PUT siguen igual)", () => {
    expect(leerVersionBase({ version: "abc-def" })).toBe("abc-def");
    expect(leerVersionBase({})).toBeNull();
    expect(leerVersionBase({ version: 3 })).toBeNull();
    expect(leerVersionBase(null)).toBeNull();
    expect(fotoVieja(null, "x")).toBe(false);
    expect(fotoVieja("x", "x")).toBe(false);
    expect(fotoVieja("vieja", "x")).toBe(true);
  });
});

describe("T1 · una fila con un id que ya no existe se RECREA", () => {
  it("queHacerConLaTarea: crear, actualizar, recrear o de otra fase", () => {
    const deEstaFase = new Set(["t1"]);
    const delCronograma = new Map([["t1", "f1"], ["t2", "f2"]]);
    expect(queHacerConLaTarea(undefined, deEstaFase, delCronograma)).toBe("crear");
    expect(queHacerConLaTarea("t1", deEstaFase, delCronograma)).toBe("actualizar");
    expect(queHacerConLaTarea("t2", deEstaFase, delCronograma), "un id de otra fase no se recrea (se duplicaría)").toBe("de-otra-fase");
    expect(queHacerConLaTarea("t-borrada", deEstaFase, delCronograma)).toBe("recrear");
  });

  it("vuelve con su estado, su origen y quién lo marcó; sin respaldo, como una tarea nueva", () => {
    const r = datosParaRecrearTarea(
      leerRespaldoDeTarea({
        status: "DONE",
        source: "AGENT",
        statusSource: "AI_CONFIRMED",
        statusChangedAt: "2026-10-01T10:00:00.000Z",
        statusChangedByEmail: "cse@smarteam.cr",
        needsValidation: true,
      }),
      "HUMAN",
    );
    expect(r).toEqual({
      status: "DONE",
      source: "AGENT",
      statusSource: "AI_CONFIRMED",
      statusChangedAt: new Date("2026-10-01T10:00:00.000Z"),
      statusChangedByEmail: "cse@smarteam.cr",
      needsValidation: true,
    });
    expect(datosParaRecrearTarea(undefined, "HUMAN")).toMatchObject({ status: "PENDING", source: "HUMAN", statusChangedAt: null });
    expect(datosParaRecrearTarea(undefined, "MODIFIED").source, "lo que dictó el chat nace MODIFIED").toBe("MODIFIED");
    // Una PENDING no arrastra «quién la marcó».
    expect(datosParaRecrearTarea({ status: "PENDING", statusChangedAt: "2026-10-01", statusChangedByEmail: "x" }, "HUMAN"))
      .toMatchObject({ statusChangedAt: null, statusChangedByEmail: null });
    expect(datosParaRecrearFase({ status: "IN_PROGRESS", source: "AGENT" })).toEqual({ status: "IN_PROGRESS", source: "AGENT" });
    expect(datosParaRecrearFase(undefined)).toEqual({ status: "PENDING", source: "HUMAN" });
  });

  it("⛔ un respaldo raro NO traba el guardado: se ignora", () => {
    /* Lo que este arreglo vino a cerrar es justo un guardado trabado por un body. La edición que la pone en rojo:
       que el validador rechace un respaldo que no entiende. */
    const v = validateTimelinePayload({
      phases: [
        {
          id: "f1",
          name: "Diseño",
          order: 0,
          durationWeeks: 2,
          respaldo: { status: "VOLANDO", source: 42 },
          tasks: [{ id: "t1", title: "Mapear", weekIndex: 0, order: 0, respaldo: { status: "HECHA", statusChangedAt: "no-es-fecha" } }],
        },
      ],
    });
    expect(v.errors ?? []).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.parsed?.phases[0].respaldo).toEqual({ status: undefined, source: undefined });
    expect(v.parsed?.phases[0].tasks?.[0].respaldo?.status).toBeUndefined();
    expect(v.parsed?.phases[0].tasks?.[0].respaldo?.statusChangedAt).toBeUndefined();
    // Y uno bueno se lee.
    const bueno = validateTimelinePayload({
      phases: [{ name: "X", order: 0, durationWeeks: 1, tasks: [{ id: "t1", title: "A", weekIndex: 0, order: 0, respaldo: { status: "DONE", source: "HUMAN" } }] }],
    });
    expect(bueno.parsed?.phases[0].tasks?.[0].respaldo).toMatchObject({ status: "DONE", source: "HUMAN" });
  });

  it("volver a su fase con el id viejo cuenta como movimiento (la copia del destino no queda duplicada)", () => {
    const h = huellasDeLasRecreadas(
      [
        { tasks: [{ id: "t-borrada", title: "Configurar pipeline" }, { id: "t1", title: "Sigue" }, { title: "Nueva" }] },
      ],
      new Set(["t1"]),
    );
    expect(h.has(fingerprintFromTitle("Configurar pipeline"))).toBe(true);
    expect(h.has(fingerprintFromTitle("Sigue")), "una tarea que existe no se está moviendo").toBe(false);
    expect(h.has(fingerprintFromTitle("Nueva")), "lo sin id ya lo cuenta huellasEnMovimiento").toBe(false);
  });

  it("la pantalla adopta los ids recreados POR ID, sin tocar la _key, y sigue las cadenas", () => {
    const fases = [
      { id: "f-vieja", _key: "f-vieja", tasks: [{ id: "t-vieja", _key: "t-vieja" }, { id: "t1", _key: "t1" }, { _key: "new-0" }] },
      { id: "f2", _key: "f2", tasks: [{ id: "t2", _key: "t2" }] },
    ];
    const recreadas = leerIdsRecreados({ fases: { "f-vieja": "f-nueva" }, tareas: { "t-vieja": "t-nueva", raro: 3 } });
    const salida = adoptarIdsRecreados(fases, recreadas);
    expect(salida[0]).toMatchObject({ id: "f-nueva", _key: "f-vieja" });
    expect(salida[0].tasks[0]).toEqual({ id: "t-nueva", _key: "t-vieja" });
    expect(salida[0].tasks[1]).toBe(fases[0].tasks[1]);
    expect(salida[1], "una fase sin nada recreado es la MISMA").toBe(fases[1]);
    expect(adoptarIdsRecreados(fases, null)).toBe(fases);
    expect(adoptarIdsRecreados(fases, { tareas: { otra: "x" } }), "sin nada que cambiar, el mismo arreglo").toBe(fases);
    expect(leerIdsRecreados({ fases: {}, tareas: {} })).toBeNull();
    // Una fila recreada dos veces en la sesión: el deshacer de una foto de antes apunta a la ÚLTIMA.
    const mapa = new Map([["a", "b"], ["b", "c"]]);
    expect(idVigente("a", mapa)).toBe("c");
    expect(idVigente("z", mapa)).toBe("z");
    expect(idsVigentes(mapa)).toEqual({ fases: { a: "c", b: "c" }, tareas: { a: "c", b: "c" } });
    expect(idsVigentes(new Map())).toBeNull();
  });

  it("⛔ un guardado que falla no traba la pantalla: dice qué pasó y cómo salir", () => {
    /* Las ediciones que la ponen en rojo: reintentar un 409 de foto vieja con cada edición (otro 409 cada vez), o
       no ofrecer «Recargar» cuando el servidor rechazó el body. */
    const viejo = trasUnGuardadoFallido(409, { code: CODIGO_CRONOGRAMA_CAMBIO, error: MENSAJE_CRONOGRAMA_CAMBIO });
    expect(viejo).toEqual({ mensaje: MENSAJE_CRONOGRAMA_CAMBIO, bloquear: true, ofrecerRecarga: true });
    expect(MENSAJE_CRONOGRAMA_CAMBIO).toContain("recarga");
    const malo = trasUnGuardadoFallido(400, { error: "Body inválido", details: ["phases[0].tasks[1].weekIndex debe ser entero en [0, durationWeeks)"] });
    expect(malo.bloquear, "un 400 deja seguir editando (una edición puede arreglarlo)").toBe(false);
    expect(malo.ofrecerRecarga).toBe(true);
    expect(malo.mensaje).toContain("weekIndex");
    expect(malo.mensaje).toContain("Puedes seguir editando");
    expect(trasUnGuardadoFallido(null, null)).toMatchObject({ bloquear: false, ofrecerRecarga: false });
    expect(trasUnGuardadoFallido(500, { error: "No se pudo." })).toMatchObject({ bloquear: false, ofrecerRecarga: true });
    // Otro 409 (no el de la foto vieja) no bloquea.
    expect(trasUnGuardadoFallido(409, { code: "PROPUESTA_ABIERTA", error: "x" }).bloquear).toBe(false);
  });
});

describe("T5 · el borrado EXPLÍCITO de la persona", () => {
  const humana = { id: "t1", title: "La escribió el CSE", status: "PENDING", source: "HUMAN" };
  const hecha = { id: "t2", title: "Hecha", status: "DONE", source: "AGENT" };

  it("⛔ lo borrado a mano se borra aunque esté protegido; lo que solo falta, no", () => {
    /* La edición que la pone en rojo: que `idsBorrablesPorOmision` ignore `borradasAMano` (la tarea escrita a mano
       reaparece), o que lo use para todo lo omitido (vuelve el borrado silencioso de lo protegido). */
    expect(idsBorrablesPorOmision([humana, hecha], new Set(), new Set(), new Set(["t1", "t2"]))).toEqual(["t1", "t2"]);
    expect(idsBorrablesPorOmision([humana, hecha], new Set(), new Set()), "lo protegido que solo falta se queda").toEqual([]);
    expect(idsBorrablesPorOmision([humana], new Set(["t1"]), new Set(), new Set(["t1"])), "si viene en el body, no se borra").toEqual([]);
  });

  it("solo el autoguardado y con permiso de borrar; viaja solo lo que la foto ya no tiene", () => {
    expect(honrarBorradas("MANUAL", true)).toBe(true);
    expect(honrarBorradas("MANUAL", false)).toBe(false);
    expect(honrarBorradas("AI_ASSIST", true), "el chat no usa el borrado explícito").toBe(false);
    expect(borradasAMano(new Set(["t1", "t2"]), [{ tasks: [{ id: "t2" }, {}] }]), "la que se deshizo está en la foto").toEqual(["t1"]);
    expect(leerBorradas({ borradas: ["a", "a", "", 3, "b"] })).toEqual(["a", "b"]);
    expect(leerBorradas({ borradas: "a" })).toEqual([]);
    expect(leerBorradas(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2 · LA CONDUCTA DEL PUT /timeline (la ruta real, con la base falsa)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const faseDB = (id: string, tasks: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  name: `Fase ${id}`,
  order: 0,
  durationWeeks: 3,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  source: "AGENT",
  tasks,
  ...extra,
});
const tareaDB = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  weekIndex: 0,
  order: 0,
  notes: null,
  source: "AGENT",
  status: "PENDING",
  party: null,
  type: null,
  startDateOverride: null,
  dueDateOverride: null,
  ...extra,
});
/** La fase del body como la manda la pantalla (sin `tasks` = no tocar; con, el diff completo). */
const faseBody = (id: string | undefined, tasks: unknown[], extra: Record<string, unknown> = {}) => ({
  ...(id ? { id } : {}),
  name: `Fase ${id ?? "nueva"}`,
  order: 0,
  durationWeeks: 3,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tasks,
  ...extra,
});
const pedir = (body: unknown) =>
  new Request("http://test.local/api", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
const delProyecto = { params: Promise.resolve({ projectId: "p1" }) };

/** Lo que hay en la base: el cronograma y sus fases. `loadTimeline` (la recarga final) lee `null`. */
function enLaBase(fases: ReturnType<typeof faseDB>[], tl: { anchorStartDate?: Date | null; closeDateOverride?: Date | null } = {}) {
  const prev = { anchorStartDate: tl.anchorStartDate ?? null, closeDateOverride: tl.closeDateOverride ?? null };
  db.projectTimeline.findUnique.mockResolvedValueOnce(prev).mockResolvedValue(null);
  db.projectTimeline.upsert.mockResolvedValue({ id: "tl1" });
  db.timelinePhase.findMany.mockResolvedValue(fases);
  return versionDelCronograma({ ...prev, phases: fases as unknown as FaseVersionada[] });
}

beforeEach(() => {
  vi.resetAllMocks();
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: "cse@smarteam.cr" }, clientId: "c1" });
  guards.guardTimelineDelete.mockResolvedValue({ user: { email: "cse@smarteam.cr" }, clientId: "c1" });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.project.findUnique.mockResolvedValue({ clientId: "c1" });
  db.projectTimeline.findFirst.mockResolvedValue(null);
  let n = 0;
  db.timelineTask.create.mockImplementation(async () => ({ id: `t-nueva-${++n}` }));
  db.timelinePhase.create.mockImplementation(async () => ({ id: `f-nueva-${++n}` }));
});

describe("⛔ T1 · PUT: deshacer un borrado DESPUÉS del autoguardado ya no traba el guardado", () => {
  it("la tarea con un id que ya no existe se RECREA con su estado y su origen, y la respuesta dice su id nuevo", async () => {
    /* El caso de la auditoría: borrar «Configurar pipeline» (el autoguardado la borra), Ctrl+Z, y el guardado manda
       su id viejo. Antes: 400 «Task … no pertenece a la fase», y cada edición siguiente volvía a fallar. La edición
       que la pone en rojo: volver a tirar el 400 con un id que no es de la fase. */
    const version = enLaBase([faseDB("f1", [tareaDB("t1", "Mapear")])]);
    const res = await PUT(
      pedir({
        skipAudit: true,
        version,
        phases: [
          faseBody("f1", [
            { id: "t1", title: "Mapear", weekIndex: 0, order: 0 },
            {
              id: "t-borrada",
              title: "Configurar pipeline",
              weekIndex: 1,
              order: 0,
              party: "SMARTEAM",
              type: "TASK",
              dueDateOverride: "2026-10-20T00:00:00.000Z",
              respaldo: { status: "DONE", source: "HUMAN", statusSource: "HUMAN", statusChangedAt: "2026-10-01T10:00:00.000Z", statusChangedByEmail: "cse@smarteam.cr" },
            },
          ]),
        ],
      }),
      delProyecto,
    );
    const d = await res.json();
    expect(res.status, JSON.stringify(d)).toBe(200);
    expect(db.timelineTask.create).toHaveBeenCalledTimes(1);
    expect(db.timelineTask.create.mock.calls[0][0].data).toMatchObject({
      phaseId: "f1",
      title: "Configurar pipeline",
      weekIndex: 1,
      party: "SMARTEAM",
      type: "TASK",
      dueDateOverride: new Date("2026-10-20T00:00:00.000Z"),
      status: "DONE",
      source: "HUMAN",
      statusChangedByEmail: "cse@smarteam.cr",
    });
    expect(d.recreadas, "la pantalla no se entera del id nuevo y lo recrearía en cada guardado").toEqual({
      fases: {},
      tareas: { "t-borrada": "t-nueva-1" },
    });
    expect(db.timelineTask.createMany, "la recreada no va al createMany de las nuevas (sin id no se sabría cuál es)").not.toHaveBeenCalled();
  });

  it("una FASE borrada y deshecha vuelve con sus tareas, su estado y su origen", async () => {
    const version = enLaBase([faseDB("f1", [])]);
    const res = await PUT(
      pedir({
        skipAudit: true,
        version,
        phases: [
          faseBody("f1", []),
          faseBody("f-borrada", [{ id: "t-x", title: "Capacitar", weekIndex: 0, order: 0, respaldo: { status: "IN_PROGRESS", source: "AGENT" } }], {
            order: 1,
            respaldo: { status: "IN_PROGRESS", source: "AGENT" },
          }),
        ],
      }),
      delProyecto,
    );
    const d = await res.json();
    expect(res.status, JSON.stringify(d)).toBe(200);
    expect(db.timelinePhase.create.mock.calls[0][0].data).toMatchObject({ name: "Fase f-borrada", source: "AGENT", status: "IN_PROGRESS" });
    expect(db.timelineTask.create.mock.calls[0][0].data).toMatchObject({ phaseId: "f-nueva-1", title: "Capacitar", status: "IN_PROGRESS", source: "AGENT" });
    expect(d.recreadas).toEqual({ fases: { "f-borrada": "f-nueva-1" }, tareas: { "t-x": "t-nueva-2" } });
  });

  it("deshacer «Tarea movida» después del autoguardado: vuelve a su fase y la copia del destino se borra (no queda duplicada)", async () => {
    /* Mover de fase suelta el id: el autoguardado borró t1 en «Diseño» y creó la copia t2 (HUMAN, protegida) en
       «Cierre». La foto vieja trae t1 en «Diseño» y no trae t2. La edición que la pone en rojo: no contar la
       recreada como movimiento (t2 quedaría además de la recreada). */
    const version = enLaBase([
      faseDB("f1", []),
      faseDB("f2", [tareaDB("t2", "Configurar pipeline", { source: "HUMAN" })], { order: 1 }),
    ]);
    const res = await PUT(
      pedir({
        skipAudit: true,
        version,
        phases: [
          faseBody("f1", [{ id: "t1", title: "Configurar pipeline", weekIndex: 0, order: 0, respaldo: { status: "DONE", source: "AGENT" } }]),
          faseBody("f2", [], { order: 1 }),
        ],
      }),
      delProyecto,
    );
    expect(res.status).toBe(200);
    expect(db.timelineTask.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["t2"] } } });
    expect(db.timelineTask.create.mock.calls[0][0].data).toMatchObject({ phaseId: "f1", status: "DONE", source: "AGENT" });
  });

  it("un id que existe en OTRA fase sigue siendo un 400, con un texto que se entiende", async () => {
    const version = enLaBase([faseDB("f1", []), faseDB("f2", [tareaDB("t2", "Pipeline")], { order: 1 })]);
    const res = await PUT(
      pedir({ skipAudit: true, version, phases: [faseBody("f1", [{ id: "t2", title: "Pipeline", weekIndex: 0, order: 0 }]), faseBody("f2", [], { order: 1 })] }),
      delProyecto,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("está en otra fase");
    expect(db.timelineTask.create).not.toHaveBeenCalled();
  });
});

describe("⛔ T2 · PUT: una foto VIEJA no pisa lo que escribió el servidor", () => {
  it("con otra versión responde 409 CRONOGRAMA_CAMBIO y no borra ni crea nada", async () => {
    /* El caso de la auditoría: el chat creó «Integraciones»; Ctrl+Z restaura la foto de antes y el autoguardado la
       manda entera: la fase del chat se borraba en cascada. La edición que la pone en rojo: sacar la comparación
       de la versión (o hacerla después de borrar). */
    enLaBase([faseDB("f1", [tareaDB("t1", "Mapear")]), faseDB("f-del-chat", [tareaDB("t9", "Integrar ERP")], { order: 1 })]);
    const versionDeLaFotoVieja = versionDelCronograma({ anchorStartDate: null, closeDateOverride: null, phases: [faseDB("f1", [tareaDB("t1", "Mapear")])] as unknown as FaseVersionada[] });
    const res = await PUT(
      pedir({ skipAudit: true, version: versionDeLaFotoVieja, phases: [faseBody("f1", [{ id: "t1", title: "Mapear", weekIndex: 0, order: 0 }])] }),
      delProyecto,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MENSAJE_CRONOGRAMA_CAMBIO, code: CODIGO_CRONOGRAMA_CAMBIO });
    expect(db.timelinePhase.deleteMany, "borró la fase que la foto vieja no tenía").not.toHaveBeenCalled();
    expect(db.timelineTask.deleteMany).not.toHaveBeenCalled();
    expect(db.timelineTask.create).not.toHaveBeenCalled();
    expect(db.timelinePhase.update).not.toHaveBeenCalled();
  });

  it("con la misma versión guarda; sin versión (otros llamadores) no compara, como hasta hoy", async () => {
    const fases = [faseDB("f1", [tareaDB("t1", "Mapear")]), faseDB("f2", [], { order: 1 })];
    const version = enLaBase(fases);
    const conVersion = await PUT(pedir({ skipAudit: true, version, phases: [faseBody("f1", [{ id: "t1", title: "Mapear", weekIndex: 0, order: 0 }])] }), delProyecto);
    expect(conVersion.status).toBe(200);
    expect(db.timelinePhase.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["f2"] } } });

    vi.clearAllMocks();
    enLaBase(fases);
    const sinVersion = await PUT(pedir({ skipAudit: true, phases: [faseBody("f1", [{ id: "t1", title: "Mapear", weekIndex: 0, order: 0 }])] }), delProyecto);
    expect(sinVersion.status).toBe(200);
  });
});

describe("⛔ T5 · PUT: una tarea escrita a mano se puede borrar (y una regeneración no)", () => {
  const fases = () => [faseDB("f1", [tareaDB("t1", "La escribió el CSE", { source: "HUMAN" }), tareaDB("t2", "Hecha", { status: "DONE" })])];

  it("borrada a mano por quien puede borrar: se borra aunque esté protegida", async () => {
    /* Antes reaparecía: nacía HUMAN y `isKept` la reponía. La edición que la pone en rojo: no pasar las borradas
       a `idsBorrablesPorOmision`. */
    const version = enLaBase(fases());
    const res = await PUT(
      pedir({ skipAudit: true, version, borradas: ["t1"], phases: [faseBody("f1", [{ id: "t2", title: "Hecha", weekIndex: 0, order: 0 }])] }),
      delProyecto,
    );
    expect(res.status).toBe(200);
    expect(db.timelineTask.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["t1"] } } });
  });

  it("sin el permiso de borrar, o sin decirlo, lo protegido se queda", async () => {
    guards.guardTimelineDelete.mockResolvedValue(NextResponse.json({ error: "no" }, { status: 403 }));
    let version = enLaBase(fases());
    await PUT(pedir({ skipAudit: true, version, borradas: ["t1"], phases: [faseBody("f1", [])] }), delProyecto);
    expect(db.timelineTask.deleteMany, "borró sin el permiso de borrar").not.toHaveBeenCalled();

    vi.clearAllMocks();
    version = enLaBase(fases());
    await PUT(pedir({ skipAudit: true, version, phases: [faseBody("f1", [])] }), delProyecto);
    expect(db.timelineTask.deleteMany, "borró lo protegido que solo faltaba en el body").not.toHaveBeenCalled();
  });

  it("⛔ el chat (AI_ASSIST) no puede usar el borrado explícito", async () => {
    /* La edición que la pone en rojo: leer `borradas` en cualquier PUT. El chat decide qué puede borrar con sus
       operaciones (`isKept`), y una regeneración no pasa por acá. */
    enLaBase(fases());
    const res = await PUT(
      pedir({ reason: "Lo acordado", kind: "AI_ASSIST", borradas: ["t1", "t2"], phases: [faseBody("f1", [])] }),
      delProyecto,
    );
    expect(res.status).toBe(200);
    expect(db.timelineTask.deleteMany).not.toHaveBeenCalled();
    expect(guards.guardTimelineDelete).not.toHaveBeenCalled();
  });
});

describe("el PUT y el GET calculan la versión con lo mismo", () => {
  it("el GET la manda con las fases que lee; el PUT la compara con las que lee, antes de borrar nada", () => {
    /* La edición que la pone en rojo: calcular la versión del GET con otra cosa (la pantalla mandaría una que el
       PUT nunca reconoce: 409 en cada guardado), o comparar después de borrar. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/route.ts"));
    const carga = tramo(ruta, "async function loadTimeline(", "export async function GET(");
    expect(contiene(carga, "version: versionDelCronograma({ anchorStartDate: tl.anchorStartDate, closeDateOverride: tl.closeDateOverride, phases: tl.phases, }),")).toBe(true);
    const put = tramo(ruta, "export async function PUT(", "const updated = await loadTimeline(projectId);");
    const iCompara = put.indexOf("if (fotoVieja(versionBase, versionActual))");
    expect(iCompara, "el PUT ya no compara la versión").toBeGreaterThan(-1);
    expect(iCompara).toBeGreaterThan(put.indexOf("const existingPhases = await tx.timelinePhase.findMany("));
    expect(iCompara, "compara después de borrar fases").toBeLessThan(put.indexOf("await tx.timelinePhase.deleteMany("));
    expect(contiene(put, "phases: existingPhases,")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3 · EL CABLEADO DE LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("CronogramaCanvas · el deshacer y el autoguardado", () => {
  const CANVAS = soloCodigo(leer("components/canvas/CronogramaCanvas.tsx"));

  it("⛔ T3 · la foto del deshacer incluye el cierre fijado a mano", () => {
    /* Deshacer «Cierre fijado a mano» no lo soltaba: la foto guardaba fases y arranque, no el cierre. La edición
       que la pone en rojo: sacar el cierre de la foto o de la restauración. */
    const foto = tramo(CANVAS, "const pushTimelineUndo = (", "const lastFailedSeqRef");
    expect(foto.length).toBeGreaterThan(300);
    expect(contiene(foto, "const snapCloseOverride = closeOverride;")).toBe(true);
    const deshacer = tramo(foto, "undo: () => {", "markDirty();");
    expect(contiene(deshacer, "setCloseOverride(snapCloseOverride);"), "el deshacer no restaura el cierre").toBe(true);
    expect(contiene(deshacer, "setAnchor(snapAnchor);")).toBe(true);
    expect(contiene(deshacer, "adoptarIdsRecreados(snapPhases, idsVigentes(idsRecreadosRef.current))"), "la foto vieja no se traduce a los ids de ahora").toBe(true);
  });

  it("⛔ T2 · toda recarga que viene de una escritura del servidor vacía la pila de deshacer", () => {
    /* La edición que la pone en rojo: volver a `await load()` en cualquiera de estos caminos (la foto de antes
       queda en la pila y su Ctrl+Z borra lo que escribió el servidor). */
    const ayudante = tramo(CANVAS, "const recargarTrasEscribir = async (", "};");
    expect(contiene(ayudante, "await load(); vaciarElDeshacer(opts?.avisar ?? true);")).toBe(true);
    const vaciar = tramo(CANVAS, "const vaciarElDeshacer = (", "};");
    expect(contiene(vaciar, "clearScope(undoScope);")).toBe(true);
    expect(contiene(vaciar, "toast.info(AVISO_DESHACER_VACIADO)")).toBe(true);
    const caminos: Array<[string, string, string, string]> = [
      ["el chat (lo acordado)", "const aplicarOperacionesAcordadas = async (", "const discardProposal = async (", "await recargarTrasEscribir({ avisar: false });"],
      ["aplicar el avance", "const applyProgress = async () => {", "const discardProgress", "await recargarTrasEscribir();"],
      ["aplicar las particularidades", "const applyParticularidades = async () => {", "const discardParticularidades", "await recargarTrasEscribir();"],
      ["convertir un hecho en tarea", "const convertParticularidad = async (", "const undoConvert = async (", "await recargarTrasEscribir();"],
      ["deshacer la conversión", "const undoConvert = async (", "const toggleSet", "await recargarTrasEscribir();"],
    ];
    for (const [nombre, desde, hasta, llamada] of caminos) {
      const t = tramo(CANVAS, desde, hasta);
      expect(t.length, `${nombre}: la guarda no está mirando nada`).toBeGreaterThan(200);
      expect(contiene(t, llamada), `${nombre}: recarga sin vaciar el deshacer`).toBe(true);
      expect(t, `${nombre}: volvió el \`await load()\` suelto`).not.toContain("await load();");
    }
    // Aplicar la propuesta ya la vaciaba antes de mandar; además se lleva lo registrado mientras tanto.
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    const iLoad = aplicar.indexOf("await load();");
    expect(iLoad).toBeGreaterThan(-1);
    expect(aplicar.indexOf("vaciarElDeshacer(!desdeElChat);"), "aplicar la propuesta no vacía lo registrado mientras tanto").toBeGreaterThan(iLoad);
    // El handoff que escribe las fases de un cronograma vacío.
    expect(contiene(CANVAS, 'if (decision === "recargar-todo") void recargarTrasEscribir();')).toBe(true);
  });

  it("⛔ T2 · una foto del deshacer de ANTES de una escritura del servidor no se restaura", () => {
    /* Aunque una recarga se olvide de vaciar la pila, la foto lleva la versión en que se tomó: si no es una de las que
       esta pantalla recorrió desde la última recarga (la del GET y las de sus propios guardados), el deshacer no la
       pone. Las ediciones que la ponen en rojo: sacar la comprobación, no reiniciar el linaje al recargar (una foto de
       antes del chat pasaría), o no sumar las versiones propias (deshacer después del autoguardado dejaría de andar). */
    const foto = tramo(CANVAS, "const pushTimelineUndo = (", "const lastFailedSeqRef");
    expect(contiene(foto, "const snapVersion = versionRef.current;")).toBe(true);
    const deshacer = tramo(foto, "undo: () => {", "markDirty();");
    const iLinaje = sinEspacios(deshacer).indexOf(sinEspacios("if (!linajeRef.current.has(snapVersion)) return Promise.resolve(false);"));
    expect(iLinaje, "el deshacer restaura una foto de otra versión").toBeGreaterThan(-1);
    expect(iLinaje, "comprueba después de restaurar").toBeLessThan(sinEspacios(deshacer).indexOf("setPhases("));
    const carga = tramo(CANVAS, "const load = useCallback(", "}, [projectId]);");
    expect(contiene(carga, "linajeRef.current = new Set([versionRef.current]);"), "recargar no reinicia el linaje").toBe(true);
    const guardar = tramo(CANVAS, "const guardarAhora = async () => {", "const hayBorrador = !!proposal && esBorradorV1(proposal);");
    expect(contiene(guardar, "linajeRef.current.add(versionRef.current);"), "los guardados propios no suman al linaje").toBe(true);
  });

  it("⛔ T2 · el autoguardado manda la versión de su foto y adopta la nueva; el GET la fija", () => {
    const guardar = tramo(CANVAS, "const guardarAhora = async () => {", "const hayBorrador = !!proposal && esBorradorV1(proposal);");
    expect(guardar.length).toBeGreaterThan(1000);
    expect(contiene(guardar, "...(versionRef.current ? { version: versionRef.current } : {}),"), "el autoguardado no manda la versión").toBe(true);
    expect(contiene(guardar, 'versionRef.current = typeof data.version === "string" ? data.version : null;')).toBe(true);
    const carga = tramo(CANVAS, "const load = useCallback(", "}, [projectId]);");
    expect(contiene(carga, 'versionRef.current = data.exists && typeof data.version === "string" ? data.version : null;')).toBe(true);
    expect(contiene(carga, "guardadoBloqueadoRef.current = false;"), "recargar no destraba el autoguardado").toBe(true);
  });

  it("⛔ T1 · un guardado que falla no deja el cronograma trabado, y lo recreado se adopta por id", () => {
    /* Las ediciones que la ponen en rojo: volver al `setError(d?.details?.[0] ?? …)` mudo (sin «Recargar»), seguir
       reintentando un 409 de foto vieja, o no adoptar los ids recreados (cada guardado recrearía la fila). */
    const guardar = tramo(CANVAS, "const guardarAhora = async () => {", "const hayBorrador = !!proposal && esBorradorV1(proposal);");
    expect(contiene(guardar, "const tras = trasUnGuardadoFallido(res.status, d);")).toBe(true);
    expect(contiene(guardar, "setOfrecerRecarga(tras.ofrecerRecarga);")).toBe(true);
    expect(contiene(guardar, "if (tras.bloquear) guardadoBloqueadoRef.current = true;")).toBe(true);
    expect(guardar).not.toContain("d?.details?.[0] ?? d?.error ??");
    expect(contiene(guardar, "const recreadas = leerIdsRecreados(data.recreadas);")).toBe(true);
    expect(contiene(guardar, "mergeServerIds(adoptarIdsRecreados(cur, recreadas), data.phases ?? [])"), "una rama del merge no adopta lo recreado").toBe(true);
    expect(sinEspacios(guardar).split(sinEspacios("adoptarIdsRecreados(cur, recreadas)")).length - 1, "las DOS ramas del merge").toBe(2);
    const efecto = tramo(CANVAS, "if (!dirty || saving || !canEdit) return;", "const t = setTimeout(");
    expect(contiene(efecto, "if (guardadoBloqueadoRef.current) return;"), "el autoguardado reintenta un 409 de foto vieja").toBe(true);
    const esperar = tramo(CANVAS, "const esperarQueSeGuarde = async ()", "const setAnchorFromGantt");
    expect(contiene(esperar, "if (guardadoBloqueadoRef.current) return MENSAJE_CRONOGRAMA_CAMBIO;")).toBe(true);
    const franja = tramo(CANVAS, "{error && (", "Cerrar</button>");
    expect(contiene(franja, "{ofrecerRecarga && ("), "la franja de error no ofrece salir").toBe(true);
    expect(contiene(franja, "onClick={() => void recargarTrasEscribir({ avisar: false })}")).toBe(true);
    // El deshacer de un estado encuentra la fila aunque se haya recreado.
    expect(contiene(CANVAS, "undo: () => { void toggleStatus(idVigente(taskId, idsRecreadosRef.current), prevStatus, true); },")).toBe(true);
  });

  it("⛔ T1 · la pantalla manda el respaldo de cada fila con id (estado y origen) para poder recrearla", () => {
    const cuerpo = tramo(CANVAS, "const buildPutBody = (", "const validateLocal = ");
    expect(contiene(cuerpo, "respaldo: { status: t.status, source: t.source, statusSource: t.statusSource,")).toBe(true);
    expect(contiene(cuerpo, "...(p.id ? { respaldo: { status: p.status, source: p.source } } : {}),")).toBe(true);
  });

  it("⛔ T5 · «Eliminar tarea» registra el borrado explícito y el autoguardado lo manda", () => {
    /* La edición que la pone en rojo: no registrar el id al borrar (la tarea escrita a mano reaparece). */
    const borrar = tramo(CANVAS, "const removeTask = (", "const updatePhase = (");
    expect(contiene(borrar, "if (borrada?.id) borradasRef.current.add(borrada.id);")).toBe(true);
    const guardar = tramo(CANVAS, "const guardarAhora = async () => {", "const hayBorrador = !!proposal && esBorradorV1(proposal);");
    expect(contiene(guardar, "const borradas = borradasAMano(borradasRef.current, phases);")).toBe(true);
    expect(contiene(guardar, "...(borradas.length > 0 ? { borradas } : {}),")).toBe(true);
  });
});

describe("T6 · TaskDetailDrawer en tuteo, y sin prometer lo que ya no es cierto", () => {
  it("sin voseo, y borrar ya no dice que no se puede deshacer", () => {
    /* La edición que la pone en rojo: volver a «suspendela», «Guardá», «elegí», «Fijá», «vos», o al «no se puede
       deshacer» (desde T1 deshacer un borrado recrea la tarea). */
    const cajon = soloCodigo(leer("components/canvas/TaskDetailDrawer.tsx"));
    for (const voseo of ["suspendela", "Guardá", "elegí", "Fijá", "por vos", "Por vos"]) {
      expect(cajon, `voseo: «${voseo}»`).not.toContain(voseo);
    }
    expect(cajon).toContain("suspéndela");
    expect(cajon).not.toContain("no se puede deshacer");
    expect(cajon).toContain("puedes deshacerlo");
  });
});
