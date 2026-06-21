/**
 * /api/projects/[projectId]/handoff-sources/[id]
 *
 *   DELETE → soft-delete (deletedAt) de una fuente manual del handoff. Se conserva la
 *   fila para auditoría; el read (GET + el agente) filtra deletedAt:null.
 *
 * Guarded con guardProjectHandoffAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  // Verificar que la fuente pertenece a ESTE proyecto antes de borrarla.
  const src = await prisma.handoffSource.findFirst({
    where: { id, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!src) {
    return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });
  }

  await prisma.handoffSource.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
