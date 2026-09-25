/**
 * lib/timeline/borrador-operaciones-rutas.test.ts — POST /timeline/borrador/operaciones (E3 P2): la ruta
 * que edita la propuesta abierta (las casillas, el chat y la apertura del chat).
 *
 * Correr: `npx vitest run lib/timeline/borrador-operaciones-rutas.test.ts --project unit`.
 *
 * La ruta real corre contra la base y los guards FALSOS de borrador-rutas.test.ts (hoisted), y se
 * cuentan las escrituras: un escaneo no ve que un 409 o un 422 salgan antes de escribir; la llamada, sí.
 * Lo que cuida (§3.4 de la especificación de E3):
 *   1. el cuerpo: 400 si no tiene forma (aplicar y descartar la propuesta entera no van por acá);
 *   2. los 409 y el 422 no escriben; las casillas pasan mientras la IA arma y el chat no;
 *   3. cada escritura condicionada a la versión leída, y el reintento si no entra;
 *   4. la apertura no sube la versión ni escribe `excluidos`, y la persona sale del guard;
 *   5. las casillas: una clave desconocida se ignora, y la limpieza poda solo `t:` y `n:`.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ── La base y los guards FALSOS (hoisted), como en borrador-rutas.test.ts ─────────────────────────
const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  timelinePhase: { findFirst: vi.fn(), findMany: vi.fn() },
  timelineTask: { findMany: vi.fn() },
  agentRun: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
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

import { POST } from "@/app/api/projects/[projectId]/timeline/borrador/operaciones/route";
import {
  abiertoPara,
  aplicarCasillas,
  BLOQUEO_VERSION_NUEVA,
  excluidosDelGuardado,
  FORMATO_BORRADOR,
  huellaDePersona,
  leerAbiertoPara,
  normalizarExcluidos,
  superponerCasillas,
  type Borrador,
} from "@/lib/timeline/borrador";
import { MENSAJE_TAREAS_EN_CURSO } from "@/lib/timeline/borrador-del-detalle";
import { MENSAJE_PROPUESTA_CAMBIO } from "@/lib/timeline/escribir-estructura";

const DUR = {
  tipo: "fase-cambia",
  clave: "fase:f1:durationWeeks",
  faseId: "f1",
  fase: "Diseño",
  campo: "durationWeeks",
  desde: 2,
  a: 3,
};
const NUEVA = {
  tipo: "tarea-nueva",
  clave: "t:1",
  fase: "f1",
  tarea: { title: "Mapear procesos", weekIndex: 0, notes: null, party: null, type: null, needsValidation: false, motivoPorValidar: null, fuga: null },
};
const v1 = (extra: Record<string, unknown> = {}) => ({
  formato: FORMATO_BORRADOR,
  version: 5,
  origen: "contexto",
  observaciones: [],
  cambios: [DUR, NUEVA],
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: true },
  tareasArmadasPara: { f1: { nombre: "Diseño", semanas: 3 } },
  ...extra,
});
const faseDB = {
  id: "f1",
  name: "Diseño",
  order: 0,
  durationWeeks: 2,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  status: "PENDING",
  tasks: [
    {
      id: "t-viva",
      title: "Definir pipeline",
      weekIndex: 1,
      order: 0,
      notes: null,
      party: null,
      type: null,
      status: "PENDING",
      source: "AGENT",
      startDateOverride: null,
      dueDateOverride: null,
      needsValidation: false,
    },
  ],
};
const fila = (guardado: unknown, extra: Record<string, unknown> = {}) => ({
  id: "tl",
  anchorStartDate: null,
  pendingProposal: guardado,
  pendingProposalRunId: "run-1",
  phases: [faseDB],
  ...extra,
});
const enLaBase = (guardado: unknown, extra: Record<string, unknown> = {}) =>
  db.projectTimeline.findUnique.mockResolvedValue(fila(guardado, extra));

const pedir = (body: unknown) =>
  POST({ json: async () => body } as unknown as NextRequest, { params: Promise.resolve({ projectId: "p1" }) });
const casillas = (operaciones: unknown[], extra: Record<string, unknown> = {}) =>
  pedir({ token: "run-1", version: 5, origen: "casillas", operaciones, ...extra });
const chat = (operaciones: unknown[]) => pedir({ token: "run-1", version: 5, origen: "chat", operaciones });
const apertura = () => pedir({ token: "run-1", version: 5, origen: "apertura", operaciones: [{ op: "chat-abierto" }] });
const escrito = (k = 0) => db.projectTimeline.updateMany.mock.calls[k][0];

const EMAIL = "  CSE@Smarteam.cr ";

beforeEach(() => {
  vi.resetAllMocks();
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: EMAIL } });
  guards.guardIaDelCronograma.mockResolvedValue(null);
  db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
});

describe("1 · el cuerpo", () => {
  it("⛔ 400 sin forma válida, y aplicar o descartar la propuesta entera no van por acá", async () => {
    /* La edición que la pone en rojo: aceptar `propuesta.aplicar` o `propuesta.descartar-entera` por esta
       ruta (aplicar sin la huella acordada, o descartar sin su ruta), o un lote sin techo. */
    enLaBase(v1());
    const malos: unknown[] = [
      null,
      { version: 5, origen: "casillas", operaciones: [{ op: "excluir", claves: ["t:1"] }] },
      { token: "run-1", origen: "casillas", operaciones: [{ op: "excluir", claves: ["t:1"] }] },
      { token: "run-1", version: 5, origen: "otro", operaciones: [{ op: "excluir", claves: ["t:1"] }] },
      { token: "run-1", version: 5, origen: "casillas", operaciones: [] },
      { token: "run-1", version: 5, origen: "casillas", operaciones: [{ op: "excluir", claves: [] }] },
      { token: "run-1", version: 5, origen: "casillas", operaciones: Array.from({ length: 51 }, () => ({ op: "excluir", claves: ["t:1"] })) },
      { token: "run-1", version: 5, origen: "chat", operaciones: [{ op: "propuesta.aplicar", version: 5, huella: "h" }] },
      { token: "run-1", version: 5, origen: "chat", operaciones: [{ op: "propuesta.descartar-entera" }] },
      { token: "run-1", version: 5, origen: "chat", operaciones: [{ op: "fase.inventada" }] },
      { token: "run-1", version: 5, origen: "chat", operaciones: [{ op: "propuesta.recuperar", cambios: ["3"] }] },
      { token: "run-1", version: 5, origen: "apertura", operaciones: [{ op: "excluir", claves: ["t:1"] }] },
    ];
    for (const body of malos) {
      const res = await pedir(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
    const invalido = await POST({ json: async () => { throw new Error("x"); } } as unknown as NextRequest, { params: Promise.resolve({ projectId: "p1" }) });
    expect(invalido.status).toBe(400);
  });
});

