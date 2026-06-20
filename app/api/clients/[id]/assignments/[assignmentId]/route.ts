import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardCapability } from "@/lib/auth/api-guards";

/**
 * DELETE /api/clients/[id]/assignments/[assignmentId]
 *
 * Quita un assignment (des-compartir / quitar el override). Gateado por
 * `shareClients`. Verifica que el assignment pertenezca a este cliente.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const guard = await guardCapability("shareClients");
  if (guard instanceof NextResponse) return guard;
  const { id, assignmentId } = await params;

  const existing = await prisma.clientAssignment.findUnique({
    where: { id: assignmentId },
    select: { clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  await prisma.clientAssignment.delete({ where: { id: assignmentId } });
  return NextResponse.json({ ok: true });
}
