/**
 * POST /api/projects/[projectId]/timeline/estructura
 *
 * «Regenerar todo el cronograma» (y «Generar cronograma»), PASO 1 DE 2 — solo cuando el CSE eligió
 * reuniones, pegó notas o escribió «Instrucciones adicionales» en el «Contexto del cronograma» (las
 * instrucciones solas cuentan desde el 2026-09-24). Una llamada corta revisa si ese material
 * obliga a cambiar FASES o TIEMPOS y deja los cambios como la propuesta del cronograma
 * (`pendingProposal`, con `origen: "contexto"`): el CSE la revisa en la barra de arriba del Gantt y
 * POST /timeline/borrador/aplicar escribe (desde E1, 2026-09-24; antes, uno por uno con
 * `proposal/apply-items`).
 * ⭐ Desde E2a (2026-09-25) la escribe como `borrador-v1` (`borradorBase`: las fases nuevas con su
 * clave `n:…`, el pedido deducido de las tareas de hoy y «esperando las tareas»), y la pantalla NO
 * espera al CSE: pide enseguida el paso 2 (`/analyze` con `borrador: { token: runId, version: 0 }`),
 * que arma las tareas sobre la estructura PROPUESTA y las suma a ESTA misma propuesta.
 *
 * ⛔ ESTA RUTA NO ESCRIBE NINGUNA FASE NI NINGUNA TAREA. Solo la propuesta, y solo si no había otra.
 *
 * Respuestas (la pantalla decide con `pasoTrasEstructura`, lib/timeline/propuesta-de-estructura.ts):
 *   200 { estado: "sin-material" }                        — nada elegido ni instrucciones: ni corrida ni modelo
 *                                                           (aunque haya una propuesta pendiente)
 *   200 { estado: "sin-cambios", observaciones, acordadoSinEntrar }
 *                                                         — no hay nada que proponer (lo acordado
 *                                                           que no entró queda en observaciones);
 *                                                           sin propuesta: el paso 2 crea la suya
 *   200 { estado: "propuesta", proposal, runId, observaciones } — `proposal` es el `borrador-v1`
 *   400 NO_TIMELINE · 403 (sin permiso de IA) · 409 PROPUESTA_PENDIENTE · 409 ESTRUCTURA_EN_CURSO
 *   (ya corre otro paso 1 de este proyecto, de hace menos de 3 minutos) · 500 ESTRUCTURA_FALLO
 * Si el material trae un plazo total, una de las `observaciones` es la del SISTEMA (`fraseDelPlazo`):
 * el modelo solo devuelve la semana en que vence; la comparación con el cierre la hace el código.
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
  cierreActualDelPlan,
  fotoDeEstructura,
  hayQueRevisarLasFases,
  renderEstructuraDelCronograma,
} from "@/lib/contexto/estructura-cronograma";
import { claveConVozDeHandoffPropia } from "@/lib/timeline/semana-cero";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import {
  AVISO_PROPUESTA_PENDIENTE,
  construirPropuestaDeEstructura,
  errorDeLaRevisionDeFases,
  leerRespuestaDeEstructura,
  MENSAJE_ESTRUCTURA_EN_CURSO,
} from "@/lib/timeline/propuesta-de-estructura";
import { borradorBase, pedidoDelCronograma, type Vivo } from "@/lib/timeline/borrador";

/** Un paso 1 de este proyecto que empezó hace menos que esto se considera en curso (el modelo tiene
 *  90 s de tope; una corrida que quedó RUNNING porque el proceso murió deja de frenar pasado esto). */
const VENTANA_DEL_PASO_1_EN_CURSO_MS = 3 * 60_000;

/** Cierra la corrida sin poder romper la respuesta que el CSE está esperando. */
async function cerrarCorrida(runId: string, status: "DONE" | "ERROR", output: Record<string, unknown>): Promise<void> {
  await prisma.agentRun
    .update({ where: { id: runId }, data: { status, output: JSON.stringify(output) } })
    .catch(() => {});
}

