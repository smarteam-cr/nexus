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
  // E2a P4: la marca «armando» de un borrador nuevo lee de qué fuente son las tareas de hoy.
  timelineTask: { findMany: vi.fn() },
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
  causaDelFallo,
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  leerEstadoDeLasTareas,
  leerPedidoDeTareas,
  marcarTareasEnCurso,
  MENSAJE_SIN_TAREAS_QUE_ARMAR,
  MENSAJE_TAREAS_EN_CURSO,
  MENSAJE_TAREAS_YA_LISTAS,
  MOTIVO_TAREAS_CORTADAS,
  MOTIVO_TAREAS_PERDIDAS,
  MOTIVO_TAREAS_SIN_GUARDAR,
  prevalidarPedidoDeTareas,
  vetoDelGuardado,
} from "@/lib/timeline/borrador-del-detalle";
import { MENSAJE_PROPUESTA_CAMBIO } from "@/lib/timeline/escribir-estructura";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { motivoDeLaRespuesta } from "@/lib/agents/run-error";
import type { EstructuraHipotetica } from "@/lib/timeline/borrador";
import { Prisma } from "@prisma/client";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/** Blanquea comentarios conservando saltos: NOMBRAR un problema para explicarlo no es causarlo. */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");

const APLICAR = "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts";
const TIMELINE = "app/api/projects/[projectId]/timeline/route.ts";
const ANALYZE = "app/api/clients/[id]/analyze/route.ts";

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

  it("⛔ «faltan» o «armando» + auto-zero-deltas → 423 tareas_pendientes (nunca 409), sin escribir", async () => {
    /* [D1] Una pestaña de E1 ve un v1 vacío y lo descarta sola: se perdía la corrida pagada del paso
       2. La edición que la pone en rojo: sacar el freno, o frenarlo solo en uno de los dos estados.
       ⚠ ACTUALIZADA en la revisión de E2a (2026-09-25), con esta razón: pedía 409. La pestaña de E1
       trata todo 409 como «otra propuesta» y vuelve a traer la guardada: con el mismo v1 vacío, su
       efecto mandaba otro DELETE, en bucle durante toda la corrida. Con 423 la suelta en memoria.
       Volver a 409 también la pone en rojo. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 }); // si llegara a borrar, borraría
    for (const tareas of [{ corrida: null, listas: false }, { corrida: "run-t", listas: false }]) {
      db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: v1({ tareas }) });
      conCorrida("RUNNING", 1);
      const res = await descartarDELETE(pedir({ reason: "auto-zero-deltas", runId: "run-1" }), delProyecto);
      expect(res.status, `${JSON.stringify(tareas)}: un 409 hace que la pestaña de E1 lo vuelva a traer`).toBe(423);
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
       del CSE, o `MOTIVO_COLGADA` (también con voseo) para la corrida colgada.
       ⚠ ACTUALIZADA en la revisión de E2a (2026-09-25), con esta razón: pedía que el error guardado
       llegara TAL CUAL («Se acabó el tiempo de la IA.»). Así llegaban también «CLAUDE_ERROR» y el
       «Prueba de nuevo» de `humanizeAgentError` al lado del botón «Volver a intentar». Ahora se
       traduce a una causa corta (`causaDelFallo`) y lo que no se reconoce queda en lo genérico. */
    const t = v1({ tareas: { corrida: "run-t", listas: false } });
    corrida("RUNNING", 2, null, "Armando «Diseño»");
    expect(await leerEstadoDeLasTareas(t)).toEqual({ estado: "armando", fase: "Armando «Diseño»", motivo: null });
    corrida("RUNNING", 31);
    expect(await leerEstadoDeLasTareas(t)).toEqual({ estado: "fallo", fase: null, motivo: MOTIVO_TAREAS_CORTADAS });
    corrida("ERROR", 1, JSON.stringify({ error: "La IA tardó demasiado o se cortó la conexión. Prueba de nuevo." }));
    expect(await leerEstadoDeLasTareas(t)).toMatchObject({ estado: "fallo", motivo: "la IA tardó demasiado o se cortó la conexión" });
    corrida("ERROR", 1, JSON.stringify({ error: "Algo que nadie tradujo." }));
    expect(await leerEstadoDeLasTareas(t), "el texto crudo llegó a la línea").toMatchObject({ estado: "fallo", motivo: null });
    corrida("ERROR", 1, "no es JSON");
    expect(await leerEstadoDeLasTareas(t), "el motivo genérico tiene voseo").toMatchObject({ estado: "fallo", motivo: null });
    corrida("DONE", 1);
    expect(await leerEstadoDeLasTareas(t)).toMatchObject({ estado: "fallo", motivo: MOTIVO_TAREAS_SIN_GUARDAR });
    db.agentRun.findUnique.mockResolvedValue(null);
    expect(await leerEstadoDeLasTareas(t)).toEqual({ estado: "fallo", fase: null, motivo: null });
  });

  it("⛔ la causa del fallo nunca es un código ni el texto crudo: una frase corta, en tuteo y en minúscula", () => {
    /* Revisión de E2a: la línea decía «No se pudieron armar las tareas: CLAUDE_ERROR» y, con el texto
       de `humanizeAgentError`, mezclaba «Probá de nuevo» con el botón «Volver a intentar». La
       edición que la pone en rojo: devolver lo guardado tal cual, o una causa que arranque en
       mayúscula o repita «de nuevo». */
    const guardados = [
      "CLAUDE_ERROR",
      "NO_CREDITS",
      "PROPUESTA_CAMBIO",
      "PROPUESTA_PENDIENTE",
      "Error al ejecutar el agente. Intenta de nuevo.",
      "Sin créditos en la API de Anthropic. Recarga en console.anthropic.com → Billing.",
      MENSAJE_PROPUESTA_CAMBIO,
      ...[
        Object.assign(new Error("overloaded_error"), { status: 529 }),
        Object.assign(new Error("rate limit"), { status: 429 }),
        new Error("Request timed out."),
        new Error("Your credit balance is too low"),
        Object.assign(new Error("invalid x-api-key"), { status: 401 }),
        Object.assign(new Error("max_tokens"), { status: 400 }),
        new Error("algo raro"),
      ].map(humanizeAgentError),
    ];
    for (const g of guardados) {
      const causa = causaDelFallo(g);
      expect(causa, `«${g}» no se tradujo`).not.toBeNull();
      expect(causa, g).not.toBe(g);
      expect(causa!, g).not.toMatch(/[A-Z]{3,}_|de nuevo|Probá|avisá/);
      expect(causa![0], `«${causa}» arranca en mayúscula`).toBe(causa![0].toLowerCase());
    }
    expect(causaDelFallo("Algo que nadie tradujo."), "lo que no se reconoce queda en lo genérico").toBeNull();
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

// ─────────────────────────────────────────────────────────────────────────────
// ── EL PASO 2 EN EL SERVIDOR (E2a P4): analyze completa el borrador ──────────
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/clients/[id]/analyze — el paso 2 completa el borrador (E2a P4)", () => {
  /* Escaneo del cableado de la ruta (3.400 líneas: montarla con Prisma cuesta más de lo que protege).
     La conducta del helper va abajo, con la base falsa. */
  const ruta = soloCodigo(leer(ANALYZE));

  it("⛔ el pedido se valida y se prevalida ANTES de crear la corrida (no se paga una que no se guarda)", () => {
    /* La edición que la pone en rojo: prevalidar después de `prisma.agentRun.create(` (o no prevalidar),
       o aceptar `borrador` con «Regenerar» de una fase u otro agente. */
    const iCrear = ruta.indexOf("prisma.agentRun.create(");
    const iLeer = ruta.indexOf("leerPedidoDeTareas(body?.borrador)");
    const iPrevalidar = ruta.indexOf("await prevalidarPedidoDeTareas(tl.id, pedidoDeTareas)");
    expect(iCrear, "la ruta ya no crea corridas: revisar esta guarda").toBeGreaterThan(-1);
    expect(iLeer, "la ruta no lee el pedido del borrador").toBeGreaterThan(-1);
    expect(iPrevalidar, "la ruta no prevalida el pedido").toBeGreaterThan(-1);
    expect(iLeer).toBeLessThan(iCrear);
    expect(iPrevalidar, "se prevalida después de crear la corrida").toBeLessThan(iCrear);
    expect(ruta.slice(iLeer, iLeer + 400)).toContain('(pedidoLeido !== null && (!isTimelineDetailAgent || regeneratePhaseId))');
    expect(ruta.slice(iPrevalidar, iPrevalidar + 300)).toContain("return NextResponse.json(vetoDelBorrador, { status: 409 })");
  });

  it("⛔ la marca «armando» va entre la corrida creada y el trabajo detached; si no entra, 409 con la corrida cerrada", () => {
    /* La edición que la pone en rojo: marcar antes de tener la corrida (el borrador apuntaría a nada),
       o después de soltar el trabajo detached (la pantalla vería «faltan» mientras la IA ya corre). */
    const iPre = ruta.indexOf("const pre = await prisma.agentRun.create(");
    const iMarca = ruta.indexOf("await marcarTareasEnCurso(");
    const iDetached = ruta.indexOf("if (runDetached) {");
    expect(iPre).toBeGreaterThan(-1);
    expect(iMarca, "la ruta no marca el borrador").toBeGreaterThan(iPre);
    expect(iMarca).toBeLessThan(iDetached);
    expect(ruta.slice(iMarca, iDetached)).toContain("corrida: pre.id");
    expect(ruta.slice(iMarca, iDetached)).toContain("return await markDone(NextResponse.json(vetoDeLaMarca, { status: 409 }))");
    // El paso 2 del borrador siempre va detached: el borrador sigue la corrida, no la conexión.
    expect(ruta).toMatch(/const runDetached = [^;]*\|\| pedidoDeTareas !== null;/);
  });

  it("⭐ el agente lee la estructura SUPUESTA, y si el borrador ya no es el suyo: 409 antes del modelo", () => {
    const rama = ruta.slice(ruta.indexOf("if (isTimelineDetailAgent && bodyProjectId) {"));
    const tramo = rama.slice(0, rama.indexOf("\n  }"));
    expect(tramo.length, "no encontré la rama del detalle").toBeGreaterThan(200);
    const iEstructura = tramo.indexOf("sobreDelDetalle = await estructuraParaElDetalle(timelineDelBorrador!, existingRunId);");
    const iCargar = tramo.indexOf("cargarContextoDelDetalle(bodyProjectId, {");
    expect(iEstructura, "el paso 2 no lee la estructura supuesta").toBeGreaterThan(-1);
    expect(iEstructura).toBeLessThan(iCargar);
    expect(tramo.slice(iEstructura, iCargar)).toContain(
      '{ error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO }, { status: 409 }',
    );
    expect(tramo.slice(iCargar)).toContain("sobre: sobreDelDetalle,");
  });

  it("⭐ la salida cortada por max_tokens se marca junto al stop_reason", () => {
    /* [D5] Sin esto, la última fase del JSON reparado (a medias) reemplazaría las tareas de su fase.
       La edición que la pone en rojo: no marcarla, o marcarla con otro criterio. */
    const iStop = ruta.indexOf("const stopReason = msg.stop_reason;");
    expect(iStop).toBeGreaterThan(-1);
    expect(ruta.slice(iStop, iStop + 200)).toContain('detalleCortado = isTimelineDetailAgent && stopReason === "max_tokens";');
  });

  it("⛔ la fusión va DESPUÉS de guardar la corrida y ANTES de las vistas previas de siempre", () => {
    /* La edición que la pone en rojo: fusionar antes de guardar la salida de la corrida (si la fusión
       falla, lo armado se pierde), o dejar que un pedido del borrador caiga en la vista previa vieja. */
    const iRun = ruta.indexOf("const run = existingRunId");
    const iFusion = ruta.indexOf("fusionarDetalleEnElBorrador(");
    const iPreview = ruta.indexOf("computeTimelineDetailPreview(bodyProjectId");
    expect(iRun).toBeGreaterThan(-1);
    expect(iFusion, "se fusiona antes de guardar la corrida").toBeGreaterThan(iRun);
    expect(iFusion).toBeLessThan(iPreview);
    const llamada = ruta.slice(iFusion, ruta.indexOf("});", iFusion));
    expect(llamada).toContain("corrida: run.id,");
    expect(llamada, "la fusión no usa la estructura que vio el agente").toContain("estructura: sobreDelDetalle!.estructura,");
    expect(llamada).toContain("cortado: detalleCortado,");
  });

  it("⛔ la corrida de un 409 del paso 2 no guarda un código en MAYÚSCULAS como error", () => {
    /* Revisión de E2a: `markDone` guardaba `body.error` antes que `body.message`, así que la corrida
       del paso 2 quedaba con «PROPUESTA_CAMBIO» o «CLAUDE_ERROR», y el CSE lo leía tal cual en el
       toast, en el centro de corridas y en la línea de las tareas. La edición que la pone en rojo:
       volver a preferir el código en `markDone` (o en `motivoDeLaRespuesta`). */
    const iMark = ruta.indexOf("const markDone = async (res: NextResponse) => {");
    expect(iMark, "no encontré markDone").toBeGreaterThan(-1);
    const mark = ruta.slice(iMark, ruta.indexOf("const markError", iMark));
    expect(mark).toContain("const motivo = motivoDeLaRespuesta(await res.clone().json());");
    expect(mark, "markDone volvió a elegir el código por su cuenta").not.toMatch(/body\??\.error/);
    // Lo que responde el paso 2 cuando no sigue: los vetos, el 409 dentro de la corrida y el 500 del modelo.
    const pedido = { token: "run-1", version: 5 };
    const cuerpos: unknown[] = [
      vetoDelGuardado(VIEJA, "run-h", { token: null, version: null }),
      vetoDelGuardado(v1(), "run-otra", pedido),
      { error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO },
      { error: "NO_SE_PUEDE", message: MENSAJE_SIN_TAREAS_QUE_ARMAR },
      { error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO },
      { error: "CLAUDE_ERROR", message: "Error al ejecutar el agente. Intenta de nuevo." },
    ];
    for (const c of cuerpos) {
      const guardado = motivoDeLaRespuesta(c);
      expect(guardado, JSON.stringify(c)).not.toBeNull();
      expect(guardado, `la corrida guarda el código de ${JSON.stringify(c)}`).not.toMatch(/^[A-Z_]+$/);
    }
    // Sin texto, el código es mejor que nada; sin nada, null (queda el genérico).
    expect(motivoDeLaRespuesta({ error: "NO_TIMELINE" })).toBe("NO_TIMELINE");
    expect(motivoDeLaRespuesta({ error: "  ", message: "" })).toBeNull();
    expect(motivoDeLaRespuesta(null)).toBeNull();
  });

  it("⛔ la ruta no escribe el borrador: exactamente 4 accesos a projectTimeline, todos de antes", () => {
    /* Todas las escrituras del borrador viven en lib/timeline/borrador-del-detalle.ts (probadas abajo
       con la base falsa). Los 4 de hoy: el fail-fast, y la lectura, la escritura y el alta del
       handoff. La edición que la pone en rojo: escribir el borrador (o cualquier otra cosa del
       cronograma) en la ruta. `toBe`, no `>=`: una de más también es roja. */
    expect(ruta.match(/prisma\.projectTimeline\./g) ?? []).toHaveLength(4);
  });
});

