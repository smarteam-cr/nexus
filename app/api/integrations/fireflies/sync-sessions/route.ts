import { NextRequest, NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

const MAX_TRANSCRIPT_CHARS = 8000;

async function fetchSessionDetail(
  apiKey: string,
  id: string
): Promise<{
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
  summary: { keywords?: string[]; overview?: string | null; action_items?: string | null } | null;
  transcript: string | null;
} | null> {
  try {
    const query = `{
      transcript(id: "${id}") {
        id title date duration participants
        summary { keywords overview action_items }
        sentences { text speaker_name }
      }
    }`;
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        transcript?: {
          id: string;
          title: string;
          date: number;
          duration: number;
          participants: string[];
          summary?: {
            keywords?: string[];
            overview?: string | null;
            action_items?: string | null;
          } | null;
          sentences?: { text: string; speaker_name: string }[];
        };
      };
    };
    const t = data.data?.transcript;
    if (!t) return null;

    // Construir transcript concatenando sentences
    const transcriptText = (t.sentences ?? [])
      .map((s) => `${s.speaker_name}: ${s.text}`)
      .join("\n")
      .slice(0, MAX_TRANSCRIPT_CHARS);

    return {
      id: t.id,
      title: t.title ?? "",
      date: t.date,
      duration: t.duration ?? 0,
      participants: t.participants ?? [],
      summary: t.summary
        ? {
            keywords: t.summary.keywords,
            overview: t.summary.overview,
            action_items: t.summary.action_items,
          }
        : null,
      transcript: transcriptText.trim() || null,
    };
  } catch {
    return null;
  }
}

export const POST = withAuth(async (req: NextRequest) => {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return apiError("no_key", 503);

  const body = await req.json().catch(() => ({})) as { ids?: string[] };
  const ids = body?.ids ?? [];

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("ids_required", 400);
  }

  let synced = 0;

  for (const id of ids) {
    const detail = await fetchSessionDetail(apiKey, id);
    if (!detail) continue;

    await prisma.firefliesSession.upsert({
      where: { id: detail.id },
      update: {
        title: detail.title,
        date: new Date(detail.date),
        duration: detail.duration,
        participants: detail.participants,
        summary: detail.summary ?? undefined,
        transcript: detail.transcript,
      },
      create: {
        id: detail.id,
        title: detail.title,
        date: new Date(detail.date),
        duration: detail.duration,
        participants: detail.participants,
        summary: detail.summary ?? undefined,
        transcript: detail.transcript,
      },
    });
    synced++;
  }

  return NextResponse.json({ synced });
});