describe("2 · los 409 y el 422, sin escribir", () => {
  it("⛔ PROPUESTA_CAMBIO (otra propuesta, ninguna o el formato viejo) y NO_SE_PUEDE (una versión más nueva)", async () => {
    /* La edición que la pone en rojo: escribir sobre la propuesta de otra corrida, o sobre una que esta
       versión de Nexus no entiende entera. */
    for (const [guardado, extra] of [
      [v1(), { pendingProposalRunId: "run-otra" }],
      [null, {}],
      [{ anchorStartDate: null, phases: [{ id: "f1", name: "Diseño", durationWeeks: 3 }] }, {}],
    ] as const) {
      enLaBase(guardado, extra);
      const res = await casillas([{ op: "excluir", claves: ["t:1"] }]);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO });
    }
    enLaBase(v1({ cambios: [DUR, { tipo: "tarea-se-muda", clave: "x" }] }));
    const nueva = await chat([{ op: "fase.duracion", phaseId: "f1", semanas: 4 }]);
    expect(nueva.status).toBe(409);
    expect(await nueva.json()).toEqual({ error: "NO_SE_PUEDE", message: BLOQUEO_VERSION_NUEVA });
    expect(db.projectTimeline.updateMany, "escribió con un 409").not.toHaveBeenCalled();
    db.projectTimeline.findUnique.mockResolvedValue(null);
    expect((await casillas([{ op: "excluir", claves: ["t:1"] }])).status).toBe(404);
  });

  it("⛔ mientras la IA arma o recalcula, el chat recibe TAREAS_EN_CURSO; las casillas pasan", async () => {
    /* La edición que la pone en rojo: dejar editar al chat mientras la IA arma (lo que escribiera quedaría
       debajo de una propuesta que está por cambiar) o frenar también las casillas (E2c D8). */
    db.agentRun.findUnique.mockResolvedValue({ status: "RUNNING", updatedAt: new Date(), currentPhase: null, output: null });
    for (const guardado of [
      v1({ tareas: { corrida: "run-2", listas: false } }),
      v1({ recalculo: { corrida: "run-r", fases: [{ id: "f1", nombre: "Diseño" }], sin: [] } }),
    ]) {
      enLaBase(guardado);
      const res = await chat([{ op: "fase.duracion", phaseId: "f1", semanas: 4 }]);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO });
    }
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();

    enLaBase(v1({ tareas: { corrida: "run-2", listas: false } }));
    const res = await casillas([{ op: "excluir", claves: ["t:1"] }]);
    expect(res.status, "las casillas se frenaron mientras la IA arma").toBe(200);
    expect(escrito().data.pendingProposal.excluidos).toEqual(["t:1"]);
  });

  it("⛔ 422 con cada motivo, sin escribir, si el chat pide algo que no se puede", async () => {
    enLaBase(v1());
    const res = await chat([
      { op: "fase.duracion", phaseId: "f1", semanas: 4 },
      { op: "fase.renombrar", phaseId: "no-esta", nombre: "Otra" },
    ]);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "OPERACION_RECHAZADA", rechazadas: [{ indice: 1, motivo: "esa fase no está en la propuesta" }] });
    expect(db.projectTimeline.updateMany, "escribió la mitad que pasaba").not.toHaveBeenCalled();
  });
});

