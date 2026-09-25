/**
 * lib/timeline/borrador-rutas.test.ts — las RUTAS del borrador del cronograma (E1): lo que la lógica
 * pura no puede asegurar solo porque vive en el cableado.
 *
 * Correr: `npx vitest run lib/timeline/borrador-rutas.test.ts --project unit`.
 *
 * Son escaneos del código (sin comentarios): montar una ruta de Next con Prisma para leer una
 * condición cuesta más de lo que protege. Cada tramo se verifica PRIMERO no vacío (si cambió la
 * forma del archivo, la guarda no puede pasar en verde por no estar mirando nada) y recién después
 * las negaciones. Cada `it` nombra la edición que lo pone en rojo.
 *
 * E2a P2 (2026-09-25) suma pruebas de CONDUCTA de los 409 que tienen que salir «sin escribir»: la
 * ruta real, con Prisma y los guards falsos (vi.mock), y la cuenta de escrituras. Un escaneo no ve
 * que el 409 salga antes de la escritura; la llamada, sí.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

// ── La base y los guards FALSOS (hoisted): las rutas reales corren contra esto ──────────────────
const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  timelinePhase: { findFirst: vi.fn(), findMany: vi.fn() },
  agentRun: { findUnique: vi.fn(), update: vi.fn() },
  timelineChange: { create: vi.fn() },
  project: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const guards = vi.hoisted(() => ({
  guardTimelineEdit: vi.fn(),
  guardTimelineDetailApply: vi.fn(),
  guardIaDelCronograma: vi.fn(),
}));
vi.mock("@/lib/auth/api-guards", () => guards);

import { POST as aplicarPOST } from "@/app/api/projects/[projectId]/timeline/borrador/aplicar/route";
import { DELETE as descartarDELETE } from "@/app/api/projects/[projectId]/timeline/proposal/route";
import { POST as aplicarFasePOST } from "@/app/api/projects/[projectId]/timeline/phases/[phaseId]/apply/route";
import { POST as aplicarTodoPOST } from "@/app/api/projects/[projectId]/timeline/detail/apply-all/route";
import { ErrorAlAplicar } from "@/lib/timeline/escribir-estructura";
import { FORMATO_BORRADOR, MENSAJE_PROPUESTA_ABIERTA } from "@/lib/timeline/borrador";
import {
  leerEstadoDeLasTareas,
  MOTIVO_TAREAS_CORTADAS,
  MOTIVO_TAREAS_SIN_GUARDAR,
} from "@/lib/timeline/borrador-del-detalle";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/** Blanquea comentarios conservando saltos: NOMBRAR un problema para explicarlo no es causarlo. */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");

const APLICAR = "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts";
const TIMELINE = "app/api/projects/[projectId]/timeline/route.ts";

