/**
 * /api/marketing/runs/[id] — status de una corrida (para el polling del front).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const run = await prisma.marketingRun.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      trigger: true,
      status: true,
      phase: true,
      newPostsCount: true,
      fetchedPostsCount: true,
      sourcesOkCount: true,
      sourcesErrorCount: true,
      contentIdeasCount: true,
      campaignIdeasCount: true,
      pillarSuggestionsCount: true,
      error: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  if (!run) return NextResponse.json({ error: "La corrida no existe" }, { status: 404 });
  return NextResponse.json({ run });
}
