/**
 * lib/fireflies/sync.ts
 *
 * Lógica central de sincronización de sesiones Fireflies → DB.
 * Solo sincroniza sesiones que coincidan con al menos un cliente registrado
 * usando cascade matching (título + dominio + contactos empresa + contactos deal).
 *
 * Se importa desde:
 *   - app/api/integrations/fireflies/sync/route.ts  (botón manual)
 *   - app/api/clients/route.ts                      (creación de cliente)
 */

import { prisma } from "@/lib/db/prisma";
import { normalize, extractTitleTerms, extractDomain } from "@/lib/utils/matching";
import { createEnrichmentCache } from "@/lib/matching/enrichment";
import { sessionMatchesAnyClient } from "@/lib/matching/cascade";
import type { EnrichedClientMatcher } from "@/lib/matching/cascade";

// Re-exportar para compatibilidad con importadores existentes
export { extractTitleTerms, extractDomain };

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RawTranscript = {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
};

export type SyncResult = {
  synced: number;
  alreadyExisted: number;
  total: number;
};

// ── Normalización ─────────────────────────────────────────────────────────────

export function tokenizeTitle(raw: string): Set<string> {
  return new Set(
    normalize(raw)
      .split(/[\s,.|&+()\-_/\\[\]{}:;!?¿¡"']+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
  );
}

export function extractEmail(p: string): string {
  const angleMatch = p.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase().trim();
  const emailMatch = p.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
  if (emailMatch) return emailMatch[0].toLowerCase().trim();
  return p.toLowerCase().trim();
}

// ── Fireflies: fetch de una página ───────────────────────────────────────────

async function fetchPage(apiKey: string, skip: number): Promise<RawTranscript[]> {
  try {
    const query = `{ transcripts(limit: 50, skip: ${skip}) { id title date duration participants } }`;
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { transcripts?: RawTranscript[] } };
    return data.data?.transcripts ?? [];
  } catch {
    return [];
  }
}

// ── Función principal de sync ─────────────────────────────────────────────────

/**
 * Sincroniza sesiones de Fireflies filtrando solo las que pertenecen
 * a clientes registrados en la DB. Usa cascade matching con HubSpot.
 *
 * @param extraMatchers  Matchers adicionales (ej: cliente recién creado).
 */
export async function syncFirefliesSessions(
  extraMatchers: EnrichedClientMatcher[] = []
): Promise<SyncResult> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return { synced: 0, alreadyExisted: 0, total: 0 };

  // Cargar clientes actuales de la DB
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      company: true,
      hubspotCompanyId: true,
      hubspotAccount: { select: { id: true } },
    },
  });

  // Enriquecer clientes con datos de HubSpot (batches de 5 para rate limit)
  const enrichCache = createEnrichmentCache();
  const ENRICH_BATCH = 5;
  const dbMatchers: EnrichedClientMatcher[] = [];

  for (let i = 0; i < clients.length; i += ENRICH_BATCH) {
    const batch = clients.slice(i, i + ENRICH_BATCH);
    const enriched = await Promise.all(
      batch.map((c) => enrichCache.get(c.id, c))
    );
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const titleTerms = c.name ? extractTitleTerms(c.name) : [];
      const e = enriched[j];
      if (titleTerms.length > 0 || e.domains.size > 0 || e.companyContactEmails.size > 0) {
        dbMatchers.push({ clientId: c.id, name: c.name, titleTerms, enriched: e });
      }
    }
  }

  // Combinar con matchers extra (p.ej. cliente recién creado)
  const matchers = [...dbMatchers, ...extraMatchers].filter(
    (m) => m.titleTerms.length > 0 || m.enriched.domains.size > 0 || m.enriched.companyContactEmails.size > 0
  );

  if (matchers.length === 0) return { synced: 0, alreadyExisted: 0, total: 0 };

  console.log(
    `[fireflies/sync] Buscando sesiones para ${matchers.length} clientes:`,
    matchers.map((m) => `${m.name} (domains=${[...m.enriched.domains].join(",") || "—"}, contacts=${m.enriched.companyContactEmails.size})`).join(" | ")
  );

  // Cargar todos los IDs ya en DB de una sola vez → Set para lookup O(1)
  const existingIds = new Set(
    (await prisma.firefliesSession.findMany({ select: { id: true } })).map((s) => s.id)
  );

  // Páginas en paralelo por batch
  const BATCH = 3;
  const INTER_BATCH_DELAY = 200;
  const MAX_EMPTY_BATCHES = 2;

  let skip = 0;
  let synced = 0;
  let alreadyExisted = 0;
  let hasMore = true;
  let emptyBatches = 0;

  while (hasMore) {
    if (skip > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY));

    const pages = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => fetchPage(apiKey, skip + i * 50))
    );

    const toInsert: RawTranscript[] = [];
    let batchAlreadyExisted = 0;

    for (const page of pages) {
      for (const t of page) {
        if (!sessionMatchesAnyClient(t, matchers)) continue;
        if (existingIds.has(t.id)) {
          batchAlreadyExisted++;
        } else {
          toInsert.push(t);
          existingIds.add(t.id);
        }
      }

      if (page.length < 50) {
        hasMore = false;
        break;
      }
    }

    alreadyExisted += batchAlreadyExisted;

    if (toInsert.length > 0) {
      const { count } = await prisma.firefliesSession.createMany({
        data: toInsert.map((t) => ({
          id: t.id,
          title: t.title ?? "",
          date: new Date(t.date),
          duration: t.duration ?? 0,
          participants: t.participants ?? [],
        })),
        skipDuplicates: true,
      });
      synced += count;
      emptyBatches = 0;
    } else if (batchAlreadyExisted > 0) {
      emptyBatches++;
      if (emptyBatches >= MAX_EMPTY_BATCHES) {
        console.log(`[fireflies/sync] Stop early: ${emptyBatches} batches sin sesiones nuevas (skip=${skip})`);
        break;
      }
    }

    if (hasMore) skip += BATCH * 50;
  }

  const total = synced + alreadyExisted;
  console.log(`[fireflies/sync] Completado: ${synced} nuevas, ${alreadyExisted} ya existían`);

  return { synced, alreadyExisted, total };
}
