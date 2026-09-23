/**
 * /api/projects/[projectId]/timeline/sources/[id]
 *
 *   DELETE → borrado SUAVE (deletedAt) de una nota del cronograma. La fila queda para auditoría;
 *   la pantalla y el agente filtran `deletedAt: null`.
 *
 * `guardTimelineEdit` y no `guardTimelineDelete`: borrar una nota que uno mismo pegó es parte de
 * curar el contexto (lo hace el CSE), no borrar el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  // La nota tiene que ser de ESTE proyecto: sin esto, un id ajeno se borraría con el guard de otro.
  const nota = await prisma.timelineSource.findFirst({
    where: { id, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!nota) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });

  await prisma.timelineSource.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