describe("GET /timeline — el estado de las tareas del borrador viaja en el cable (E2a P4)", () => {
  it("lo lee con la misma deducción que aplicar (solo lee)", () => {
    /* La edición que la pone en rojo: sacarlo del GET (la pantalla no sabría que se están armando las
       tareas al recargar) o calcularlo por otro camino. */
    const ruta = soloCodigo(leer(TIMELINE));
    const carga = ruta.slice(ruta.indexOf("async function loadTimeline("), ruta.indexOf("export async function GET("));
    expect(carga.length, "no encontré loadTimeline").toBeGreaterThan(500);
    expect(carga).toContain("tareasDelBorrador: await leerEstadoDeLasTareas(tl.pendingProposal),");
  });
});

// ── La conducta del helper, con la base falsa ─────────────────────────────────

/** Una fase de la base como la lee el helper (con sus tareas). */
const faseDB = (extra: Record<string, unknown> = {}) => ({
  id: "f1",
  name: "Diseño",
  order: 0,
  durationWeeks: 2,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: "PLANIFICACION",
  tasks: [] as unknown[],
  ...extra,
});
const tareaDB = (extra: Record<string, unknown> = {}) => ({
  id: "t-vieja",
  title: "Mapear procesos viejos",
  weekIndex: 0,
  order: 0,
  notes: null,
  party: null,
  type: null,
  status: "PENDING",
  source: "AGENT",
  startDateOverride: null,
  dueDateOverride: null,
  needsValidation: false,
  ...extra,
});
/** La estructura que VIO el agente: «Diseño» con 3 semanas (la propuesta la alargaba). */
const ESTRUCTURA: EstructuraHipotetica = {
  ancla: null,
  fases: [
    {
      id: "f1",
      name: "Diseño",
      durationWeeks: 3,
      startWeek: null,
      sessionCount: null,
      notes: null,
      activityType: "PLANIFICACION",
      existente: true,
      tareas: [],
    },
  ],
};
const DETALLE = {
  timelineDetail: { phases: [{ id: "f1", tasks: [{ title: "Diseñar el tablero", weekIndex: 2, party: "SMARTEAM" }] }] },
};
const claves = () => {
  let n = 0;
  return () => `clave-${++n}`;
};

