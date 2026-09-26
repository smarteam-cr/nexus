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
  // Revisión de E2b: el pedido de tareas sin propuesta mira si corre un paso 1 del proyecto (`findFirst`).
  agentRun: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  timelineChange: { create: vi.fn() },
  project: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
// E2b P5b: sale `guardTimelineDetailApply` (lo pedía solo apply-all). E4: se borraron las lápidas y el
// guard; ninguna ruta de este archivo lo importa.
const guards = vi.hoisted(() => ({
  guardTimelineEdit: vi.fn(),
  guardIaDelCronograma: vi.fn(),
}));
vi.mock("@/lib/auth/api-guards", () => guards);

import { POST as aplicarPOST } from "@/app/api/projects/[projectId]/timeline/borrador/aplicar/route";
import { DELETE as descartarDELETE } from "@/app/api/projects/[projectId]/timeline/proposal/route";
import { ErrorAlAplicar, type ResultadoDeAplicar } from "@/lib/timeline/escribir-estructura";
import { AVISO_DETALLE_SIN_CAMBIOS, FORMATO_BORRADOR, leerAvisoSinCambios, leerBorrador } from "@/lib/timeline/borrador";
import {
  causaDelFallo,
  cierreDeLaCorridaVetada,
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  leerEstadoDelVacio,
  leerEstadoDeLasTareas,
  leerPedidoDeTareas,
  marcarTareasEnCurso,
  MENSAJE_SIN_TAREAS_QUE_ARMAR,
  MENSAJE_TAREAS_EN_CURSO,
  MENSAJE_TAREAS_YA_LISTAS,
  MOTIVO_TAREAS_CORTADAS,
  MOTIVO_TAREAS_PERDIDAS,
  VUELTAS_DE_LA_FUSION,
  MOTIVO_TAREAS_SIN_GUARDAR,
  prevalidarPedidoDeTareas,
  vetoDelGuardado,
} from "@/lib/timeline/borrador-del-detalle";
import { MENSAJE_PROPUESTA_CAMBIO } from "@/lib/timeline/escribir-estructura";
import { MENSAJE_ESTRUCTURA_EN_CURSO } from "@/lib/timeline/propuesta-de-estructura";
import { ID_ESTRUCTURA_CRONOGRAMA, VENTANA_DEL_PASO_1_EN_CURSO_MS } from "@/lib/agents/estructura-cronograma";
import { humanizeAgentError, MENSAJE_PRESUPUESTO_AGOTADO } from "@/lib/agents/anthropic-error";
import { evaluarPresupuesto, PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";
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
/** Algo guardado que NO es un v1 (el formato viejo del handoff: fases sin tareas). E4: ya no se lee. */
const NO_V1 = { anchorStartDate: null, phases: [{ id: "f1", name: "Diseño", durationWeeks: 2 }] };

beforeEach(() => {
  vi.resetAllMocks();
  guards.guardTimelineEdit.mockResolvedValue({ user: { email: "cse@smarteam.cr" } });
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

  it("una versión que no es un entero: 400; con la misma, sigue a la transacción", async () => {
    /* ⚠ REESCRITA en E4 P1 (2026-09-25), con esta razón: antes un pedido SIN versión («pestaña vieja»)
       también seguía a la transacción. Desde la valla de versión, con un v1 que tiene versión, un pedido
       sin ella responde 409 PROPUESTA_CAMBIO (su prueba, abajo). Sin versión sigue valiendo solo si lo
       guardado no la tiene. */
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: v1(), pendingProposalRunId: "run-1" });
    const mal = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: "5" }), delProyecto);
    expect(mal.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();

    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    const res = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: 5 }), delProyecto);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "PLAN_CAMBIO" });
    // Un v1 guardado SIN versión (anterior a E2a): sin versión en el pedido, decide el token.
    const { version: _sinVersion, ...sinVersion } = v1();
    void _sinVersion;
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: sinVersion, pendingProposalRunId: "run-1" });
    const viejo = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h" }), delProyecto);
    expect(await viejo.json()).toMatchObject({ error: "PLAN_CAMBIO" });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.$transaction.mock.calls[0][1]).toEqual({ maxWait: 20000, timeout: 60000 });
  });

  it("⛔ E4 P1 · la valla: con un v1 que tiene versión, un pedido SIN versión es otra lista: 409 PROPUESTA_CAMBIO, sin escribir", async () => {
    /* Durante la conversión de las propuestas viejas, una pestaña que todavía muestra el formato viejo
       manda `version: null`. Sin la valla caía en PLAN_CAMBIO, cuya rama hace `load()` y no trae la
       propuesta nueva: un bucle de 409. Con el 409 PROPUESTA_CAMBIO, la pantalla trae la nueva. La
       edición que la pone en rojo: volver a `version !== null &&` en `otraVersion`. */
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: v1(), pendingProposalRunId: "run-1" });
    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    for (const version of [undefined, null]) {
      const res = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version }), delProyecto);
      expect(res.status, `version ${String(version)}`).toBe(409);
      expect(await res.json(), `version ${String(version)}`).toMatchObject({ error: "PROPUESTA_CAMBIO" });
    }
    expect(db.$transaction, "abrió la transacción con una versión que no es la guardada").not.toHaveBeenCalled();
    expect(db.projectTimeline.updateMany).not.toHaveBeenCalled();
    expect(db.projectTimeline.update).not.toHaveBeenCalled();
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

