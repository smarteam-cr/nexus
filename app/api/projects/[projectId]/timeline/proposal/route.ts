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
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, pendingProposalRunId: true },
  });
  if (!existing) {
    return NextResponse.json({ cleared: false, reason: "no_timeline" }, { status: 404 });
  }

  // Tanda M — el auto-descarte (0 deltas visibles tras reconciliar) es esperado en dos casos
  // benignos (propuesta vieja de antes del guard de no-op, o el CSE ya igualó el cronograma a
  // mano) — no amerita un toast. Pero antes no dejaba NINGÚN rastro de cuándo pasó ni de qué
  // corrida: si algún día una propuesta con contenido real se evapora acá, esto es lo único
  // que permite reconstruir cuál era.
  const body = (await req.json().catch(() => null)) as { reason?: string; runId?: unknown } | null;
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
  if (body?.reason === "auto-zero-deltas") {
    console.log(
      `[timeline] propuesta auto-descartada sin deltas visibles (project ${projectId}, run ${existing.pendingProposalRunId ?? "?"}).`,
    );
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