describe("leerPedidoDeTareas — el `borrador` del body de /analyze", () => {
  it("sin borrador: null; token null: un borrador nuevo; con token, la versión es obligatoria", () => {
    expect(leerPedidoDeTareas(undefined)).toBeNull();
    expect(leerPedidoDeTareas(null)).toBeNull();
    expect(leerPedidoDeTareas({ token: null })).toEqual({ token: null, version: null });
    expect(leerPedidoDeTareas({ token: null, version: 0 })).toEqual({ token: null, version: null });
    expect(leerPedidoDeTareas({ token: "run-1", version: 5 })).toEqual({ token: "run-1", version: 5 });
    for (const malo of [{ token: "run-1" }, { token: "run-1", version: "5" }, { token: "run-1", version: -1 }, { token: "" , version: 1 }, {}, "run-1", [1]]) {
      expect(leerPedidoDeTareas(malo), JSON.stringify(malo)).toBe("invalido");
    }
  });

  it("⭐ token null: acepta lo que notó el paso 1 (limpio y con techo); con token, lo ignora", () => {
    /* Revisión de E2a: lo que notó el paso 1 vivía solo en la memoria de la pantalla y se perdía al
       recargar o al descartar el borrador vacío. La edición que la pone en rojo: no leerlas, o
       aceptar cualquier cosa (no son un canal para meter texto sin techo en la propuesta). */
    expect(leerPedidoDeTareas({ token: null, observaciones: [" Pruebas pasa a 3 semanas. ", "", "Pruebas pasa a 3 semanas."] })).toEqual({
      token: null,
      version: null,
      observaciones: ["Pruebas pasa a 3 semanas."],
    });
    expect(leerPedidoDeTareas({ token: null, observaciones: [] })).toEqual({ token: null, version: null });
    expect(leerPedidoDeTareas({ token: "run-1", version: 5, observaciones: ["x"] })).toEqual({ token: "run-1", version: 5 });
    for (const observaciones of ["texto", [1], ["x".repeat(1001)], Array.from({ length: 21 }, (_, i) => `o${i}`)]) {
      expect(leerPedidoDeTareas({ token: null, observaciones }), JSON.stringify(observaciones).slice(0, 40)).toBe("invalido");
    }
  });
});

