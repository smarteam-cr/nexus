/**
 * /api/projects/[projectId]/contexto/[pieza]/notas/[id]
 *
 *   DELETE → borrado SUAVE (deletedAt) de una nota del contexto de un documento. La fila queda para
 *   auditoría; la pantalla y el agente filtran `deletedAt: null`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { documentoConContexto } from "@/lib/contexto/documento";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; pieza: string; id: string }> },
) {
  const { projectId, pieza, id } = await params;
  const doc = documentoConContexto(pieza);
  if (!doc) return NextResponse.json({ error: "Este documento no tiene contexto propio." }, { status: 404 });
  const guard = await guardContextoDelDocumento(projectId, doc.seccion);
  if (guard instanceof NextResponse) return guard;

  // La nota tiene que ser de ESTE proyecto y de ESTE documento: sin esto, un id ajeno se borraría.
  const nota = await prisma.notaDeContexto.findFirst({
    where: { id, projectId, pieza: doc.pieza, deletedAt: null },
    select: { id: true },
  });
  if (!nota) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });

  await prisma.notaDeContexto.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
