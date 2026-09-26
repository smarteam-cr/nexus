/**
 * lib/timeline/borrador-operaciones.int.test.ts — EL CHAT EDITA LA PROPUESTA, contra una base REAL (E3 P2).
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/timeline/borrador-operaciones.int.test.ts --project integration
 *
 * El test unitario (borrador-operaciones-rutas.test.ts) cuenta las escrituras con una base falsa. Lo que
 * solo una base prueba es el camino entero, con el JSON de verdad:
 *   · la ruta (POST /timeline/borrador/operaciones) escribe lo que acordó el chat, las casillas y la
 *     apertura, condicionada a la versión con el filtro JSON real (`path: ["version"]`);
 *   · lo que quedó guardado se aplica tal cual (POST /borrador/aplicar, la transacción de P1): la tarea
 *     HECHA que el chat mudó conserva su id y su estado, la duración que pidió el chat se escribe, y lo que
 *     el CSE desmarcó en otra computadora no.
 * Los guards son falsos (la persona sale de ahí); la base es nexus_test (se trunca antes de cada caso).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

const guards = vi.hoisted(() => ({ guardTimelineEdit: vi.fn(), guardIaDelCronograma: vi.fn() }));
vi.mock("@/lib/auth/api-guards", () => guards);

import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/projects/[projectId]/timeline/borrador/operaciones/route";
import {
  claveDeCampo,
  claveDeTareaQueCambia,
  excluidosDelGuardado,
  huellaDePersona,
  leerBorrador,
  planDeAplicacion,
  type Borrador,
} from "./borrador";
import { SELECT_DE_FASES_CON_TAREAS, vivoDeLaBase } from "./borrador-del-detalle";
import { aplicarBorradorEnTx } from "./escribir-estructura";

const RUN = "run-propuesta-del-chat";
const EMAIL = "cse@smarteam.cr";

beforeEach(() => {
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: EMAIL } });
});

async function mundo() {
  const cliente = await prisma.client.create({ data: { name: "Cliente de la propuesta del chat (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación (test)" } });
  const tl = await prisma.projectTimeline.create({
    data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-05T00:00:00.000Z") },
  });
  const crear = (name: string, order: number, durationWeeks: number) =>
    prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
  const diseno = await crear("Diseño", 0, 2);
  const pruebas = await crear("Pruebas", 1, 3);
  const tarea = (phaseId: string, title: string, weekIndex: number, extra: Partial<Prisma.TimelineTaskUncheckedCreateInput> = {}) =>
    prisma.timelineTask.create({ data: { phaseId, title, weekIndex, order: 0, source: "AGENT", status: "PENDING", ...extra } });
  const hecha = await tarea(diseno.id, "Mapear procesos", 1, { status: "DONE", actualStart: new Date("2026-10-06T00:00:00.000Z") });
  const deLaIa = await tarea(diseno.id, "Definir pipeline", 0);
  await tarea(pruebas.id, "Probar flujos", 2);
  // La propuesta de la IA: «Pruebas» pasa a 4 semanas.
  const v1: Borrador = {
    formato: "borrador-v1",
    version: 1,
    origen: "contexto",
    observaciones: [],
    cambios: [
      {
        tipo: "fase-cambia",
        clave: claveDeCampo(pruebas.id, "durationWeeks"),
        faseId: pruebas.id,
        fase: "Pruebas",
        campo: "durationWeeks",
        desde: 3,
        a: 4,
      },
    ],
    pedido: "regenerar",
    tareas: { corrida: null, listas: true },
    tareasArmadasPara: {},
  };
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingProposal: v1 as unknown as Prisma.InputJsonValue, pendingProposalRunId: RUN },
  });
  return { proyecto, tl, diseno, pruebas, hecha, deLaIa };
}

const pedir = (projectId: string, body: Record<string, unknown>) =>
  POST({ json: async () => ({ token: RUN, ...body }) } as unknown as NextRequest, { params: Promise.resolve({ projectId }) });
const guardado = async (timelineId: string) =>
  (await prisma.projectTimeline.findUniqueOrThrow({ where: { id: timelineId }, select: { pendingProposal: true } })).pendingProposal as Record<
    string,
    unknown
  >;

describe("el chat edita la propuesta — DB real (E3 P2)", () => {
  it("⭐ la ruta escribe lo acordado, las casillas y la apertura; aplicar escribe EXACTAMENTE eso", async () => {
    /* La edición que la pone en rojo: que la ruta escriba sin la condición de la versión (el filtro JSON
       real), que la apertura suba la versión, o que lo guardado por el chat no sea aplicable tal cual
       (la mudanza recrearía la tarea HECHA, o se escribiría lo que el CSE desmarcó). */
    const m = await mundo();
    const chat = await pedir(m.proyecto.id, {
      version: 1,
      origen: "chat",
      operaciones: [
        { op: "tarea.mover-fase", taskId: m.hecha.id, phaseId: m.pruebas.id, semana: 0 },
        { op: "fase.duracion", phaseId: m.pruebas.id, semanas: 5 },
        { op: "tarea.renombrar", taskId: m.deLaIa.id, titulo: "Definir el pipeline de ventas" },
      ],
    });
    expect(chat.status).toBe(200);
    let g = await guardado(m.tl.id);
    expect(g.version).toBe(2);
    const b = leerBorrador(g)!;
    expect(b.cambios.find((c) => c.clave === claveDeTareaQueCambia(m.hecha.id))).toMatchObject({
      faseId: m.diseno.id,
      a: { fase: m.pruebas.id, weekIndex: 0 },
      porChat: true,
    });
    expect(b.cambios.find((c) => c.clave === claveDeCampo(m.pruebas.id, "durationWeeks"))).toMatchObject({ desde: 3, a: 5, porChat: true });

    // Otra computadora desmarca el renombre (la versión sube), y el chat se abre (la versión NO sube).
    const casilla = await pedir(m.proyecto.id, {
      version: 2,
      origen: "casillas",
      operaciones: [{ op: "excluir", claves: [claveDeTareaQueCambia(m.deLaIa.id)] }],
    });
    expect(casilla.status).toBe(200);
    const apertura = await pedir(m.proyecto.id, { version: 3, origen: "apertura", operaciones: [{ op: "chat-abierto" }] });
    expect(apertura.status).toBe(200);
    g = await guardado(m.tl.id);
    expect(g.version).toBe(3);
    expect(g.excluidos).toEqual([claveDeTareaQueCambia(m.deLaIa.id)]);
    expect(g.chatAbiertoPara).toEqual([huellaDePersona(EMAIL)]);

    // Una pantalla con la versión vieja no pisa nada: se reescribe sobre la que hay (y se entera).
    const vieja = await pedir(m.proyecto.id, {
      version: 1,
      origen: "casillas",
      operaciones: [{ op: "incluir", claves: [claveDeTareaQueCambia(m.deLaIa.id)] }, { op: "excluir", claves: [claveDeTareaQueCambia(m.deLaIa.id)] }],
    });
    expect(vieja.status).toBe(200);
    expect((await vieja.json()).propuesta?.version, "no devolvió la propuesta a la pantalla atrasada").toBe(3);

    // Aplicar lo guardado, con lo desmarcado del servidor (lo que manda la pantalla de E3).
    const tl = await prisma.projectTimeline.findUniqueOrThrow({
      where: { id: m.tl.id },
      select: { anchorStartDate: true, pendingProposal: true, phases: SELECT_DE_FASES_CON_TAREAS },
    });
    const vivo = vivoDeLaBase(tl.anchorStartDate, tl.phases);
    const sin = excluidosDelGuardado(tl.pendingProposal) ?? [];
    const plan = planDeAplicacion(vivo, leerBorrador(tl.pendingProposal)!, sin, { tareas: "listas" });
    const r = await prisma.$transaction(
      (tx) =>
        aplicarBorradorEnTx(tx, {
          timelineId: m.tl.id,
          token: RUN,
          guardado: tl.pendingProposal,
          sin,
          huella: plan.huella,
          ahora: new Date(),
          tareas: "listas",
          puedeTocarTareas: false, // lo del chat pide la vara de editar, no la de la IA
          actorEmail: EMAIL,
        }),
      { maxWait: 20000, timeout: 60000 },
    );
    expect(r.tareas).toMatchObject({ creadas: 0, borradas: 0, cambiadas: 1, mudadas: 1 });
    const mudada = await prisma.timelineTask.findUniqueOrThrow({ where: { id: m.hecha.id } });
    expect([mudada.phaseId, mudada.status, mudada.weekIndex]).toEqual([m.pruebas.id, "DONE", 0]);
    expect(mudada.actualStart?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect((await prisma.timelinePhase.findUniqueOrThrow({ where: { id: m.pruebas.id } })).durationWeeks).toBe(5);
    const desmarcada = await prisma.timelineTask.findUniqueOrThrow({ where: { id: m.deLaIa.id } });
    expect([desmarcada.title, desmarcada.source], "se escribió lo que el CSE desmarcó").toEqual(["Definir pipeline", "AGENT"]);
    expect(await guardado(m.tl.id)).toBeNull();
  });

  it("⛔ lo que no se puede, 422 sin escribir; con otra propuesta, 409", async () => {
    const m = await mundo();
    const antes = await guardado(m.tl.id);
    const rechazada = await pedir(m.proyecto.id, {
      version: 1,
      origen: "chat",
      operaciones: [
        { op: "fase.duracion", phaseId: m.pruebas.id, semanas: 5 },
        { op: "tarea.borrar", taskId: m.hecha.id },
      ],
    });
    expect(rechazada.status).toBe(422);
    expect(await guardado(m.tl.id), "escribió la mitad que pasaba").toEqual(antes);
    const otra = await POST({ json: async () => ({ token: "run-otra", version: 1, origen: "casillas", operaciones: [{ op: "excluir", claves: ["x"] }] }) } as unknown as NextRequest, {
      params: Promise.resolve({ projectId: m.proyecto.id }),
    });
    expect(otra.status).toBe(409);
  });
});