describe("prevalidarPedidoDeTareas — antes de pagar la corrida", () => {
  const corrida = (status: string, minutos: number) =>
    db.agentRun.findUnique.mockResolvedValue({ status, updatedAt: new Date(Date.now() - minutos * 60_000), currentPhase: null, output: null });

  it("token null: solo sin ninguna propuesta abierta", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: null, pendingProposalRunId: null });
    expect(await prevalidarPedidoDeTareas("tl", { token: null, version: null })).toBeNull();
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: VIEJA, pendingProposalRunId: "run-h" });
    expect(await prevalidarPedidoDeTareas("tl", { token: null, version: null })).toMatchObject({ error: "PROPUESTA_PENDIENTE" });
  });

  it("⛔ con token: la misma corrida y versión, y las tareas en «faltan» o «fallo»", async () => {
    /* La edición que la pone en rojo: armar otra vez mientras se arman (dos corridas pagadas sobre el
       mismo borrador) o sobre otra versión que la que vio el CSE. */
    const pedido = { token: "run-1", version: 5 };
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: v1(), pendingProposalRunId: "run-1" });
    expect(await prevalidarPedidoDeTareas("tl", pedido), "«faltan»").toBeNull();
    expect(await prevalidarPedidoDeTareas("tl", { token: "run-1", version: 4 })).toMatchObject({ error: "PROPUESTA_CAMBIO" });
    expect(await prevalidarPedidoDeTareas("tl", { token: "run-2", version: 5 })).toMatchObject({ error: "PROPUESTA_CAMBIO" });

    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: v1({ tareas: { corrida: "run-t", listas: false } }),
      pendingProposalRunId: "run-1",
    });
    corrida("RUNNING", 1);
    expect(await prevalidarPedidoDeTareas("tl", pedido)).toEqual({ error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO });
    corrida("ERROR", 1);
    expect(await prevalidarPedidoDeTareas("tl", pedido), "«fallo»").toBeNull();

    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: v1({ tareas: { corrida: "run-t", listas: true } }),
      pendingProposalRunId: "run-1",
    });
    expect(await prevalidarPedidoDeTareas("tl", pedido)).toEqual({ error: "NO_SE_PUEDE", message: MENSAJE_TAREAS_YA_LISTAS });

    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: v1({ cambios: [{ tipo: "tarea-se-muda", clave: "x" }] }),
      pendingProposalRunId: "run-1",
    });
    expect(await prevalidarPedidoDeTareas("tl", pedido), "un cambio que esta versión no conoce").toMatchObject({ error: "NO_SE_PUEDE" });
  });
});

