/**
 * DELETE /api/sales/exploraciones/[id]/documentos/[documentoId] — quitar una sesión o un documento
 * sumado a mano. Lo que el agente ya propuso con él queda: lo usa o lo descarta el vendedor.
 * Pide `ventas.write`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { borrarDocumento } from "@/lib/exploraciones/documentos";

type Ctx = { params: Promise<{ id: string; documentoId: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, documentoId } = await params;
  const guard = await guardPermission("ventas", "write");
  if (guard instanceof NextResponse) return guard;
  const ok = await borrarDocumento(id, documentoId);
  if (!ok) return NextResponse.json({ error: "Ese documento ya no está." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
