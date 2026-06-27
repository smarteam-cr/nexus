/**
 * /api/business-cases/[id]/blocks/[blockId]
 *   PUT { content? | isVisible? | status? | undo? } → edición granular
 *   DELETE → elimina el bloque
 *
 * Mismo patrón que CanvasBlock: undo de 1 nivel, MODIFIED si un humano edita un
 * bloque AGENT, confirmedAt/By al confirmar. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { editBlock, deleteBlock, BlockEditBody } from "@/lib/business-cases";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { blockId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BlockEditBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const updated = await editBlock(blockId, parsed.data, guard.user.email ?? null);
  if (!updated) {
    return NextResponse.json({ error: "Bloque no existe" }, { status: 404 });
  }
  return NextResponse.json({ block: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { blockId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  await deleteBlock(blockId).catch(() => {});
  return NextResponse.json({ ok: true });
}
