import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { normalize } from "@/lib/utils/matching";
import { extractTitleTerms } from "@/lib/utils/matching";
import { tokenizeTitle, extractEmail } from "@/lib/fireflies/sync";
import type { RawTranscript } from "@/lib/fireflies/sync";
import { enrichClient } from "@/lib/matching/enrichment";
import { sessionMatchesClient } from "@/lib/matching/cascade";
import type { EnrichedClientMatcher } from "@/lib/matching/cascade";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

export interface SessionItem {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
  organizerEmail: string | null;
  firefliesUrl: string;
}

// ── Fireflies: obtener una página de transcripts ──────────────────────────────

async function fetchFirefliesPage(
  apiKey: string,
  skip: number,
  retries = 2
): Promise<RawTranscript[]> {
  try {
    const query = `{ transcripts(limit: 50, skip: ${skip}) { id title date duration participants } }`;
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { transcripts?: RawTranscript[] };
      errors?: { code?: string; message?: string }[];
    };

    const rateLimitErr = data.errors?.find((e) => e.code === "too_many_requests");
    if (rateLimitErr) {
      if (retries <= 0) return [];
      const match = rateLimitErr.message?.match(/retry after (.+?)\s*\(UTC\)/i);
      let waitMs = 3000;
      if (match) {
        const retryAt = new Date(match[1] + " UTC").getTime();
        waitMs = Math.max(500, Math.min(retryAt - Date.now() + 500, 15000));
      }
      console.log(`[sessions] 429 en skip=${skip}, esperando ${waitMs}ms…`);
      await new Promise((r) => setTimeout(r, waitMs));
      return fetchFirefliesPage(apiKey, skip, retries - 1);
    }

    if (data.errors?.length) console.error("[sessions] Fireflies error:", data.errors);
    return data.data?.transcripts ?? [];
  } catch {
    return [];
  }
}

// ── Fireflies: buscar transcripts por lotes en paralelo ──────────────────────

async function fetchMatchingTranscripts(
  apiKey: string,
  matchFn: (t: RawTranscript) => boolean,
  maxPages = 5
): Promise<RawTranscript[]> {
  const BATCH = 3;
  const INTER_BATCH_DELAY = 400;
  const seen = new Set<string>();
  const matched: RawTranscript[] = [];

  for (let start = 0; start < maxPages; start += BATCH) {
    if (start > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY));

    const count = Math.min(BATCH, maxPages - start);
    const pages = await Promise.all(
      Array.from({ length: count }, (_, i) => fetchFirefliesPage(apiKey, (start + i) * 50))
    );

    for (const page of pages) {
      for (const t of page) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          if (matchFn(t)) matched.push(t);
        }
      }
    }

    if ((pages[pages.length - 1]?.length ?? 0) < 50) break;
  }

  return matched;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ sessions: [], participants: [], error: "no_key" }, { status: 503 });
  }

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const participantFilter = searchParams.get("participant")?.toLowerCase() ?? null;

  // ── Cargar cliente ────────────────────────────────────────────────────────
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { hubspotAccount: { select: { id: true } } },
  });

  // ── Enriquecer con HubSpot (cascada) ──────────────────────────────────────
  const [enriched, teamEmails] = await Promise.all([
    enrichClient(client ?? {}),
    prisma.teamMember
      .findMany({ select: { email: true } })
      .then((ms) => new Set(ms.map((m) => normalize(m.email)))),
  ]);

  // Excluir emails del equipo de contactEmails
  for (const te of teamEmails) {
    enriched.companyContactEmails.delete(te);
    enriched.dealContactEmails.delete(te);
  }

  const titleTerms: string[] = client?.name ? extractTitleTerms(client.name) : [];

  const matcher: EnrichedClientMatcher = {
    clientId: clientId,
    name: client?.name ?? "",
    titleTerms,
    enriched,
  };

  // Predicado de matching
  const matchesClient = (t: RawTranscript): boolean => {
    if (titleTerms.length === 0 && enriched.domains.size === 0 && enriched.companyContactEmails.size === 0 && enriched.dealContactEmails.size === 0) {
      return true;
    }
    return sessionMatchesClient(t, matcher, teamEmails);
  };

  // ── Intentar leer de la caché DB primero ──────────────────────────────────
  let clientSessions: RawTranscript[];

  const allDbSessions = await prisma.firefliesSession.findMany({
    orderBy: { date: "desc" },
  });

  if (allDbSessions.length > 0) {
    const dbAsRaw: RawTranscript[] = allDbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date.getTime(),
      duration: s.duration,
      participants: s.participants,
    }));

    clientSessions = dbAsRaw.filter(matchesClient);
    console.log(`[sessions] DB cache hit: ${allDbSessions.length} total, ${clientSessions.length} matched for "${client?.name}"`);
  } else {
    const maxPages = (enriched.domains.size > 0 || enriched.companyContactEmails.size > 0 || teamEmails.size > 0) ? 40 : 1;

    console.log(`[sessions] DB empty — falling back to Fireflies API. client="${client?.name}" domains=${[...enriched.domains].join(",")} contacts=${enriched.companyContactEmails.size} maxPages=${maxPages}`);

    clientSessions = await fetchMatchingTranscripts(apiKey, matchesClient, maxPages);
    console.log(`[sessions] Fireflies API: Found ${clientSessions.length} sessions for "${client?.name}"`);
  }

  // ── Filtrar por participante específico ───────────────────────────────────
  const filtered = participantFilter
    ? clientSessions.filter((t) =>
        t.participants.some((p) => extractEmail(p) === participantFilter)
      )
    : clientSessions;

  // ── Participantes únicos ──────────────────────────────────────────────────
  const allParticipants = new Set<string>();
  clientSessions.forEach((t) =>
    t.participants.forEach((p) => allParticipants.add(extractEmail(p)))
  );

  // ── Formatear y ordenar por fecha descendente ─────────────────────────────
  const sessions: SessionItem[] = filtered
    .map((t) => ({
      id: t.id,
      title: t.title || "Sesión sin título",
      date: t.date,
      duration: t.duration,
      participants: t.participants,
      organizerEmail: null,
      firefliesUrl: `https://app.fireflies.ai/view/${t.id}`,
    }))
    .sort((a, b) => b.date - a.date);

  return NextResponse.json(
    { sessions, participants: Array.from(allParticipants).sort() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
