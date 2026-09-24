/**
 * POST /api/projects/[projectId]/timeline/estructura
 *
 * «Regenerar todo el cronograma» (y «Generar cronograma»), PASO 1 DE 2 — solo cuando el CSE eligió
 * reuniones o pegó notas en el «Contexto del cronograma». Una llamada corta revisa si ese material
 * obliga a cambiar FASES o TIEMPOS y deja los cambios como la misma propuesta de solo estructura
 * que deja el handoff (`pendingProposal`, con `origen: "contexto"`): el CSE la decide uno por uno
 * en el Gantt real y `proposal/apply-items` escribe. Al resolver la última sugerencia, la pantalla
 * sigue sola con el paso 2, el detalle de siempre (`/analyze`), sobre la estructura aceptada.
 *
 * ⛔ ESTA RUTA NO ESCRIBE NINGUNA FASE NI NINGUNA TAREA. Solo la propuesta, y solo si no había otra.
 *
 * Respuestas (la pantalla decide con `pasoTrasEstructura`, lib/timeline/propuesta-de-estructura.ts):
 *   200 { estado: "sin-material" }                        — nada elegido: ni corrida ni modelo
 *                                                           (aunque haya una propuesta pendiente)
 *   200 { estado: "sin-cambios", observaciones, acordadoSinEntrar }
 *                                                         — no hay nada que proponer (lo acordado
 *                                                           que no entró queda en observaciones)
 *   200 { estado: "propuesta", proposal, runId, observaciones }
 *   400 NO_TIMELINE · 403 (sin permiso de IA) · 409 PROPUESTA_PENDIENTE · 500 ESTRUCTURA_FALLO
 *
 * Sin body. Pide la MISMA vara que el paso 2 y que «Pedir cambio con IA» (`guardIaDelCronograma`):
 * dos pasos de una misma acción no pueden pedir permisos distintos.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardTimelineEdit, guardIaDelCronograma } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { ID_ESTRUCTURA_CRONOGRAMA, PROMPT_ESTRUCTURA_CRONOGRAMA } from "@/lib/agents/estructura-cronograma";
import { cargarContextoDeEstructura } from "@/lib/contexto/cargar";
import {
  fotoDeEstructura,
  renderEstructuraDelCronograma,
  tieneMaterialDelCronograma,
} from "@/lib/contexto/estructura-cronograma";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import { construirPropuestaDeEstructura, leerRespuestaDeEstructura } from "@/lib/timeline/propuesta-de-estructura";

/** Cierra la corrida sin poder romper la respuesta que el CSE está esperando. */
async function cerrarCorrida(runId: string, status: "DONE" | "ERROR", output: Record<string, unknown>): Promise<void> {
  await prisma.agentRun
    .update({ where: { id: runId }, data: { status, output: JSON.stringify(output) } })
    .catch(() => {});
}

