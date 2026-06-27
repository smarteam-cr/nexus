/**
 * GET /api/business-cases/[id]/external-access
 *
 * Estado del acceso público del caso (token + contraseña en claro para que el
 * vendedor lo comparta + estado de revocación). Nunca devuelve el passwordHash.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

function buildVerifyUrl(req: NextRequest, token: string): string {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base}/external/business-case/verify/${token}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const access = await prisma.businessCaseExternalAccess.findUnique({
    where: { businessCaseId: id },
    select: {
      accessToken: true,
      accessPassword: true,
      enabledAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  });
  if (!access) {
    return NextResponse.json({ exists: false });
  }
  return NextResponse.json({
    exists: true,
    accessToken: access.accessToken,
    accessPassword: access.accessPassword,
    url: buildVerifyUrl(req, access.accessToken),
    enabledAt: access.enabledAt,
    revokedAt: access.revokedAt,
    lastUsedAt: access.lastUsedAt,
  });
}
