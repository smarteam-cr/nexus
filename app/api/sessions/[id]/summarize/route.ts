import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { summarizeTranscript } from "@/lib/ai/summarize-session";

// POST /api/sessions/[id]/summarize — genera resumen con IA para una sesión
export const POST = withAuth(async (_req, ctx) => {
  const { id } = await ctx.params;

  const session = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true, title: true, transcript: true },
  });

  if (!session) return apiError("not_found", 404);
  if (!session.transcript) return apiError("no_transcript", 400);

  const summary = await summarizeTranscript(session.title, session.transcript);

  if (!summary) return apiError("summarization_failed", 500);

  await prisma.firefliesSession.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { summary: summary as any },
  });

  return NextResponse.json({ summary });
});
