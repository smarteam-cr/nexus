import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

// GET /api/sessions/[id] — transcript lazy load
export const GET = withAuth(async (_req, ctx) => {
  const { id } = await ctx.params;

  const session = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true, transcript: true, summary: true },
  });

  if (!session) return apiError("not_found", 404);
  return NextResponse.json(session);
});

// PATCH /api/sessions/[id] — asignación manual de cliente
export const PATCH = withAuth(async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json() as { manualClientId?: string | null };

  const session = await prisma.firefliesSession.update({
    where: { id },
    data: { manualClientId: body.manualClientId ?? null },
    select: { id: true, manualClientId: true },
  });

  return NextResponse.json(session);
});
