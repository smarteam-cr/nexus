import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

// Tags cambian raramente. ISR 10 min. Cuando se cree un tag nuevo,
// el endpoint creador debe llamar revalidatePath("/api/knowledge-docs/tags").
export const revalidate = 600;

export const GET = withAuth(async () => {
  const tags = await prisma.knowledgeTag.findMany({
    orderBy: [{ category: "asc" }, { label: "asc" }],
    include: { _count: { select: { documents: true } } },
  });

  return NextResponse.json(tags);
});