describe("marcarTareasEnCurso — el borrador queda «armando» con la corrida", () => {
  it("⛔ token null: nace un borrador vacío SOLO si no hay ninguna propuesta, y su token es la corrida", async () => {
    /* La edición que la pone en rojo: escribir sin la condición `DbNull` (pisaría la propuesta que
       entró en el medio) o deducir el pedido de otro lado. */
    db.timelineTask.findMany.mockResolvedValue([{ source: "HUMAN" }, { source: "AGENT" }]);
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-t" })).toBeNull();
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposal: { equals: Prisma.DbNull } });
    expect(data.pendingProposalRunId).toBe("run-t");
    expect(data.pendingProposal).toMatchObject({
      formato: FORMATO_BORRADOR,
      version: 0,
      cambios: [],
      pedido: "regenerar",
      tareas: { corrida: "run-t", listas: false },
    });

    expect(data.pendingProposal.observaciones).toEqual([]);

    // Lo que notó el paso 1 nace dentro del borrador vacío (revisión de E2a).
    db.projectTimeline.updateMany.mockClear();
    const notas = ["Pruebas pasa a 3 semanas: no se pudo proponer."];
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null, observaciones: notas }, corrida: "run-t" });
    expect(db.projectTimeline.updateMany.mock.calls[0][0].data.pendingProposal.observaciones, "se perdió lo que notó el paso 1").toEqual(notas);

    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-t" })).toMatchObject({
      error: "PROPUESTA_PENDIENTE",
    });
  });

  it("⛔ con token: condicionada a token + versión, versión + 1 y sin perder lo que el guardado traía", async () => {
    /* [D16] Quien escribe parte del JSON guardado y solo pisa sus campos. La edición que la pone en
       rojo: escribir sin la versión en el where, rearmar el JSON desde cero, o no subir la versión. */
    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: v1({ cambios: [TAREA_NUEVA], extra: { de: "otra versión" } }),
      pendingProposalRunId: "run-1",
    });
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: 5 }, corrida: "run-t" })).toBeNull();
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: { path: ["version"], equals: 5 } });
    expect(data.pendingProposalRunId, "el token del borrador no cambia").toBeUndefined();
    expect(data.pendingProposal).toEqual({
      ...v1({ cambios: [TAREA_NUEVA], extra: { de: "otra versión" } }),
      version: 6,
      tareas: { corrida: "run-t", listas: false },
    });

    db.projectTimeline.updateMany.mockClear();
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: 4 }, corrida: "run-t" })).toMatchObject({
      error: "PROPUESTA_CAMBIO",
    });
    expect(db.projectTimeline.updateMany, "escribió sobre otra versión").not.toHaveBeenCalled();
  });
});

