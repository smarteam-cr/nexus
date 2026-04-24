import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { summarizeTranscript } from "@/lib/ai/summarize-session";

const BATCH = 3; // llamadas paralelas a Claude (evitar rate limit)

/**
 * POST /api/integrations/summarize
 * Genera resúmenes con AI para todas las sesiones que tienen transcript
 * pero no tienen summary todavía.
 *
 * Query params:
 *   ?source=google_meet  — solo sesiones Meet (default)
 *   ?source=all          — todas las fuentes
 */
export const POST = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") ?? "google_meet";

  const sessions = await prisma.firefliesSession.findMany({
    where: {
      ...(source !== "all" && { source }),
      transcript: { not: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summary: null as any,
    },
    select: { id: true, title: true, transcript: true },
    orderBy: { date: "desc" },
  });

  console.log(`[summarize] ${sessions.length} sesiones sin resumen (source=${source})`);

  let summarized = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < sessions.length; i += BATCH) {
    const batch = sessions.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (s) => {
        if (!s.transcript) { skipped++; return; }
        try {
          const summary = await summarizeTranscript(s.title, s.transcript);
          if (summary) {
            await prisma.firefliesSession.update({
              where: { id: s.id },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: { summary: summary as any },
            });
            summarized++;
            console.log(`[summarize] ✓ "${s.title}"`);
          } else {
            skipped++;
            console.log(`[summarize] Sin resultado para "${s.title}"`);
          }
        } catch (err) {
          errors++;
          console.error(`[summarize] Error "${s.title}":`, err instanceof Error ? err.message : err);
        }
      })
    );
  }

  console.log(`[summarize] Completado: ${summarized} resumidos, ${skipped} sin cambio, ${errors} errores`);
  return NextResponse.json({ summarized, skipped, errors, total: sessions.length });
});