describe("POST /timeline/borrador/aplicar — de dónde viene, en la auditoría (E2b)", () => {
  /** Aplica el borrador guardado `guardado` (la transacción falsa devuelve lo que aplicó) y lee la razón. */
  async function razonAlAplicar(guardado: Record<string, unknown>): Promise<string> {
    db.projectTimeline.findUnique
      .mockResolvedValueOnce({ id: "tl", pendingProposal: guardado, pendingProposalRunId: "run-f" })
      .mockResolvedValueOnce({ anchorStartDate: null });
    db.timelinePhase.findMany.mockResolvedValue([]);
    db.$transaction.mockResolvedValue({
      borrador: leerBorrador(guardado)!,
      plan: { marcadas: 1, total: 1, aplicadas: [] },
      avisos: [],
      anclaAntes: null,
      fasesAntes: [],
      tareasTocadas: 1,
      tareas: { creadas: 1, borradas: 0 },
    } as unknown as ResultadoDeAplicar);
    const res = await aplicarPOST(pedir({ token: "run-f", sin: [], huella: "h", version: 5 }), delProyecto);
    expect(res.status).toBe(200);
    const llamadas = db.timelineChange.create.mock.calls;
    return llamadas[llamadas.length - 1][0].data.reason as string;
  }
  const listas = { cambios: [TAREA_NUEVA], tareas: { corrida: "run-f", listas: true } };

  it("⛔ «Regenerar» de una fase no queda auditada como «Regenerar todo»", async () => {
    /* La edición que la pone en rojo: volver a decidir por `pedido` (el de una fase es «regenerar»)
       en vez de la clasificación única `deDondeViene`. */
    const deUnaFase = await razonAlAplicar(v1({ ...listas, soloFase: "f1", tareasArmadasPara: { f1: { nombre: "Diseño", semanas: 2 } } }));
    expect(deUnaFase).toMatch(/^Propuesta de «Regenerar» en «Diseño» aplicada: 1 de 1 cambio: 1 tarea nueva\./);
    expect(await razonAlAplicar(v1(listas))).toMatch(/^Propuesta de «Regenerar todo» aplicada/);
    expect(await razonAlAplicar(v1({ ...listas, pedido: "primera" }))).toMatch(/^Propuesta de «Generar cronograma» aplicada/);
    expect(await razonAlAplicar(v1({ pedido: null, tareas: null }))).toMatch(/^Propuesta de fases de las reuniones y notas elegidas aplicada/);
    expect(await razonAlAplicar(v1({ origen: "handoff", pedido: null, tareas: null }))).toMatch(/^Propuesta de fases del handoff aplicada/);
  });

  it("la razón sale de `deDondeViene(`, no de una cadena propia", () => {
    const ruta = soloCodigo(leer(APLICAR));
    expect(ruta).toContain("const deDonde = razonDeDonde(deDondeViene(r.borrador));");
    expect(ruta, "la ruta vuelve a clasificar por su cuenta").not.toMatch(/r\.borrador\.pedido\s*===/);
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

/* ⚠ REESCRITO en E4 (2026-09), con esta razón: pedía que phases/apply y apply-all respondieran el 409 de
   su lápida («Nexus se actualizó»). Eran para las pestañas de antes del deploy de E2b; E4 las borró, con
   `proposal/apply-items`. Una pestaña así de vieja recibe un 404. */
describe("E4 · las tres lápidas se borraron", () => {
  it("⛔ proposal/apply-items, phases/[phaseId]/apply y detail/apply-all no existen", () => {
    /* La edición que la pone en rojo: restaurar cualquiera de las tres. Las rutas que se quedan
       (phases/[phaseId] y proposal) sí existen: si esta guarda no las ve, está mirando otro lugar. */
    const raiz = "app/api/projects/[projectId]/timeline";
    for (const viva of [`${raiz}/phases/[phaseId]/route.ts`, `${raiz}/proposal/route.ts`, APLICAR]) {
      expect(fs.existsSync(path.join(process.cwd(), viva)), `no encuentro ${viva}`).toBe(true);
    }
    for (const lapida of [`${raiz}/proposal/apply-items/route.ts`, `${raiz}/phases/[phaseId]/apply/route.ts`, `${raiz}/detail/apply-all/route.ts`]) {
      expect(fs.existsSync(path.join(process.cwd(), lapida)), `volvió ${lapida}`).toBe(false);
    }
  });
});

describe("POST /timeline/borrador/aplicar — la `foto` de una pestaña de antes", () => {
  it("⛔ E4: una `foto` en el cuerpo (válida o no) NO da 400: se ignora y decide la transacción", async () => {
    /* Una pestaña de E3 abierta durante el deploy de E4 la sigue mandando. La edición que la pone en
       rojo: volver a validarla (su 400 dejaría a esa pestaña sin poder aplicar). */
    db.projectTimeline.findUnique.mockResolvedValue({ id: "tl", pendingProposal: v1(), pendingProposalRunId: "run-1" });
    db.$transaction.mockRejectedValue(new ErrorAlAplicar("PLAN_CAMBIO", "otra lista"));
    const fotos = [{ ancla: null, fases: [{ id: "f1", name: "Diseño", durationWeeks: 2 }] }, { ancla: 3, fases: [] }, "basura", 7];
    for (const foto of fotos) {
      const res = await aplicarPOST(pedir({ token: "run-1", sin: [], huella: "h", version: 5, foto }), delProyecto);
      expect(res.status, JSON.stringify(foto)).toBe(409);
      expect(await res.json(), JSON.stringify(foto)).toMatchObject({ error: "PLAN_CAMBIO" });
    }
    expect(db.$transaction).toHaveBeenCalledTimes(fotos.length);
    expect(soloCodigo(leer(APLICAR)), "la ruta volvió a leer la foto").not.toMatch(/leerFoto|body\.foto/);
  });
});

describe("leerEstadoDeLasTareas — el estado se DEDUCE de la corrida", () => {
  const corrida = (status: string, minutos: number, output: string | null = null, currentPhase: string | null = null) =>
    db.agentRun.findUnique.mockResolvedValue({ status, updatedAt: new Date(Date.now() - minutos * 60_000), currentPhase, output });

  it("sin v1 o sin tareas: null; listas o sin corrida: sin leer la corrida", async () => {
    expect(await leerEstadoDeLasTareas(NO_V1)).toBeNull();
    expect(await leerEstadoDeLasTareas(v1({ tareas: null }))).toBeNull();
    expect(await leerEstadoDeLasTareas(v1({ tareas: { corrida: "run-t", listas: true } }))).toEqual({ estado: "listas", fase: null, motivo: null });
    expect(await leerEstadoDeLasTareas(v1())).toEqual({ estado: "faltan", fase: null, motivo: null });
    expect(db.agentRun.findUnique).not.toHaveBeenCalled();
  });

  it("⭐ armando con su fase; y los motivos del fallo, en tuteo", async () => {
    /* La edición que la pone en rojo: el motivo genérico de `parseRunError` (con voseo) en la línea
       del CSE, o `MOTIVO_COLGADA` (una oración entera, para el centro de corridas) para la corrida colgada.
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

  it("⛔ el borrador VACÍO: «armando» solo con la corrida viva; muerta o fallida, «fallo» (lo lee el chat)", async () => {
    /* Cierre de la revisión de E2a: el chat lo contaba con un filtro JSON de Prisma que nunca se corrió
       contra la base (y si fallaba volvía en silencio al texto de «decidir»), y sin mirar la corrida
       decía «espera» también con la corrida muerta. Ahora se evalúa en JS sobre el JSON leído. Las
       ediciones que la ponen en rojo: dejar de mirar la corrida, o leer un vacío donde no lo hay. */
    const vacio = v1({ tareas: { corrida: "run-v", listas: false } });
    corrida("RUNNING", 2);
    expect(await leerEstadoDelVacio(vacio)).toBe("armando");
    corrida("RUNNING", 31);
    expect(await leerEstadoDelVacio(vacio), "la corrida colgada sigue «armando»").toBe("fallo");
    corrida("ERROR", 1, JSON.stringify({ error: "La IA está sobrecargada en este momento." }));
    expect(await leerEstadoDelVacio(vacio), "la corrida fallida sigue «armando»").toBe("fallo");
    db.agentRun.findUnique.mockResolvedValue(null);
    expect(await leerEstadoDelVacio(vacio), "sin la fila de la corrida").toBe("fallo");
    db.agentRun.findUnique.mockClear();
    expect(await leerEstadoDelVacio(v1({ cambios: [TAREA_NUEVA], tareas: { corrida: "run-v", listas: false } }))).toBeNull();
    expect(await leerEstadoDelVacio(v1({ tareas: { corrida: "run-v", listas: true } }))).toBeNull();
    expect(await leerEstadoDelVacio(NO_V1)).toBeNull();
    expect(await leerEstadoDelVacio(null)).toBeNull();
    expect(db.agentRun.findUnique, "leyó una corrida sin un vacío").not.toHaveBeenCalled();
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
       o aceptar `borrador` con otro agente, o con «Regenerar» de una fase DENTRO de un borrador abierto.
       ⚠ ACTUALIZADA en E2b P3 (2026-09-25), con esta razón: rechazaba toda fase con `borrador`. Desde
       E2b «Regenerar» de una fase es un borrador con token null (nace con `soloFase`); con token sigue
       en 400 hasta E2c (el recálculo dentro de un borrador abierto). */
    const iCrear = ruta.indexOf("prisma.agentRun.create(");
    const iLeer = ruta.indexOf("leerPedidoDeTareas(body?.borrador)");
    const iPrevalidar = ruta.indexOf("await prevalidarPedidoDeTareas(tl.id, pedidoDeTareas)");
    expect(iCrear, "la ruta ya no crea corridas: revisar esta guarda").toBeGreaterThan(-1);
    expect(iLeer, "la ruta no lee el pedido del borrador").toBeGreaterThan(-1);
    expect(iPrevalidar, "la ruta no prevalida el pedido").toBeGreaterThan(-1);
    expect(iLeer).toBeLessThan(iCrear);
    expect(iPrevalidar, "se prevalida después de crear la corrida").toBeLessThan(iCrear);
    expect(ruta.slice(iLeer, iLeer + 400)).toContain(
      "(pedidoLeido !== null && (!isTimelineDetailAgent || (regeneratePhaseId !== null && pedidoLeido.token !== null)))",
    );
    expect(ruta.slice(iPrevalidar, iPrevalidar + 300)).toContain("return NextResponse.json(vetoDelBorrador, { status: 409 })");
  });

  it("⛔ la regla (E2b P5a): el agente de detalle sin `borrador` responde 409 ANTES de crear la corrida", () => {
    /* ⚠ RETITULADA en E4 (2026-09): se llamaba «lápida». No lo es: E4 borró las lápidas y esto se queda.
       Un pedido sin `borrador` pagaría una corrida cuya salida no se puede aplicar, y más abajo la rama
       del detalle da por hechos `timelineDelBorrador` y `sobreDelDetalle`. `{ error, message }`: sus
       lectores muestran `message` primero. La edición que la pone en rojo: sacar el 409, ponerlo después
       de crear la corrida, o hacerlo solo para «Regenerar» de una fase. */
    const iLapida = ruta.indexOf("if (isTimelineDetailAgent && pedidoLeido === null) {");
    expect(iLapida, "no encontré la lápida").toBeGreaterThan(-1);
    for (const crear of ["const run = existingRunId", "const pre = await prisma.agentRun.create("]) {
      const i = ruta.indexOf(crear);
      expect(i, crear).toBeGreaterThan(-1);
      expect(iLapida, `la lápida va después de «${crear}»`).toBeLessThan(i);
    }
    expect(iLapida, "la lápida va después de crear una corrida").toBeLessThan(ruta.indexOf("prisma.agentRun.create("));
    const lapida = ruta.slice(iLapida, ruta.indexOf("{ status: 409 }", iLapida) + 20);
    expect(lapida.length).toBeLessThan(400);
    expect(lapida).toContain('error: "NEXUS_ACTUALIZADO", message: "Nexus se actualizó: recarga la página y vuelve a pedirlo."');
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
    /* ⚠ ACTUALIZADA en el cierre de la revisión de E2a (2026-09-25), con esta razón: pedía cerrar la
       corrida con `markDone` (ERROR), y el centro de corridas anunciaba en rojo algo que no es un fallo
       (encima del aviso del cronograma). Sigue pidiendo lo mismo de fondo: 409 y la corrida cerrada, con
       el motivo escrito; ahora sin ruido (su conducta, en el `it` de abajo). */
    const veto = ruta.slice(iMarca, iDetached);
    expect(veto).toContain("await prisma.agentRun.update({ where: { id: pre.id }, data: cierreDeLaCorridaVetada(vetoDeLaMarca) })");
    expect(veto).toContain("return NextResponse.json(vetoDeLaMarca, { status: 409 });");
    expect(veto, "el veto vuelve a quedar en ERROR (el centro de corridas lo anuncia en rojo)").not.toContain("markDone(");
    // El paso 2 del borrador siempre va detached: el borrador sigue la corrida, no la conexión.
    expect(ruta).toMatch(/const runDetached = [^;]*\|\| pedidoDeTareas !== null;/);
  });

  it("⛔ «Regenerar» de una fase (E2b): la marca guarda la fase en el borrador; la fusión no la toma del body", () => {
    /* La edición que la pone en rojo: no pasarle la fase a la marca (el borrador nacería sin alcance y
       la fusión armaría TODO el cronograma), o pasarle a la fusión la fase del body (el alcance tiene una
       sola fuente: el JSON guardado). */
    const iMarca = ruta.indexOf("await marcarTareasEnCurso(");
    const marca = ruta.slice(iMarca, ruta.indexOf("});", iMarca));
    expect(marca).toContain("soloFase: regeneratePhaseId,");
    const iFusion = ruta.indexOf("fusionarDetalleEnElBorrador(");
    const fusion = ruta.slice(iFusion, ruta.indexOf("});", iFusion));
    expect(fusion.length, "no encontré la fusión").toBeGreaterThan(80);
    expect(fusion, "la fusión toma el alcance del body").not.toMatch(/regeneratePhaseId|soloFase/);
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

  it("⛔ la fusión va DESPUÉS de guardar la corrida, y es la ÚNICA salida del detalle: `{ tareas, run }`", () => {
    /* La edición que la pone en rojo: fusionar antes de guardar la salida de la corrida (si la fusión
       falla, lo armado se pierde), o que la rama del detalle vuelva a tener otra salida.
       ⚠ REESCRITA en E2b P5a (2026-09-25), con esta razón: pedía que la fusión fuera ANTES de las dos
       vistas previas en memoria (`computeTimelineDetailPreview`, de una fase, y la de todas), que
       quedaban para las pestañas viejas y para «Regenerar» de una fase. Se borraron: una fase también
       entra al borrador, y un pedido sin `borrador` ni llega (la regla de abajo). Volver a sumar una
       vista previa la pone en rojo. */
    const iRun = ruta.indexOf("const run = existingRunId");
    const iFusion = ruta.indexOf("fusionarDetalleEnElBorrador(");
    expect(iRun).toBeGreaterThan(-1);
    expect(iFusion, "se fusiona antes de guardar la corrida").toBeGreaterThan(iRun);
    const iRama = ruta.lastIndexOf("if (isTimelineDetailAgent) {", iFusion);
    const rama = ruta.slice(iRama, ruta.indexOf("updateCanvasAsync", iRama));
    expect(rama.length, "no encontré la rama del detalle").toBeGreaterThan(300);
    expect(rama.match(/return NextResponse\.json\(/g) ?? [], "la rama del detalle tiene otra salida").toHaveLength(1);
    expect(rama).toMatch(/return NextResponse\.json\(\{\s*tareas,\s*run: \{/);
    expect(rama, "volvió una vista previa").not.toMatch(/preview/i);
    expect(ruta, "volvió una vista previa del detalle").not.toMatch(
      /computeTimelineDetailPreview|previewTasks|previewPhases|fijasDeSemanaCeroParaPreview/,
    );
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
      vetoDelGuardado(NO_V1, "run-h", { token: null, version: null }),
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

  it("⛔ perder la carrera de la marca no se anuncia como fallo: la corrida queda ARCHIVED, con el motivo en palabras", () => {
    /* Cierre de la revisión de E2a: el veto de la marca (otra pestaña aplicó, descartó o volvió a pedir
       entre prevalidar y marcar) dejaba la corrida en ERROR y el centro de corridas la anunciaba en
       rojo, además del aviso informativo del cronograma. No se llamó a la IA ni se pagó nada. El feed
       del centro de corridas solo lee PENDING, RUNNING, DONE y ERROR. La edición que la pone en rojo:
       volver a cerrarla en ERROR, o guardar el código en vez del texto. */
    for (const veto of [
      vetoDelGuardado(NO_V1, "run-h", { token: null, version: null })!,
      vetoDelGuardado(v1(), "run-otra", { token: "run-1", version: 5 })!,
    ]) {
      const cierre = cierreDeLaCorridaVetada(veto);
      expect(cierre.status, "el centro de corridas lo anuncia en rojo").toBe("ARCHIVED");
      const guardado = JSON.parse(cierre.output).error as string;
      expect(guardado).toBe(veto.message);
      expect(guardado, "la corrida guarda el código").not.toMatch(/^[A-Z_]+$/);
    }
    const feed = soloCodigo(leer("app/api/agent-runs/route.ts"));
    expect(feed, "el centro de corridas empezó a leer las ARCHIVED: revisar esta guarda").not.toContain("ARCHIVED");
  });

  it("⛔ el tope diario de IA dice su causa, no «la IA no respondió bien»", () => {
    /* Cierre de la revisión de E2a: `PresupuestoDeIaAgotado` tira dentro de `messages.stream`, caía en
       el catch genérico («Error al ejecutar el agente») y la línea decía «la IA no respondió bien». Las
       ediciones que la ponen en rojo: sacar el caso del catch de analyze, de `humanizeAgentError` o de
       `causaDelFallo`. */
    const tope = new PresupuestoDeIaAgotado(
      evaluarPresupuesto("humano", 30, { humano: 25, automatico: 10, bloquea: true }),
    );
    expect(humanizeAgentError(tope)).toBe(MENSAJE_PRESUPUESTO_AGOTADO);
    expect(causaDelFallo(MENSAJE_PRESUPUESTO_AGOTADO), "la línea no dice la causa").toBe(
      "se agotó el presupuesto de IA del día: avísale a Elías",
    );
    expect(causaDelFallo(humanizeAgentError(tope))).not.toBe(causaDelFallo("Error al ejecutar el agente. Intenta de nuevo."));
    const iCatch = ruta.indexOf('console.error("[analyze] Claude error:", e);');
    expect(iCatch, "no encontré el catch de la llamada al modelo").toBeGreaterThan(-1);
    const captura = ruta.slice(iCatch, ruta.indexOf("{ status: 500 }", iCatch));
    expect(captura).toContain("const esTope = esPresupuestoAgotado(e);");
    expect(captura).toMatch(/esTope\s*\?\s*humanizeAgentError\(e\)/);
  });

  it("⛔ la ruta no escribe el borrador: exactamente 2 accesos a projectTimeline, todos de antes", () => {
    /* Todas las escrituras del borrador viven en lib/timeline/borrador-del-detalle.ts (probadas abajo
       con la base falsa) y, las del handoff, en lib/timeline/borrador-del-handoff.ts. Los 2 de hoy:
       el fail-fast y el alta del cronograma que nunca existió (la rama del handoff que crea las fases).
       La edición que la pone en rojo: escribir el borrador (o cualquier otra cosa del cronograma) en
       la ruta. `toBe`, no `>=`: una de más también es roja.
       ⚠ REESCRITA en E2b P2 (2026-09-25), con esta razón: eran 4; la lectura y la escritura de la
       propuesta del handoff se mudaron al helper, que se prueba llamándolo. */
    expect(ruta.match(/prisma\.projectTimeline\./g) ?? []).toHaveLength(2);
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
/** La tarea de `tareaDB()` como la LEYÓ el agente (la que viaja en la estructura). */
const TAREA_VISTA = {
  id: "t-vieja",
  title: "Mapear procesos viejos",
  weekIndex: 0,
  notes: null,
  party: null,
  type: null,
  status: "PENDING",
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  needsValidation: false,
};
/** La estructura que VIO el agente: «Diseño» con 3 semanas (la propuesta la alargaba).
 *  ⚠ ACTUALIZADA en E2b P3 (2026-09-25), con esta razón: traía `tareas: []`, y desde D10 solo se va
 *  lo que el agente VIO; «Diseño» trae la tarea que el agente leyó, como en una corrida de verdad. */
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
      tareas: [TAREA_VISTA],
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
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: NO_V1, pendingProposalRunId: "run-h" });
    expect(await prevalidarPedidoDeTareas("tl", { token: null, version: null })).toMatchObject({ error: "PROPUESTA_PENDIENTE" });
  });

  it("⛔ token null con un paso 1 del proyecto corriendo: 409 ESTRUCTURA_EN_CURSO, antes de pagar la corrida", async () => {
    /* Revisión de E2b. «Regenerar» de una fase (y la oferta de las tareas) crea un borrador vacío. Si el
       paso 1 corría en otra pestaña, el vacío entraba primero y el paso 1, ya pagado, respondía 409 sin
       guardar su propuesta. La edición que la pone en rojo: no mirar el paso 1, o mirar otro agente, otro
       proyecto, otro estado u otra ventana que la toma del paso 1. */
    const ahora = new Date("2026-09-25T15:00:00.000Z");
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: null, pendingProposalRunId: null, projectId: "p1" });
    db.agentRun.findFirst.mockResolvedValue({ id: "run-e" });
    expect(await prevalidarPedidoDeTareas("tl", { token: null, version: null }, ahora), "el vacío pisa al paso 1 en curso").toEqual({
      error: "ESTRUCTURA_EN_CURSO",
      message: MENSAJE_ESTRUCTURA_EN_CURSO,
    });
    expect(db.agentRun.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: "p1",
        agentSlug: ID_ESTRUCTURA_CRONOGRAMA,
        status: "RUNNING",
        createdAt: { gte: new Date(ahora.getTime() - VENTANA_DEL_PASO_1_EN_CURSO_MS) },
      },
      select: { id: true },
    });
    expect(VENTANA_DEL_PASO_1_EN_CURSO_MS, "la ventana dejó de ser la de la toma del paso 1").toBe(3 * 60_000);
    // Sin paso 1 en curso, pasa.
    db.agentRun.findFirst.mockResolvedValue(null);
    expect(await prevalidarPedidoDeTareas("tl", { token: null, version: null }, ahora)).toBeNull();
    // Con token (las tareas de la propuesta que dejó un paso 1 ya terminado) no se mira.
    db.agentRun.findFirst.mockClear();
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: v1(), pendingProposalRunId: "run-1", projectId: "p1" });
    expect(await prevalidarPedidoDeTareas("tl", { token: "run-1", version: 5 }, ahora)).toBeNull();
    expect(db.agentRun.findFirst).not.toHaveBeenCalled();
    // La ruta lo pide ANTES de crear la corrida: el mismo `prevalidarPedidoDeTareas` (guarda de más abajo).
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

  it("⛔ «Regenerar» de una fase (E2b): el vacío nace con `soloFase`; sin fase, sin la clave; con token, se ignora", async () => {
    /* La edición que la pone en rojo: no guardar la fase en el vacío (la fusión, que la lee de ahí,
       armaría todo el cronograma), o sumársela a un borrador que ya existe. */
    db.timelineTask.findMany.mockResolvedValue([{ source: "AGENT" }]);
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-f", soloFase: "f1" })).toBeNull();
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[0];
    expect(where).toEqual({ id: "tl", pendingProposal: { equals: Prisma.DbNull } });
    expect(data.pendingProposal).toMatchObject({ origen: "contexto", pedido: "regenerar", cambios: [], soloFase: "f1" });
    expect(data.pendingProposalRunId).toBe("run-f");

    db.projectTimeline.updateMany.mockClear();
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-f", soloFase: null });
    expect("soloFase" in db.projectTimeline.updateMany.mock.calls[0][0].data.pendingProposal).toBe(false);

    db.projectTimeline.updateMany.mockClear();
    db.projectTimeline.findUnique.mockResolvedValue({ pendingProposal: v1(), pendingProposalRunId: "run-1" });
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: 5 }, corrida: "run-t", soloFase: "f1" });
    expect("soloFase" in db.projectTimeline.updateMany.mock.calls[0][0].data.pendingProposal, "le sumó alcance a un borrador abierto").toBe(
      false,
    );
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
    // ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan (R8 guarda la forma completa).
    expect(escrito.tareasArmadasPara, "no usó la estructura que vio el agente").toEqual({
      f1: { nombre: "Diseño", semanas: 3, sesiones: null, semanaCero: true },
    });
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

  it("⛔ sin cambios, lo que notó el PASO 1 (guardado en el borrador vacío) no se borra en silencio con él", async () => {
    /* Cierre de la revisión de E2a: el borrador vacío nace con lo que notó el paso 1; si el paso 2 volvía
       sin cambios, la fusión lo borraba y el aviso de la corrida llevaba solo lo del paso 2. La edición
       que la pone en rojo: volver a avisar solo `cambios.observaciones`. */
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false }, observaciones: ["Lo acordado de «Pruebas» no entró."] }));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const r = await fusionar({ analysisJson: { timelineDetail: { phases: [{ id: "f1", tasks: [] }] } } });
    expect(r).toEqual({ estado: "sin-cambios", observaciones: ["Lo acordado de «Pruebas» no entró."] });
    expect(db.projectTimeline.updateMany.mock.calls[0][0].data).toEqual({ pendingProposal: Prisma.DbNull, pendingProposalRunId: null });
    expect(db.agentRun.update, "lo del paso 1 se borró con el borrador, sin aviso").toHaveBeenCalledTimes(1);
    /* ⚠ ACTUALIZADA en la revisión de E2b (2026-09-25), con esta razón: el aviso era lo notado, pegado,
       y reemplazaba al desenlace en el toast. Ahora el desenlace va primero y lo notado, una por línea
       (`avisoSinCambiosParaLaCorrida`). Lo protegido no cambió: lo del paso 1 sigue en el aviso. */
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toBe(
      `${AVISO_DETALLE_SIN_CAMBIOS}\nLo acordado de «Pruebas» no entró.`,
    );

    // Con lo de los DOS pasos, el aviso lleva los dos (lo del paso 1 primero), después del desenlace.
    db.agentRun.update.mockClear();
    db.projectTimeline.updateMany.mockClear();
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false }, observaciones: ["Del paso 1."] }));
    const ambos = await fusionar({ cortado: true });
    expect(ambos.estado).toBe("sin-cambios");
    const aviso = JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError as string;
    const [desenlace, delPaso1, delPaso2, ...resto] = aviso.split("\n");
    expect(desenlace, "el aviso no empieza por el desenlace").toBe(AVISO_DETALLE_SIN_CAMBIOS);
    expect(delPaso1).toBe("Del paso 1.");
    expect(delPaso2).toContain("La IA se cortó antes de terminar");
    expect(resto).toEqual([]);
    // Y la pantalla lo lee entero: lo notado, sin el desenlace.
    expect(leerAvisoSinCambios(aviso)).toEqual([delPaso1, delPaso2]);
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

  it("⭐ «Regenerar» de una fase (E2b): con `soloFase` guardado, solo cambia esa fase aunque el modelo traiga otras", async () => {
    /* La edición que la pone en rojo: fusionar sin el alcance del borrador guardado (se reemplazarían
       las tareas de las fases que el CSE no pidió regenerar). */
    const DOS: EstructuraHipotetica = {
      ancla: null,
      fases: [
        ESTRUCTURA.fases[0],
        { ...ESTRUCTURA.fases[0], id: "f2", name: "Pruebas", durationWeeks: 2, tareas: [{ ...TAREA_VISTA, id: "t-f2", title: "Probar lo viejo" }] },
      ],
    };
    const detalle = {
      timelineDetail: {
        phases: [
          { id: "f1", tasks: [{ title: "Diseñar el tablero", weekIndex: 2 }] },
          { id: "f2", tasks: [{ title: "Probar el tablero", weekIndex: 1 }] },
        ],
      },
    };
    const conDosFases = (guardado: unknown) =>
      db.projectTimeline.findUnique.mockResolvedValue({
        pendingProposal: guardado,
        pendingProposalRunId: "run-1",
        anchorStartDate: null,
        project: { tags: [] },
        phases: [
          faseDB({ tasks: [tareaDB()] }),
          faseDB({ id: "f2", name: "Pruebas", order: 1, tasks: [tareaDB({ id: "t-f2", title: "Probar lo viejo" })] }),
        ],
      });
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });

    conDosFases(v1({ tareas: { corrida: "run-t", listas: false }, soloFase: "f2" }));
    expect(await fusionar({ estructura: DOS, analysisJson: detalle })).toEqual({ estado: "listas", nuevas: 1, seVan: 1, observaciones: [] });
    const escrito = db.projectTimeline.updateMany.mock.calls[0][0].data.pendingProposal;
    const fases = escrito.cambios.map((c: { fase?: string; faseId?: string }) => c.fase ?? c.faseId);
    expect(fases, "cambió una fase que no se pidió").toEqual(["f2", "f2"]);
    // ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan (R8 guarda la forma completa).
    expect(escrito.tareasArmadasPara).toEqual({ f2: { nombre: "Pruebas", semanas: 2, sesiones: null, semanaCero: false } });
    expect(escrito.soloFase).toBe("f2");

    // Control: el mismo pedido sin `soloFase` guardado cambia las dos.
    db.projectTimeline.updateMany.mockClear();
    conDosFases(v1({ tareas: { corrida: "run-t", listas: false } }));
    expect(await fusionar({ estructura: DOS, analysisJson: detalle })).toMatchObject({ estado: "listas", nuevas: 2, seVan: 2 });
  });

  /* ⚠ REESCRITA en E3 P2 (2026-09-25), con esta razón: decía «si la escritura condicionada no entra:
     «perdido», sin reintentar». Desde E3 otros escriben el borrador mientras la IA arma (las casillas del
     CSE y la marca de que el chat se abrió suben la versión), y perder lo armado por eso tiraba una
     corrida pagada. Ahora vuelve a leer y a fusionar, y conserva lo desmarcado y lo que dictó el chat. Lo
     protegido sigue: si el borrador dejó de ser el de esta corrida, «perdido» sin escribir.
     La edición que la pone en rojo: volver a «perdido» sin releer, rearmar el JSON sin `...guardado` (se
     perdería `excluidos`), o reescribir las tareas del chat con las de la IA. */
  it("si la escritura condicionada no entra: vuelve a leer y reintenta, conservando lo desmarcado y lo del chat; con otra corrida, «perdido»", async () => {
    const DEL_CHAT = {
      tipo: "tarea-nueva",
      clave: "t:del-chat",
      fase: "f1",
      tarea: { title: "Revisión conjunta", weekIndex: 1, notes: null, party: null, type: null, needsValidation: false, motivoPorValidar: null, fuga: null },
      porChat: true,
    };
    const conCasillas = v1({
      version: 6,
      tareas: { corrida: "run-t", listas: false },
      cambios: [DEL_CHAT],
      excluidos: ["tarea:t-vieja:se-va"],
      chatAbiertoPara: ["h-1"],
      ajustadasPorElChat: { f1: { nombre: "Diseño", semanas: 2 }, "f-otra": { nombre: "Otra", semanas: 1 } },
    });
    const conLa = (guardado: unknown) => ({
      pendingProposal: guardado,
      pendingProposalRunId: "run-1",
      anchorStartDate: null,
      project: { tags: [] },
      phases: [faseDB({ tasks: [tareaDB()] })],
    });
    db.projectTimeline.findUnique
      .mockResolvedValueOnce(conLa(v1({ tareas: { corrida: "run-t", listas: false } })))
      .mockResolvedValueOnce(conLa(conCasillas));
    db.projectTimeline.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await fusionar()).toEqual({ estado: "listas", nuevas: 1, seVan: 1, observaciones: [] });
    expect(db.projectTimeline.updateMany, "no volvió a intentar").toHaveBeenCalledTimes(2);
    const [{ where, data }] = db.projectTimeline.updateMany.mock.calls[1];
    expect(where.pendingProposal, "no se condicionó a la versión que volvió a leer").toEqual({ path: ["version"], equals: 6 });
    const escrito = data.pendingProposal;
    expect(escrito.version).toBe(7);
    expect(escrito.excluidos, "perdió lo desmarcado").toEqual(["tarea:t-vieja:se-va"]);
    expect(escrito.chatAbiertoPara).toEqual(["h-1"]);
    expect(escrito.cambios.map((c: { clave: string }) => c.clave), "perdió lo que dictó el chat").toEqual([
      "t:del-chat",
      "tarea:t-vieja:se-va",
      "t:clave-2", // la clave de la segunda vuelta: la primera se armó y no entró
    ]);
    // D9: la fase que se vuelve a armar pierde la forma que le dio el chat; las demás la conservan.
    expect(escrito.ajustadasPorElChat).toEqual({ "f-otra": { nombre: "Otra", semanas: 1 } });
    expect(db.agentRun.update, "una fusión que entra no deja aviso en la corrida").not.toHaveBeenCalled();

    // En la segunda lectura el borrador ya es de OTRA corrida (se volvió a pedir): «perdido», sin escribir.
    db.projectTimeline.findUnique.mockReset();
    db.projectTimeline.updateMany.mockReset();
    db.projectTimeline.findUnique
      .mockResolvedValueOnce(conLa(v1({ tareas: { corrida: "run-t", listas: false } })))
      .mockResolvedValueOnce(conLa(v1({ version: 6, tareas: { corrida: "run-otra", listas: false } })));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(await fusionar()).toEqual({ estado: "perdido" });
    expect(db.projectTimeline.updateMany, "escribió un borrador que ya no era el suyo").toHaveBeenCalledTimes(1);
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toBe(MOTIVO_TAREAS_PERDIDAS);

    // Y si nunca entra, se rinde a las VUELTAS_DE_LA_FUSION, con el aviso.
    db.agentRun.update.mockReset();
    db.projectTimeline.updateMany.mockReset();
    tlConBorrador(v1({ tareas: { corrida: "run-t", listas: false } }));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    expect(await fusionar()).toEqual({ estado: "perdido" });
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(VUELTAS_DE_LA_FUSION);
    expect(JSON.parse(db.agentRun.update.mock.calls[0][0].data.output).timelineSyncError).toBe(MOTIVO_TAREAS_PERDIDAS);
  });
});