/* E2a: la propuesta abierta puede traer también tareas; la frase es la misma que ve la pantalla. */
const PROPUESTA_PENDIENTE = {
  error: "PROPUESTA_PENDIENTE",
  message: AVISO_PROPUESTA_PENDIENTE,
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
          // `source`: el pedido del borrador («regenerar» si ya hay tareas de la IA, si no «primera»).
          tasks: { select: { status: true, weekIndex: true, source: true } },
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

  /* UNA foto y UN reloj para el calendario que lee el modelo y para el armador: el plazo total se
     compara contra el MISMO «CIERRE ACTUAL» que leyó el modelo (depende de hoy). */
  const foto = fotoDeEstructura(tl);
  const ahora = Date.now();
  const contexto = await cargarContextoDeEstructura(projectId, foto, ahora);
  /* ⭐ SIN MATERIAL NI INSTRUCCIONES, NADA: ni corrida, ni modelo. «Regenerar todo» sigue exactamente
     como antes. Va ANTES del 409 (revisión del paso A2): con una propuesta del handoff pendiente y
     nada elegido, «Generar cronograma» avisaba «Hay cambios de fases sin revisar… para que la IA
     revise las fases» aunque la IA nunca iba a revisar ninguna. Las «Instrucciones adicionales»
     solas SÍ cuentan (revisión adversarial, 2026-09-24): son la fuente de más peso. */
  if (!hayQueRevisarLasFases(contexto)) {
    return NextResponse.json({ estado: "sin-material" });
  }
  // Una propuesta pendiente (del handoff o de una revisión anterior) no se pisa: primero se decide.
  if (tl.pendingProposal !== null) return NextResponse.json(PROPUESTA_PENDIENTE, { status: 409 });

  /* E2a: el paso 1 ya no bloquea la pantalla, así que otra pestaña (u otra persona) puede pedirlo
     mientras corre uno: dos corridas pagadas para UNA propuesta (la segunda chocaría en el
     `updateMany`). Con uno de este proyecto empezado hace menos de 3 minutos, no se paga otro. Con el
     MISMO reloj que el calendario y el armador (`ahora`). */
  const pasoEnCurso = await prisma.agentRun.findFirst({
    where: {
      projectId,
      agentSlug: ID_ESTRUCTURA_CRONOGRAMA,
      status: "RUNNING",
      createdAt: { gte: new Date(ahora - VENTANA_DEL_PASO_1_EN_CURSO_MS) },
    },
    select: { id: true },
  });
  if (pasoEnCurso) {
    return NextResponse.json({ error: "ESTRUCTURA_EN_CURSO", message: MENSAJE_ESTRUCTURA_EN_CURSO }, { status: 409 });
  }

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
    /* ⛔ `error` es lo que el centro de corridas le muestra al CSE (`parseRunError`): la frase de
       la pantalla con la causa en tuteo, nunca el crudo del SDK. El crudo, en `detalle`. */
    await cerrarCorrida(run.id, "ERROR", {
      error: errorDeLaRevisionDeFases(e),
      detalle: e instanceof Error ? e.message : "error desconocido",
    });
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
    ahora,
    /* Desarrollo y Web no tienen Semana 0: su primera fase es trabajo real. La MISMA decisión que
       nombra la Semana 0 en el calendario que leyó el modelo (cargarContextoDeEstructura). */
    conSemanaCero: !claveConVozDeHandoffPropia(contexto.pipelineKey ?? null),
    /* ⭐ El plazo total lo compara el SISTEMA (medido en vivo 2026-09-24: el modelo invertía la
       dirección 6 de 6): contra el cierre actual del calendario que leyó, misma foto y mismo reloj. */
    cierreActual: cierreActualDelPlan(foto, ahora)?.semana ?? null,
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

  /* E2a: la propuesta nace como `borrador-v1`, con los `desde` fijados contra la MISMA lectura que vio
     el modelo (`tl`), las fases nuevas con su clave `n:…` y esperando las tareas del paso 2 (que la
     pantalla pide enseguida con este token). El pedido sale de las tareas de hoy: «regenerar» si ya hay
     de la IA, si no «primera» (la razón de la auditoría al aplicar). */
  const vivo: Vivo = {
    ancla: tl.anchorStartDate?.toISOString() ?? null,
    fases: tl.phases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType ?? null,
    })),
  };
  const borrador = borradorBase({
    propuesta: armado.propuesta,
    vivo,
    pedido: pedidoDelCronograma(tl.phases.flatMap((f) => f.tasks)),
  });

  /* ⛔ Solo si NO había otra propuesta: el handoff pudo escribir la suya mientras el modelo
     pensaba, y un update plano la pisaría sin que nadie la viera. */
  const escrita = await prisma.projectTimeline.updateMany({
    where: { id: tl.id, pendingProposal: { equals: Prisma.DbNull } },
    data: {
      pendingProposal: borrador as unknown as Prisma.InputJsonValue,
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
  // `proposal` es lo GUARDADO (el v1) y `runId` su token: la pantalla lo muestra y pide sus tareas.
  return NextResponse.json({
    estado: "propuesta",
    proposal: borrador,
    runId: run.id,
    observaciones: armado.observaciones,
  });
}
