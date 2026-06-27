/**
 * POST /api/business-cases/[id]/publish
 *
 * Congela el snapshot client-safe (bloques CONFIRMED + visibles), setea
 * publishedAt y asegura el acceso (token+password). Exige ≥1 transcript y ≥1
 * bloque CONFIRMED visible. Devuelve el link + la contraseña para compartir.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { publishBusinessCase } from "@/lib/business-cases";

function buildVerifyUrl(req: NextRequest, token: string): string {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base}/external/business-case/verify/${token}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { id: true, _count: { select: { transcripts: true } } },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }
  if (bc._count.transcripts === 0) {
    return NextResponse.json(
      { error: "Agregá al menos un transcript antes de publicar." },
      { status: 400 },
    );
  }

  const confirmedVisible = await prisma.businessCaseBlock.count({
    where: { businessCaseId: id, status: "CONFIRMED", isVisible: true },
  });
  if (confirmedVisible === 0) {
    return NextResponse.json(
      { error: "Confirmá al menos un bloque visible antes de publicar." },
      { status: 400 },
    );
  }

  const access = await publishBusinessCase(id, guard.user.email ?? null);
  return NextResponse.json({
    published: true,
    accessToken: access.accessToken,
    password: access.accessPassword,
    url: buildVerifyUrl(req, access.accessToken),
  });
}
