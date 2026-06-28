/**
 * GET  /api/business-cases/[id]/blocks → lista los bloques del caso (en orden).
 * POST /api/business-cases/[id]/blocks → recrea un bloque (deshacer un delete del editor).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { getBlocks, recreateBlock, BlockRecreateBody } from "@/lib/business-cases";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const blocks = await getBlocks(id);
  return NextResponse.json({ blocks });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BlockRecreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos del bloque inválidos" }, { status: 400 });
  }
  const block = await recreateBlock(id, parsed.data);
  return NextResponse.json({ block }, { status: 201 });
}