describe("estructuraParaElDetalle — la estructura SUPUESTA que lee el agente", () => {
  it("las fases de la propuesta (con las nuevas por su clave) y su foto; null si el borrador ya no es de esta corrida", async () => {
    const nueva = {
      tipo: "fase-nueva",
      clave: "n:0a1b2c3d",
      fase: { name: "Migración", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
      despuesDe: "f1",
    };
    const guardado = v1({ cambios: [nueva], tareas: { corrida: "run-t", listas: false } });
    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: guardado,
      anchorStartDate: new Date("2026-09-07T00:00:00.000Z"),
      closeDateOverride: null,
      phases: [faseDB({ tasks: [tareaDB()] })],
    });
    const sobre = await estructuraParaElDetalle("tl", "run-t");
    expect(sobre?.fases.map((f) => f.id)).toEqual(["f1", "n:0a1b2c3d"]);
    expect(sobre?.foto.phases).toEqual([
      { id: "f1", name: "Diseño", durationWeeks: 2, startWeek: null },
      { id: "n:0a1b2c3d", name: "Migración", durationWeeks: 2, startWeek: null },
    ]);
    expect(sobre?.estructura.fases[1]).toMatchObject({ id: "n:0a1b2c3d", existente: false, tareas: [] });
    // La marca de OTRA corrida (se volvió a pedir en el medio): el agente no corre sobre ella.
    expect(await estructuraParaElDetalle("tl", "run-otra")).toBeNull();
  });
});