describe("POST /timeline/borrador/aplicar", () => {
  const ruta = soloCodigo(leer(APLICAR));

  it("⛔ el token es obligatorio y se valida ANTES de abrir la transacción", () => {
    /* La edición que la pone en rojo: aceptar un cuerpo sin `token` (se aplicaría «la que haya»). */
    const iToken = ruta.indexOf('if (!("token" in body)');
    const iTx = ruta.indexOf("prisma.$transaction(");
    expect(iToken, "no se exige el token").toBeGreaterThan(-1);
    expect(iTx, "la ruta ya no abre una transacción").toBeGreaterThan(-1);
    expect(iToken).toBeLessThan(iTx);
    const bloque = ruta.slice(iToken, ruta.indexOf("\n  }", iToken));
    expect(bloque.length).toBeGreaterThan(40);
    expect(bloque).toContain("status: 400");
    expect(ruta, "falta exigir la huella").toContain('typeof body.huella !== "string"');
    expect(ruta, "falta exigir la lista de lo desmarcado").toContain("!Array.isArray(body.sin)");
  });

  it("⭐ el plan se calcula y se compara DENTRO de la transacción, con el núcleo compartido", () => {
    /* La edición que la pone en rojo: planear o escribir en la ruta, fuera del cuerpo probado con el
       `tx` falso y contra la base (escribir-estructura.test.ts / borrador-aplicar.int.test.ts). */
    const tx = ruta.slice(ruta.indexOf("prisma.$transaction("), ruta.indexOf("} catch (e) {"));
    expect(tx.length, "la guarda no está mirando la transacción").toBeGreaterThan(80);
    expect(tx).toContain("aplicarBorradorEnTx(tx,");
    /* ⚠ REESCRITA en E2a P2 (2026-09-25), con esta razón: pedía `timeout: 30000` (el techo del PUT).
       Desde E2a el aplicar escribe también las tareas de «Regenerar todo» —el camino que reemplaza a
       apply-all—, así que lleva el techo de apply-all. La edición que la pone en rojo: volver a 30 s
       (P2028 con Wherex) o sacar el techo. */
    expect(tx).toContain("maxWait: 20000, timeout: 60000");
    expect(ruta, "la ruta planea por su cuenta").not.toContain("planDeAplicacion(");
    expect(ruta, "la ruta escribe fases por su cuenta").not.toMatch(/timelinePhase\.(update|create|updateMany)\(/);
    // Los motivos para no aplicar salen con su código y su status.
    expect(ruta).toContain("if (e instanceof ErrorAlAplicar) {");
    expect(ruta).toContain("{ error: e.codigo, message: e.message }, { status: e.status }");
  });

  it("la auditoría, el evento del arranque y el desenlace van DESPUÉS de la transacción", () => {
    /* La edición que la pone en rojo: meterlos adentro (alarga la transacción contra el pooler) o
       perder el evento del arranque (el watchdog no se entera de que se movieron todas las fechas). */
    const iTx = ruta.indexOf("prisma.$transaction(");
    const iAudit = ruta.indexOf("prisma.timelineChange.create(");
    const iEvento = ruta.indexOf("emitTimelineEventsSafe(");
    expect(iAudit).toBeGreaterThan(iTx);
    expect(iEvento).toBeGreaterThan(iTx);
    expect(ruta.slice(iEvento, iEvento + 900)).toContain('action: "ANCHOR_CHANGED"');
    expect(ruta, "la razón dejó de decir el corrimiento del cierre").toContain("describeEndShift(");
    // Anotar el desenlace no reaviva la corrida en el feed (`updatedAt` es @updatedAt).
    const iDesenlace = ruta.indexOf('desenlace: "resuelta"');
    expect(iDesenlace).toBeGreaterThan(iTx);
    const update = ruta.slice(ruta.lastIndexOf("prisma.agentRun.update(", iDesenlace), ruta.indexOf("});", iDesenlace));
    expect(update).toContain("updatedAt: run.updatedAt");
  });

  it("la respuesta dice cuántos se aplicaron, que no queda nada pendiente, el origen y las tareas corridas", () => {
    /* Sin `pendientes` y `origen` la pantalla no encadena el paso 2 de «Regenerar todo». */
    const respuesta = ruta.slice(ruta.lastIndexOf("return NextResponse.json({"));
    expect(respuesta.length).toBeGreaterThan(50);
    expect(respuesta).toContain("aplicadas,");
    expect(respuesta).toContain("pendientes: 0,");
    expect(respuesta).toMatch(/\borigen,/);
    expect(respuesta).toMatch(/avisos:\s*avisosDeReubicacion/);
    // E2a: cuántas tareas se tocaron (con > 0, la pantalla encadena el re-chequeo del avance).
    expect(respuesta).toContain("tareasTocadas,");
  });

  it("⛔ el estado de las tareas y el permiso se leen ANTES de la transacción, y viajan al cuerpo probado", () => {
    /* E2a P2. La edición que la pone en rojo: aplicar tareas sin preguntar la vara de generarlas
       (`guardIaDelCronograma`), preguntarla dentro de la transacción (la alarga), o planear sin el
       estado de las tareas (se aplicaría mientras la IA todavía las arma). */
    const iTx = ruta.indexOf("prisma.$transaction(");
    const iEstado = ruta.indexOf("await leerEstadoDeLasTareas(tl.pendingProposal)");
    const iGuard = ruta.indexOf("await guardIaDelCronograma(tl.id)");
    expect(iEstado, "la ruta no lee el estado de las tareas").toBeGreaterThan(-1);
    expect(iGuard, "la ruta no pregunta el permiso de tocar tareas").toBeGreaterThan(-1);
    expect(iEstado).toBeLessThan(iTx);
    expect(iGuard).toBeLessThan(iTx);
    expect(ruta.slice(ruta.lastIndexOf("const puedeTocarTareas", iGuard), iGuard)).toContain(
      "traeCambiosDeTareas(tl.pendingProposal) ?",
    );
    const tx = ruta.slice(iTx, ruta.indexOf("} catch (e) {", iTx));
    expect(tx).toContain("tareas: estadoDeTareas?.estado ?? null,");
    expect(tx).toContain("puedeTocarTareas,");
    expect(tx).toContain("actorEmail: guard.user.email ?? null,");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── CONDUCTA: los 409 que salen SIN escribir (E2a P2) ────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const pedir = (body: unknown) =>
  new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
const delProyecto = { params: Promise.resolve({ projectId: "p1" }) };
const deLaFase = { params: Promise.resolve({ projectId: "p1", phaseId: "f1" }) };

/** Un borrador v1 guardado, como lo deja /estructura (y, con tareas, la fusión del paso 2). */
const v1 = (extra: Record<string, unknown> = {}) => ({
  formato: FORMATO_BORRADOR,
  version: 5,
  origen: "contexto",
  observaciones: [],
  cambios: [],
  pedido: "regenerar",
  tareas: { corrida: null, listas: false },
  tareasArmadasPara: {},
  ...extra,
});
const TAREA_NUEVA = {
  tipo: "tarea-nueva",
  clave: "t:1",
  fase: "f1",
  tarea: { title: "Mapear procesos", weekIndex: 0, notes: null, party: null, type: null, needsValidation: false, motivoPorValidar: null, fuga: null },
};
/** El formato viejo del handoff: fases sin tareas. */
const VIEJA = { anchorStartDate: null, phases: [{ id: "f1", name: "Diseño", durationWeeks: 2 }] };

beforeEach(() => {
  vi.resetAllMocks();
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: "cse@smarteam.cr" } });
  guards.guardTimelineDetailApply.mockResolvedValue({ user: { email: "cse@smarteam.cr" } });
  guards.guardIaDelCronograma.mockResolvedValue(null);
});

describe("POST /timeline/borrador/aplicar — la versión que vio el CSE", () => {
  it("⛔ con un v1 guardado en OTRA versión: 409 PROPUESTA_CAMBIO sin abrir la transacción", async () => {
    /* [D2] Sin esto la pantalla aplicaba una versión vieja, recibía PLAN_CAMBIO y, como `load()` no
       reemplaza una propuesta en pantalla, cada «Aplicar» era otro 409. La edición que la pone en
       rojo: sacar la versión del atajo (o compararla dentro de la transacción). */
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: v1(), pendingProposalRunId: "run-1" });
    // Si la ruta siguiera de largo, la transacción respondería otra cosa (y quedaría llamada).
    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    const res = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: 4 }), delProyecto);
    expect(res.status).toBe(409);
    expect(await res.json(), "aplicó una versión que el CSE no vio").toMatchObject({ error: "PROPUESTA_CAMBIO" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("una versión que no es un entero: 400; sin versión (pestaña vieja) o con la misma, sigue a la transacción", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: v1(), pendingProposalRunId: "run-1" });
    const mal = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: "5" }), delProyecto);
    expect(mal.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();

    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    for (const version of [undefined, null, 5]) {
      const res = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version }), delProyecto);
      expect(res.status, `version ${String(version)}`).toBe(409);
      expect(await res.json()).toMatchObject({ error: "PLAN_CAMBIO" });
    }
    expect(db.$transaction).toHaveBeenCalledTimes(3);
    expect(db.$transaction.mock.calls[0][1]).toEqual({ maxWait: 20000, timeout: 60000 });
  });

  it("el permiso de tocar tareas se pregunta solo si la propuesta trae tareas", async () => {
    /* La edición que la pone en rojo: pedir la vara de la IA para aplicar un cambio de fases (le
       sacaría «Aplicar» a quien hoy puede), o no pedirla nunca. */
    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: v1(), pendingProposalRunId: "run-1" });
    await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: 5 }), delProyecto);
    expect(guards.guardIaDelCronograma).not.toHaveBeenCalled();

    db.projectTimeline.findUnique.mockResolvedValue({
      id: "tl",
      pendingProposal: v1({ cambios: [TAREA_NUEVA], tareas: { corrida: "run-t", listas: true } }),
      pendingProposalRunId: "run-1",
    });
    await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: 5 }), delProyecto);
    expect(guards.guardIaDelCronograma).toHaveBeenCalledWith("tl");
  });
});

