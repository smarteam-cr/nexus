import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { extractTitleTerms } from "@/lib/utils/matching";
import { extractEmail, tokenizeTitle } from "@/lib/fireflies/sync";
import { getEnrichmentWithTTL } from "@/lib/matching/enrichment";
import { sessionMatchesAnyClient } from "@/lib/matching/cascade";
import type { EnrichedClientMatcher } from "@/lib/matching/cascade";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

type RawTranscript = {
  id: string;
  title: string;
  date: number;
  participants: string[];
};

export const GET = withAuth(async () => {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return NextResponse.json({ newSessions: [] });

  // Si la DB está vacía, indicar que hace falta sync inicial
  const dbCount = await prisma.firefliesSession.count();
  if (dbCount === 0) {
    return NextResponse.json({ newSessions: [], needsSync: true });
  }

  // Cargar clientes y enriquecer con TTL cache (5 min)
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      company: true,
      hubspotCompanyId: true,
      hubspotAccount: { select: { id: true } },
    },
  });

  const enrichmentMap = await getEnrichmentWithTTL(clients);

  const matchers: EnrichedClientMatcher[] = clients
    .map((c) => ({
      clientId: c.id,
      name: c.name,
      titleTerms: c.name ? extractTitleTerms(c.name) : [],
      enriched: enrichmentMap.get(c.id) ?? { domains: new Set<string>(), companyContactEmails: new Set<string>(), dealContactEmails: new Set<string>() },
    }))
    .filter((m) => m.titleTerms.length > 0 || m.enriched.domains.size > 0 || m.enriched.companyContactEmails.size > 0);

  // Fetch primera página de Fireflies
  let firstPage: RawTranscript[] = [];
  try {
    const query = `{ transcripts(limit: 50, skip: 0) { id title date participants } }`;
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { transcripts?: RawTranscript[] } };
      firstPage = data.data?.transcripts ?? [];
    }
  } catch {
    return NextResponse.json({ newSessions: [] });
  }

  if (firstPage.length === 0) return NextResponse.json({ newSessions: [] });

  // IDs ya en DB
  const existingIds = new Set(
    (await prisma.firefliesSession.findMany({ select: { id: true } })).map((s) => s.id)
  );

  // Sesiones nuevas que coincidan con algún cliente
  const asRaw = firstPage.map((t) => ({ ...t, duration: 0 })); // add duration for type compat
  const newSessions = firstPage
    .filter(
      (t, i) =>
        !existingIds.has(t.id) &&
        (matchers.length === 0 || sessionMatchesAnyClient(asRaw[i], matchers))
    )
    .map((t) => ({
      id: t.id,
      title: t.title ?? "",
      date: t.date,
      participants: t.participants ?? [],
    }));

  return NextResponse.json({ newSessions });
});
