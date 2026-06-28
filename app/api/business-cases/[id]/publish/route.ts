/**
 * POST /api/business-cases/[id]/publish
 *
 * Congela el snapshot client-safe del CANVAS ACTIVO (secciones + bloques
 * CONFIRMED, en orden), setea publishedAt y asegura el acceso (token+password).
 * Exige ≥1 transcript/sesión (que haya canvas) y ≥1 bloque CONFIRMED. Devuelve el
 * link + la contraseña. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { ensureAccess } from "@/lib/business-cases";

function buildVerifyUrl(req: NextRequest, token: string): string {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base}/external/business-case/verify/${token}`;
}

/** Un `data` estructurado está "en blanco" si todos sus strings/arrays lo están. */
function dataIsBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(dataIsBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(dataIsBlank);
  return false;
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
    select: { id: true, name: true, client: { select: { name: true, logoUrl: true } } },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }

  const canvas = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, isActive: true },
    select: { id: true },
  });
  if (!canvas) {
    return NextResponse.json({ error: "Generá el business case antes de publicar." }, { status: 400 });
  }

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      key: true,
      label: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true },
      },
    },
  });
  // Solo las secciones con contenido REAL: los bloques sembrados vacíos también son
  // CONFIRMED, así que filtramos el placeholder en blanco (si no, se publicaría vacío).
  const filled = sections.filter((s) =>
    s.blocks.some((b) => !dataIsBlank(b.data) || (b.content ?? "").trim() !== ""),
  );
  if (filled.length === 0) {
    return NextResponse.json(
      { error: "Generá o escribí contenido antes de subir al cliente." },
      { status: 400 },
    );
  }

  const snapshot = {
    name: bc.name,
    clientName: bc.client.name,
    clientLogoUrl: bc.client.logoUrl,
    sections: filled.map((s) => ({ key: s.key, label: s.label, blocks: s.blocks })),
  };

  await prisma.businessCase.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  const access = await ensureAccess(id, guard.user.email ?? null);
  return NextResponse.json({
    published: true,
    accessToken: access.accessToken,
    password: access.accessPassword,
    url: buildVerifyUrl(req, access.accessToken),
  });
}
