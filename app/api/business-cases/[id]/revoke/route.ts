/**
 * POST /api/business-cases/[id]/revoke
 *
 * Revoca el acceso público (marca revokedAt, no borra el row) y despublica
 * (publishedAt = null). El chokepoint deniega en el render siguiente.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { revokeBusinessCase } from "@/lib/business-cases";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  await revokeBusinessCase(id);
  return NextResponse.json({ revoked: true });
}
