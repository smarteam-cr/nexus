/**
 * DELETE /api/business-cases/[id]/transcript/[transcriptId]
 *
 * Borra una fuente manual del caso (pegada, subida o URL). Para archivos subidos,
 * intenta borrar también el objeto de Storage (best-effort — la fila manda).
 * Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getStorageClient, BUCKET_NAME } from "@/lib/storage/client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; transcriptId: string }> },
) {
  const { id, transcriptId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const row = await prisma.businessCaseTranscript.findFirst({
    where: { id: transcriptId, businessCaseId: id },
    select: { id: true, source: true, fileUrl: true },
  });
  if (!row) return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });

  // Archivo subido → borrar el objeto del bucket privado (paths de Storage, no http).
  if (row.source === "UPLOADED" && row.fileUrl && !row.fileUrl.startsWith("http")) {
    const storage = getStorageClient();
    if (storage) {
      await storage.storage.from(BUCKET_NAME).remove([row.fileUrl]).catch(() => {});
    }
  }

  await prisma.businessCaseTranscript.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
