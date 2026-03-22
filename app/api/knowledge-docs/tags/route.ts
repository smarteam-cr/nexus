import { NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tags = await prisma.knowledgeTag.findMany({
    orderBy: [{ category: "asc" }, { label: "asc" }],
    include: { _count: { select: { documents: true } } },
  });

  return NextResponse.json(tags);
}