describe("fusionarDetalleEnElBorrador — lo que armó el agente entra al MISMO borrador", () => {
  const tlConBorrador = (guardado: unknown, tareas: unknown[] = [tareaDB()]) =>
    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: guardado,
      pendingProposalRunId: "run-1",
      anchorStartDate: null,
      project: { tags: [] },
      phases: [faseDB({ tasks: tareas })],
    });
  const fusionar = (extra: Record<string, unknown> = {}) =>
    fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida: "run-t",
      estructura: ESTRUCTURA,
      analysisJson: DETALLE,
      huellas: null,
      cortado: false,
      nuevaClave: claves(),
      ...extra,
    });

  it("⭐ condicionada a token + versión, con la estructura que VIO el agente y sin perder lo guardado", async () => {
    /* [D15] La estructura del mensaje se usa tal cual: la tarea de la semana 3 entra porque «Diseño»
       tenía 3 semanas en la propuesta, aunque la base diga 2 (y el cierre del plan la saca si la
       propuesta de semanas no se aplica). La edición que la pone en rojo: recalcular la estructura
       al fusionar, escribir sin token o versión, o rearmar el JSON desde cero. */
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false }, extra: { de: "otra versión" } }));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await fusionar()).toEqual({ estado: "listas", nuevas: 1, seVan: 1, observaciones: [] });
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: { path: ["version"], equals: 5 } });
    const escrito = data.pendingProposal;
    expect(escrito.extra, "perdió lo que el guardado traía").toEqual({ de: "otra versión" });
    expect(escrito.version).toBe(6);
    expect(escrito.tareas).toEqual({ corrida: "run-t", listas: true });
    expect(escrito.tareasArmadasPara, "no usó la estructura que vio el agente").toEqual({ f1: { nombre: "Diseño", semanas: 3 } });
    expect(escrito.cambios.map((c: { tipo: string }) => c.tipo)).toEqual(["tarea-se-va", "tarea-nueva"]);
    expect(escrito.cambios[1].tarea).toMatchObject({ title: "Diseñar el tablero", weekIndex: 2 });
    expect(escrito.desconocidos).toBeUndefined();
    expect(db.agentRun.update, "una fusión que entra no deja aviso en la corrida").not.toHaveBeenCalled();
  });

  it("⛔ sin ningún cambio en total, el borrador se BORRA (condicionado a token + versión)", async () => {
    /* Una fase quieta (sin tareas del agente) no genera nada: un borrador vacío «listo» no tiene nada
       que revisar. La edición que la pone en rojo: guardar un borrador vacío, o borrar sin condición. */
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false } }));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const r = await fusionar({ analysisJson: { timelineDetail: { phases: [{ id: "f1", tasks: [] }] } } });
    expect(r).toEqual({ estado: "sin-cambios", observaciones: [] });
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposalRunId: "run-1", pendingProposal: { path: ["version"], equals: 5 } });
    expect(data).toEqual({ pendingProposal: Prisma.DbNull, pendingProposalRunId: null });
    expect(db.agentRun.update, "sin nada que avisar, la corrida no se toca").not.toHaveBeenCalled();

    // Salida cortada en su única fase: nada cambia, y el aviso de la IA no se pierde con el borrador.
    db.projectTimeline.updateMany.mockClear();
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false } }));
    const cortada = await fusionar({ cortado: true });
    expect(cortada.estado).toBe("sin-cambios");
    expect(db.projectTimeline.updateMany.mock.calls[0][0].data).toEqual({ pendingProposal: Prisma.DbNull, pendingProposalRunId: null });
    expect(db.agentRun.update, "el aviso de la IA se perdió con el borrador").toHaveBeenCalledTimes(1);
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toContain("La IA se cortó antes de terminar");
  });

  it("⛔ otra corrida, tareas ya listas o sin borrador: «perdido», sin escribir y con el aviso en la corrida", async () => {
    /* [D9] Mientras la IA armaba, la propuesta se aplicó, se descartó o se volvió a pedir. La edición
       que la pone en rojo: fusionar igual (pisaría el borrador de otra corrida o uno ya revisado). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    for (const guardado of [
      v1({ tareas: { corrida: "run-otra", listas: false } }),
      v1({ tareas: { corrida: "run-t", listas: true } }),
      null,
    ]) {
      db.agentRun.update.mockClear();
      tlConBorrador(guardado);
      expect(await fusionar(), JSON.stringify(guardado?.tareas ?? null)).toEqual({ estado: "perdido" });
      expect(db.agentRun.update).toHaveBeenCalledTimes(1);
      const [{ where, data }] = db.agentRun.update.mock.calls[0];
      expect(where).toEqual({ id: "run-t" });
      expect(JSON.parse(data.output)).toEqual({ ...DETALLE, timelineSyncError: MOTIVO_TAREAS_PERDIDAS });
    }
    expect(db.projectTimeline.updateMany, "escribió un borrador que ya no era el suyo").not.toHaveBeenCalled();
  });

  it("si la escritura condicionada no entra (cambió en el medio): «perdido», sin reintentar", async () => {
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false } }));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(await fusionar()).toEqual({ estado: "perdido" });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(1);
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toBe(MOTIVO_TAREAS_PERDIDAS);
  });
});
