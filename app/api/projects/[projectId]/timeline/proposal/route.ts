/**
 * DELETE /api/projects/[projectId]/timeline/proposal
 *
 * Descarta la propuesta pendiente de re-generación del cronograma (la que guarda
 * `persistTimelineFromAgentOutput` cuando el agente re-corre sobre un proyecto que YA
 * tiene timeline). NO toca el cronograma: solo limpia `pendingProposal`/`pendingProposalRunId`.
 *
 * Cuerpo opcional: `{ reason?, runId? }`. Con `runId` (la corrida de la propuesta que la pantalla
 * tiene enfrente), solo se limpia si la guardada es esa: 409 `otra_propuesta` si no.
 *
 * "Aplicar" la propuesta es POST /timeline/borrador/aplicar (desde el 2026-09-24: el PUT con
 * motivo ya NO la limpia, responde 409 mientras haya una abierta); "Descartar" no debe escribir el
 * cronograma, por eso este sub-recurso dedicado.
 *
 * Guarded con guardProjectHandoffAccess (interno/CSE).
 *
 * Revisión de E4 (#1, #2): lo guardado que NO es un `borrador-v1` (esta versión no lo sabe leer; por ejemplo,
 * las viejas en el rato entre el deploy de E4 y su conversión) no se tira sin rastro: en la MISMA transacción
 * que lo limpia queda una copia del JSON en `TimelineChange` (kind MANUAL, `snapshot.propuestaDescartada`). Y
 * si la pantalla descarta lo ilegible (`ilegible: true`) pero lo guardado ya es un v1 (se convirtió en el
 * medio, con el mismo token), responde 409 y no borra: la pantalla trae la convertida.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { leerEstadoDeLasTareas } from "@/lib/timeline/borrador-del-detalle";
/* La razón del registro que guarda la copia de lo descartado sin poder leerlo vive en lib (una ruta de Next solo
   exporta sus métodos): la cartera la excluye del porqué de un atraso (revisión de los arreglos). */
import { esBorradorV1, RAZON_DESCARTE_ILEGIBLE } from "@/lib/timeline/borrador";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, pendingProposalRunId: true, pendingProposal: true },
  });
  if (!existing) {
    return NextResponse.json({ cleared: false, reason: "no_timeline" }, { status: 404 });
  }

  // Tanda M — el auto-descarte (0 deltas visibles tras reconciliar) es esperado en dos casos
  // benignos (propuesta vieja de antes del guard de no-op, o el CSE ya igualó el cronograma a
  // mano) — no amerita un toast. Pero antes no dejaba NINGÚN rastro de cuándo pasó ni de qué
  // corrida: si algún día una propuesta con contenido real se evapora acá, esto es lo único
  // que permite reconstruir cuál era.
  const body = (await req.json().catch(() => null)) as { reason?: string; runId?: unknown; ilegible?: unknown } | null;
  /* ⛔ Se descarta la propuesta que la pantalla tiene enfrente, no otra (revisión adversarial,
     2026-09-24). El DELETE era incondicional: descartar una propuesta del modificador (que vive solo
     en memoria) o una vieja borraba la que estaba guardada —por ejemplo, las sugerencias de fases
     de las reuniones a medio decidir—. Con `runId` en el cuerpo, solo se limpia si es esa. */
  if (body && "runId" in body) {
    const vista = typeof body.runId === "string" && body.runId ? body.runId : null;
    if (vista !== (existing.pendingProposalRunId ?? null)) {
      return NextResponse.json({ cleared: false, reason: "otra_propuesta" }, { status: 409 });
    }
  }
  /* Revisión de E4 (#2): la pantalla descarta lo que no sabe leer, pero lo guardado ya es un v1 (la conversión
     corrió en el medio y conserva el token): no es lo que tiene enfrente. No se borra; la pantalla lo trae. */
  const guardadoEsV1 = esBorradorV1(existing.pendingProposal);
  if (body?.ilegible === true && guardadoEsV1) {
    return NextResponse.json({ cleared: false, reason: "otra_propuesta" }, { status: 409 });
  }
  if (body?.reason === "auto-zero-deltas") {
    /* ⛔ E2a: un borrador que ESPERA sus tareas («faltan» o «armando») está vacío todavía, pero se
       va a llenar. El descarte automático de una pestaña de E1 lo borraría y la corrida pagada del
       paso 2 se perdería: el servidor lo frena. Un v1 vacío cuya corrida falló sí se descarta (no
       queda nada que esperar).
       ⛔ 423 y NO 409 (revisión de E2a): la pestaña de E1 trata todo 409 como «otra propuesta» y la
       vuelve a traer; con el mismo v1 vacío en pantalla, su efecto mandaba otro DELETE, en bucle
       durante toda la corrida. Con 423 la suelta en memoria y no la vuelve a pedir; acá no se escribe. */
    const tareas = await leerEstadoDeLasTareas(existing.pendingProposal);
    if (tareas?.estado === "faltan" || tareas?.estado === "armando") {
      return NextResponse.json({ cleared: false, reason: "tareas_pendientes" }, { status: 423 });
    }
    console.log(
      `[timeline] propuesta auto-descartada sin deltas visibles (project ${projectId}, run ${existing.pendingProposalRunId ?? "?"}).`,
    );
  }

  /* Revisión de E4 (#1): lo que no es un v1 se limpia SOLO si sigue siendo el mismo JSON que se leyó, y en la
     misma transacción queda su copia (quién y cuándo). Sin eso, «Descartarla» lo tiraba sin rastro. */
  const noSeSabeLeer = existing.pendingProposal !== null && !guardadoEsV1;
  if (noSeSabeLeer) {
    const conCopia = await prisma.$transaction(async (tx) => {
      const r = await tx.projectTimeline.updateMany({
        where: {
          projectId,
          pendingProposalRunId: existing.pendingProposalRunId,
          pendingProposal: { equals: existing.pendingProposal as Prisma.InputJsonValue },
        },
        data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null },
      });
      if (r.count === 0) return 0;
      await tx.timelineChange.create({
        data: {
          timelineId: existing.id,
          kind: "MANUAL",
          reason: RAZON_DESCARTE_ILEGIBLE,
          changedByEmail: guard.user.email ?? null,
          snapshot: {
            propuestaDescartada: existing.pendingProposal,
            pendingProposalRunId: existing.pendingProposalRunId,
          } as Prisma.InputJsonValue,
        },
      });
      return r.count;
    });
    if (conCopia === 0) {
      return NextResponse.json({ cleared: false, reason: "otra_propuesta" }, { status: 409 });
    }
    return NextResponse.json({ cleared: true });
  }

  /* Condicionado a la MISMA corrida que se leyó: si otra propuesta entró en el medio, no se borra. */
  const limpiadas = await prisma.projectTimeline.updateMany({
    where: { projectId, pendingProposalRunId: existing.pendingProposalRunId },
    data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null },
  });
  if (limpiadas.count === 0) {
    return NextResponse.json({ cleared: false, reason: "otra_propuesta" }, { status: 409 });
  }

  return NextResponse.json({ cleared: true });
}