const PROPUESTA_PENDIENTE = {
  error: "PROPUESTA_PENDIENTE",
  message: "Hay cambios de fases sin revisar: resuélvelos antes de que la IA vuelva a revisar las fases.",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  /* LA FOTO: lo que ve el modelo (calendario con ids, estado y tareas hechas) y lo que valida el
     armador salen de ESTA lectura, no de dos. */
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      anchorStartDate: true,
      closeDateOverride: true,
      pendingProposal: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          startWeek: true,
          sessionCount: true,
          notes: true,
          activityType: true,
          status: true,
          tasks: { select: { status: true, weekIndex: true } },
        },
      },
    },
  });
  if (!tl || tl.phases.length === 0) {
    return NextResponse.json({ error: "NO_TIMELINE", message: "No hay cronograma para revisar." }, { status: 400 });
  }

  // RBAC — la MISMA vara que el paso 2 (el gate del detalle) y que «Pedir cambio con IA».
  const iaGate = await guardIaDelCronograma(tl.id);
  if (iaGate instanceof NextResponse) return iaGate;

  const contexto = await cargarContextoDeEstructura(projectId, fotoDeEstructura(tl));
  /* ⭐ SIN MATERIAL, NADA: ni corrida, ni modelo. «Regenerar todo» sigue exactamente como antes.
     Va ANTES del 409 (revisión del paso A2): con una propuesta del handoff pendiente y nada
     elegido, «Generar cronograma» avisaba «Hay cambios de fases sin revisar… para que la IA revise
     las fases» aunque la IA nunca iba a revisar ninguna. Sin material, sigue con las tareas. */
  if (!tieneMaterialDelCronograma(contexto.fuentes)) {
    return NextResponse.json({ estado: "sin-material" });
  }
  // Una propuesta pendiente (del handoff o de una revisión anterior) no se pisa: primero se decide.
  if (tl.pendingProposal !== null) return NextResponse.json(PROPUESTA_PENDIENTE, { status: 409 });

  const userMessage = renderEstructuraDelCronograma({
    instrucciones: contexto.instrucciones,
    fuentes: contexto.fuentes,
  });

  /* La corrida se crea ANTES del modelo: si Claude falla, queda el registro del intento.
     `agentId: null` porque este revisor NO tiene fila en `Agent` (ver lib/agents/estructura-cronograma.ts). */
  const run = await prisma.agentRun.create({
    data: {
      agentId: null,
      agentSlug: ID_ESTRUCTURA_CRONOGRAMA,
      clientId: guard.clientId,
      projectId,
      status: "RUNNING",
      stepLabel: "Fases y tiempos desde el Contexto del cronograma",
      // Trazabilidad: qué reuniones elegidas le llegaron.
      sourceSessionIds: contexto.sesionesUsadas ?? [],
      triggeredByEmail: await triggeredByEmail(),
    },
    select: { id: true },
  });

  let crudo: unknown;
  try {
    /* ⚠ El wrap va sobre la llamada: sin él la fila de `LlmCall` sale sin agente, sin cliente y sin
       quien apretó el botón, y el tope diario la cobra como gasto automático. */
    const msg = await conContextoDeIA(
      {
        agentSlug: ID_ESTRUCTURA_CRONOGRAMA,
        agentRunId: run.id,
        clientId: guard.clientId,
        projectId,
        triggeredByEmail: await triggeredByEmail(),
        origen: "timeline/estructura",
      },
      () =>
        anthropic.messages.create(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            temperature: 0,
            system: PROMPT_ESTRUCTURA_CRONOGRAMA,
            messages: [{ role: "user", content: userMessage }],
          },
          { timeout: 90_000, maxRetries: 0 },
        ),
    );
    const bloque = msg.content.find((b) => b.type === "text");
    const texto = bloque && bloque.type === "text" ? bloque.text.trim() : "";
    /* Tolera el ```json … ``` (el modelo lo pone aunque se le pida que no), la prosa alrededor y una
       llave de más al cerrar: ver `leerRespuestaDeEstructura`. */
    crudo = leerRespuestaDeEstructura(texto);
    if (crudo === null) throw new Error("respuesta ilegible del modelo");
  } catch (e) {
    console.error("[timeline/estructura] Claude error:", e instanceof Error ? e.message : e);
    await cerrarCorrida(run.id, "ERROR", { error: e instanceof Error ? e.message : "error desconocido" });
    return NextResponse.json(
      { error: "ESTRUCTURA_FALLO", message: "No se pudieron revisar las fases esta vez." },
      { status: 500 },
    );
  }

  // Las MISMAS fases que vio el modelo; el armador descarta todo lo que el prompt prohíbe.
  const armado = construirPropuestaDeEstructura({
    fases: tl.phases,
    crudo,
    anchorISO: tl.anchorStartDate?.toISOString() ?? null,
    huellas: huellasDeFrontera(contexto.materialInterno ?? []),
    ahora: Date.now(),
  });

  if (!armado.propuesta) {
    await cerrarCorrida(run.id, "DONE", {
      desenlace: "sin-cambios",
      observaciones: armado.observaciones,
      descartados: armado.descartados,
      acordadoSinEntrar: armado.acordadoSinEntrar,
    });
    /* `acordadoSinEntrar`: lo acordado que el armador no pudo proponer quedó en las observaciones;
       con eso la pantalla no dice «tus reuniones no piden cambios» (ver `pasoTrasEstructura`). */
    return NextResponse.json({
      estado: "sin-cambios",
      observaciones: armado.observaciones,
      acordadoSinEntrar: armado.acordadoSinEntrar,
    });
  }

  /* ⛔ Solo si NO había otra propuesta: el handoff pudo escribir la suya mientras el modelo
     pensaba, y un update plano la pisaría sin que nadie la viera. */
  const escrita = await prisma.projectTimeline.updateMany({
    where: { id: tl.id, pendingProposal: { equals: Prisma.DbNull } },
    data: {
      pendingProposal: armado.propuesta as unknown as Prisma.InputJsonValue,
      pendingProposalRunId: run.id,
    },
  });
  if (escrita.count === 0) {
    await cerrarCorrida(run.id, "DONE", { desenlace: "pisada", deltas: armado.deltas.length });
    return NextResponse.json(PROPUESTA_PENDIENTE, { status: 409 });
  }

  await cerrarCorrida(run.id, "DONE", {
    desenlace: "propuesta",
    crudo,
    deltas: armado.deltas.map((d) => d.key),
    descartados: armado.descartados,
    observaciones: armado.observaciones,
  });
  return NextResponse.json({
    estado: "propuesta",
    proposal: armado.propuesta,
    runId: run.id,
    observaciones: armado.observaciones,
  });
}
