import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import {
  extractTitleTerms,
  extractDomain,
  extractEmail,
  tokenizeTitle,
} from "@/lib/fireflies/sync";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

type RawTranscript = {
  id: string;
  title: string;
  date: number;
  participants: string[];
};

interface ClientMatcher {
  titleTerms: string[];
  domain: string | null;
}

function sessionMatchesAnyClient(t: RawTranscript, matchers: ClientMatcher[]): boolean {
  const titleTokens = tokenizeTitle(t.title ?? "");
  for (const m of matchers) {
    if (m.titleTerms.length > 0 && m.titleTerms.every((term) => titleTokens.has(term))) {
      return true;
    }
    if (m.domain && t.participants.some((p) => extractEmail(p).endsWith(`@${m.domain}`))) {
      return true;
    }
  }
  return false;
}

export const GET = withAuth(async () => {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return NextResponse.json({ newSessions: [] });

  // Si la DB está vacía, indicar que hace falta sync inicial
  const dbCount = await prisma.firefliesSession.count();
  if (dbCount === 0) {
    return NextResponse.json({ newSessions: [], needsSync: true });
  }

  // Construir matchers de clientes actuales
  const clients = await prisma.client.findMany({
    select: { name: true, company: true },
  });

  const matchers: ClientMatcher[] = clients
    .map((c) => ({
      titleTerms: c.name ? extractTitleTerms(c.name) : [],
      domain: c.company ? extractDomain(c.company) : null,
    }))
    .filter((m) => m.titleTerms.length > 0 || m.domain !== null);

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
  const newSessions = firstPage
    .filter(
      (t) =>
        !existingIds.has(t.id) &&
        (matchers.length === 0 || sessionMatchesAnyClient(t, matchers))
    )
    .map((t) => ({
      id: t.id,
      title: t.title ?? "",
      date: t.date,
      participants: t.participants ?? [],
    }));

  return NextResponse.json({ newSessions });
});