describe("3 · las escrituras", () => {
  it("⭐ el chat: condicionado a token + la versión leída, con la versión + 1, y la propuesta en la respuesta", async () => {
    /* La edición que la pone en rojo: escribir sin la condición (pisaría lo que escribió otra pestaña),
       no subir la versión, o rearmar el JSON sin lo guardado. */
    enLaBase(v1({ chatAbiertoPara: ["h-otra"] }));
    const res = await chat([{ op: "fase.duracion", phaseId: "f1", semanas: 4 }]);
    expect(res.status).toBe(200);
    const { where, data } = escrito();
    expect(where).toEqual({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: { path: ["version"], equals: 5 } });
    const b = data.pendingProposal;
    expect(b.version).toBe(6);
    expect(b.cambios[0]).toMatchObject({ clave: DUR.clave, desde: 2, a: 4, porChat: true });
    expect(b.chatAbiertoPara, "rearmó el JSON sin lo guardado").toEqual(["h-otra"]);
    expect("excluidos" in b, "creó `excluidos` sin que nadie desmarcara nada").toBe(false);
    expect(b.ajustadasPorElChat).toEqual({ f1: { nombre: "Diseño", semanas: 4, sesiones: null } });
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({ token: "run-1", version: 6, excluidos: null });
    expect(cuerpo.propuesta.version).toBe(6);
  });

  it("⛔ si la escritura no entra, vuelve a leer y a calcular sobre lo nuevo; a las 3 vueltas, PROPUESTA_CAMBIO", async () => {
    /* La edición que la pone en rojo: escribir lo calculado sobre la versión vieja (pisaría la casilla de
       otra computadora) o reintentar sin fin. */
    db.projectTimeline.findUnique
      .mockResolvedValueOnce(fila(v1()))
      .mockResolvedValueOnce(fila(v1({ version: 6, excluidos: ["fase:f1:durationWeeks"] })));
    db.projectTimeline.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const res = await casillas([{ op: "excluir", claves: ["t:1"] }]);
    expect(res.status).toBe(200);
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(2);
    expect(escrito(1).where.pendingProposal).toEqual({ path: ["version"], equals: 6 });
    expect(escrito(1).data.pendingProposal).toMatchObject({ version: 7, excluidos: ["fase:f1:durationWeeks", "t:1"] });
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({ version: 7, excluidos: ["fase:f1:durationWeeks", "t:1"] });
    expect(cuerpo.propuesta, "la pantalla vio la 5 y se escribió sobre la 6: tiene que recibir la nueva").toBeDefined();

    db.projectTimeline.updateMany.mockReset();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    enLaBase(v1());
    const nunca = await casillas([{ op: "excluir", claves: ["t:1"] }]);
    expect(nunca.status).toBe(409);
    expect(await nunca.json()).toEqual({ error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(3);
  });

  it("sin cambio no se escribe nada", async () => {
    enLaBase(v1({ excluidos: ["t:1"] }));
    const res = await casillas([{ op: "excluir", claves: ["t:1"] }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "run-1", version: 5, excluidos: ["t:1"] });
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });
});

describe("4 · la apertura del chat", () => {
  it("⛔ no sube la versión, no escribe `excluidos`, y la persona sale del GUARD (nunca del cuerpo)", async () => {
    /* La edición que la pone en rojo: subir la versión (una pestaña abierta tendría que releer por nada),
       crear `excluidos` (la migración de las casillas de la pantalla no correría) o tomar el email del
       cuerpo. */
    enLaBase(v1());
    const res = await pedir({ token: "run-1", version: 5, origen: "apertura", operaciones: [{ op: "chat-abierto" }], email: "otra@cliente.com" });
    expect(res.status).toBe(200);
    const { where, data } = escrito();
    expect(where.pendingProposal).toEqual({ path: ["version"], equals: 5 });
    expect(data.pendingProposal.version, "la apertura subió la versión").toBe(5);
    expect("excluidos" in data.pendingProposal, "la apertura creó `excluidos`").toBe(false);
    expect(data.pendingProposal.chatAbiertoPara).toEqual([huellaDePersona("cse@smarteam.cr")]);
    expect(JSON.stringify(data.pendingProposal), "guardó un email").not.toContain("@");
    expect(await res.json()).toEqual({ token: "run-1", version: 5, excluidos: null });

    // La misma persona otra vez: nada que escribir.
    db.projectTimeline.updateMany.mockClear();
    enLaBase(v1({ chatAbiertoPara: [huellaDePersona(EMAIL)] }));
    expect((await apertura()).status).toBe(200);
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });
});

describe("5 · las casillas", () => {
  it("una clave que el borrador no tiene se ignora; incluir saca de lo desmarcado", async () => {
    enLaBase(v1({ excluidos: ["fase:f1:durationWeeks"] }));
    const res = await casillas([
      { op: "excluir", claves: ["t:1", "t:no-esta"] },
      { op: "incluir", claves: ["fase:f1:durationWeeks"] },
    ]);
    expect(res.status).toBe(200);
    expect(escrito().data.pendingProposal.excluidos).toEqual(["t:1"]);
  });

  it("⛔ la limpieza poda SOLO las `t:` y `n:` que ya no están; `tarea:X:se-va` ausente se conserva", () => {
    /* La edición que la pone en rojo: podar toda clave ausente (una `tarea:X:se-va` que vuelve con un
       recálculo volvería marcada) o no podar las aleatorias (crecería sin fin). */
    const b = { cambios: v1().cambios } as unknown as Pick<Borrador, "cambios">;
    expect(
      normalizarExcluidos(b, ["t:1", "t:vieja", "n:vieja", "tarea:x:se-va", "fase:f9:name", "t:1", "", "x".repeat(301)]),
    ).toEqual(["t:1", "tarea:x:se-va", "fase:f9:name"]);
    expect(normalizarExcluidos(b, Array.from({ length: 2100 }, (_, k) => `tarea:${k}:se-va`))).toHaveLength(2000);
    expect(aplicarCasillas(b, [], [{ op: "excluir", claves: ["tarea:x:se-va", "t:1"] }]), "una desconocida no se ignoró").toEqual(["t:1"]);
  });

  it("lo que ve la pantalla: lo del servidor con los clics que todavía no subieron encima, en orden", () => {
    expect([...superponerCasillas(["a", "b"], [{ op: "excluir", claves: ["c"] }, { op: "incluir", claves: ["a", "c"] }])]).toEqual(["b"]);
    expect(excluidosDelGuardado(v1()), "sin el campo, null (nadie desmarcó en el servidor)").toBeNull();
    expect(excluidosDelGuardado(v1({ excluidos: ["t:1"] }))).toEqual(["t:1"]);
    expect(excluidosDelGuardado({ anchorStartDate: null, phases: [] }), "el formato viejo no tiene").toBeNull();
  });

  it("`chatAbiertoPara`: huellas (nunca emails), las últimas 50, y la misma persona con otro formato de email es la misma", () => {
    const muchas = Array.from({ length: 60 }, (_, k) => `h-${k}`);
    expect(leerAbiertoPara(v1({ chatAbiertoPara: muchas }))).toEqual(muchas.slice(-50));
    expect(abiertoPara(v1({ chatAbiertoPara: [huellaDePersona("cse@smarteam.cr")] }), "  CSE@Smarteam.cr")).toBe(true);
    expect(abiertoPara(v1(), "cse@smarteam.cr")).toBe(false);
    expect(abiertoPara(v1({ chatAbiertoPara: [huellaDePersona("cse@smarteam.cr")] }), null)).toBe(false);
  });
});
