/**
 * GET /api/business-cases/[id]/blocks → lista los bloques del caso (en orden).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { getBlocks } from "@/lib/business-cases";

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