describe("DELETE /timeline/proposal — el descarte automático no borra un borrador que espera tareas", () => {
  const conCorrida = (status: string, minutos: number, output: string | null = null) => {
    db.agentRun.findUnique.mockResolvedValue({
      status,
      updatedAt: new Date(Date.now() - minutos * 60_000),
      currentPhase: "Armando «Diseño»",
      output,
    });
  };

  it("⛔ «faltan» o «armando» + auto-zero-deltas → 409 tareas_pendientes, sin escribir", async () => {
    /* [D1] Una pestaña de E1 ve un v1 vacío y lo descarta sola: se perdía la corrida pagada del paso
       2. La edición que la pone en rojo: sacar el freno, o frenarlo solo en uno de los dos estados. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 }); // si llegara a borrar, borraría
    for (const tareas of [{ corrida: null, listas: false }, { corrida: "run-t", listas: false }]) {
      db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: v1({ tareas }) });
      conCorrida("RUNNING", 1);
      const res = await descartarDELETE(pedir({ reason: "auto-zero-deltas", runId: "run-1" }), delProyecto);
      expect(res.status, JSON.stringify(tareas)).toBe(409);
      expect(await res.json()).toEqual({ cleared: false, reason: "tareas_pendientes" });
    }
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
  });

  it("un v1 vacío cuya corrida falló SÍ se descarta solo; y a mano se descarta siempre", async () => {
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    db.projectTimeline.findUnique.mockResolvedValue({
      id: "tl",
      pendingProposalRunId: "run-1",
      pendingProposal: v1({ tareas: { corrida: "run-t", listas: false } }),
    });
    conCorrida("ERROR", 1, JSON.stringify({ error: "Se cortó la conexión con la IA." }));
    const auto = await descartarDELETE(pedir({ reason: "auto-zero-deltas", runId: "run-1" }), delProyecto);
    expect(await auto.json()).toEqual({ cleared: true });

    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: v1() });
    const aMano = await descartarDELETE(pedir({ runId: "run-1" }), delProyecto);
    expect(await aMano.json()).toEqual({ cleared: true });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe("phases/[phaseId]/apply y detail/apply-all — un solo borrador por proyecto", () => {
  it("⛔ con un v1 abierto: 409 PROPUESTA_ABIERTA, sin abrir la transacción", async () => {
    /* [D19] Una pestaña vieja o una llamada directa escribiría tareas por debajo del borrador que el
       CSE está revisando. La edición que la pone en rojo: sacar el 409 de cualquiera de las dos. */
    db.timelinePhase.findFirst.mockResolvedValue({ id: "f1", status: "PENDING", durationWeeks: 2, timeline: { id: "tl", pendingProposal: v1() }, tasks: [] });
    const fase = await aplicarFasePOST(pedir({ tasks: [] }), deLaFase);
    expect(fase.status).toBe(409);
    expect(await fase.json()).toEqual({ code: "PROPUESTA_ABIERTA", message: MENSAJE_PROPUESTA_ABIERTA });

    db.projectTimeline.findUnique.mockResolvedValue({
      id: "tl",
      pendingProposal: v1(),
      phases: [{ id: "f1", durationWeeks: 2, activityType: null, tasks: [] }],
    });
    const todo = await aplicarTodoPOST(pedir({ phases: [{ phaseId: "f1", tasks: [] }] }), delProyecto);
    expect(todo.status).toBe(409);
    expect(await todo.json()).toEqual({ code: "PROPUESTA_ABIERTA", message: MENSAJE_PROPUESTA_ABIERTA });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("con la propuesta vieja del handoff (otro formato) siguen como hoy", async () => {
    db.$transaction.mockResolvedValue(undefined);
    db.timelinePhase.findFirst.mockResolvedValue({ id: "f1", status: "PENDING", durationWeeks: 2, timeline: { id: "tl", pendingProposal: VIEJA }, tasks: [] });
    expect((await aplicarFasePOST(pedir({ tasks: [] }), deLaFase)).status).toBe(200);
    db.projectTimeline.findUnique.mockResolvedValue({
      id: "tl",
      pendingProposal: VIEJA,
      phases: [{ id: "f1", durationWeeks: 2, activityType: null, tasks: [] }],
    });
    expect((await aplicarTodoPOST(pedir({ phases: [{ phaseId: "f1", tasks: [] }] }), delProyecto)).status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe("leerEstadoDeLasTareas — el estado se DEDUCE de la corrida", () => {
  const corrida = (status: string, minutos: number, output: string | null = null, currentPhase: string | null = null) =>
    db.agentRun.findUnique.mockResolvedValue({ status, updatedAt: new Date(Date.now() - minutos * 60_000), currentPhase, output });

  it("sin v1 o sin tareas: null; listas o sin corrida: sin leer la corrida", async () => {
    expect(await leerEstadoDeLasTareas(VIEJA)).toBeNull();
    expect(await leerEstadoDeLasTareas(v1({ tareas: null }))).toBeNull();
    expect(await leerEstadoDeLasTareas(v1({ tareas: { corrida: "run-t", listas: true } }))).toEqual({ estado: "listas", fase: null, motivo: null });
    expect(await leerEstadoDeLasTareas(v1())).toEqual({ estado: "faltan", fase: null, motivo: null });
    expect(db.agentRun.findUnique).not.toHaveBeenCalled();
  });

  it("⭐ armando con su fase; y los motivos del fallo, en tuteo", async () => {
    /* La edición que la pone en rojo: el motivo genérico de `parseRunError` (con voseo) en la línea
       del CSE, o `MOTIVO_COLGADA` (también con voseo) para la corrida colgada. */
    const t = v1({ tareas: { corrida: "run-t", listas: false } });
    corrida("RUNNING", 2, null, "Armando «Diseño»");
    expect(await leerEstadoDeLasTareas(t)).toEqual({ estado: "armando", fase: "Armando «Diseño»", motivo: null });
    corrida("RUNNING", 31);
    expect(await leerEstadoDeLasTareas(t)).toEqual({ estado: "fallo", fase: null, motivo: MOTIVO_TAREAS_CORTADAS });
    corrida("ERROR", 1, JSON.stringify({ error: "Se acabó el tiempo de la IA." }));
    expect(await leerEstadoDeLasTareas(t)).toMatchObject({ estado: "fallo", motivo: "Se acabó el tiempo de la IA." });
    corrida("ERROR", 1, "no es JSON");
    expect(await leerEstadoDeLasTareas(t), "el motivo genérico tiene voseo").toMatchObject({ estado: "fallo", motivo: null });
    corrida("DONE", 1);
    expect(await leerEstadoDeLasTareas(t)).toMatchObject({ estado: "fallo", motivo: MOTIVO_TAREAS_SIN_GUARDAR });
    db.agentRun.findUnique.mockResolvedValue(null);
    expect(await leerEstadoDeLasTareas(t)).toEqual({ estado: "fallo", fase: null, motivo: null });
  });
});

describe("PUT /timeline con motivo, con una propuesta abierta", () => {
  const ruta = soloCodigo(leer(TIMELINE));
  const put = ruta.slice(ruta.indexOf("export async function PUT("), ruta.indexOf("// 5. Re-cargar el estado final"));

  it("⛔ responde 409 en vez de borrar la propuesta en silencio; el autoguardado sigue igual", () => {
    /* La edición que la pone en rojo: volver a limpiar `pendingProposal` en el upsert, o chequear
       también en el autoguardado (editar a mano con una propuesta abierta está permitido). */
    expect(put.length, "la guarda no encontró el PUT").toBeGreaterThan(2000);
    const iChequeo = put.indexOf("if (!skipAudit) {");
    const iUpsert = put.indexOf("tx.projectTimeline.upsert(");
    expect(iChequeo, "el PUT con motivo ya no mira si hay una propuesta abierta").toBeGreaterThan(-1);
    expect(iChequeo).toBeLessThan(iUpsert);
    const chequeo = put.slice(iChequeo, iUpsert);
    expect(chequeo).toContain("pendingProposal: { not: Prisma.DbNull }");
    expect(chequeo).toContain("statusCode: 409");
    expect(chequeo).toContain("MENSAJE_PROPUESTA_ABIERTA");
    // El upsert existe y ya no toca la propuesta.
    const upsert = put.slice(iUpsert, put.indexOf("timelineId = tl.id", iUpsert));
    expect(upsert.length).toBeGreaterThan(200);
    expect(upsert).not.toContain("pendingProposal");
    // Y el 409 llega a la pantalla con el texto en `error` (lo que muestran la pantalla y el chat).
    expect(put).toContain('if (status === 409) {');
    expect(put).toContain('{ error: (err as Error).message, code: "PROPUESTA_ABIERTA" }, { status: 409 }');
  });
});
