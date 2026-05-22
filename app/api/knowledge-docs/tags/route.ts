import { NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

// Tags cambian raramente. ISR 10 min. Cuando se cree un tag nuevo,
// el endpoint creador debe llamar revalidatePath("/api/knowledge-docs/tags").
export const revalidate = 600;

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
