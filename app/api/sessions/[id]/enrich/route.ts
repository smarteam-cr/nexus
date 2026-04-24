import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { enrichSingleSession } from "@/lib/google/meet-enrichment";
import { prisma } from "@/lib/db/prisma";

// POST /api/sessions/[id]/enrich — re-enriquece una sesión individual
export const POST = withAuth(async (_req, ctx) => {
  const { id } = await ctx.params;

  const exists = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return apiError("not_found", 404);

  const found = await enrichSingleSession(id);

  // Devolver el transcript actualizado para que el cliente lo muestre sin recargar
  const updated = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true, transcript: true, summary: true, enrichedAt: true },
  });

  return NextResponse.json({ found, ...updated });
});
