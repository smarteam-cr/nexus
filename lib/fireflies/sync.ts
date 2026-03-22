/**
 * lib/fireflies/sync.ts
 *
 * Lógica central de sincronización de sesiones Fireflies → DB.
 * Solo sincroniza sesiones que coincidan con al menos un cliente registrado
 * (por título o por dominio de email de participantes).
 *
 * Se importa desde:
 *   - app/api/integrations/fireflies/sync/route.ts  (botón manual)
 *   - app/api/clients/route.ts                      (creación de cliente)
 */

import { prisma } from "@/lib/db/prisma";
import { normalize, extractTitleTerms, extractDomain } from "@/lib/utils/matching";

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

// ── Matcher multi-cliente ─────────────────────────────────────────────────────

interface ClientMatcher {
  name: string;
  titleTerms: string[];
  domain: string | null;
}

export function sessionMatchesAnyClient(
  t: RawTranscript,
  matchers: ClientMatcher[]
): boolean {
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
 * a clientes registrados en la DB.
 *
 * Optimizaciones:
 *  - Carga todos los IDs existentes en un Set al inicio (1 query, no N).
 *  - Usa createMany por batch en vez de upserts individuales.
 *
 * @param extraMatchers  Matchers adicionales (ej: cliente recién creado).
 */
export async function syncFirefliesSessions(
  extraMatchers: ClientMatcher[] = []
): Promise<SyncResult> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return { synced: 0, alreadyExisted: 0, total: 0 };

  // Cargar clientes actuales de la DB
  const clients = await prisma.client.findMany({
    select: { name: true, company: true },
  });

  const dbMatchers: ClientMatcher[] = clients
    .map((c) => ({
      name: c.name,
      titleTerms: c.name ? extractTitleTerms(c.name) : [],
      domain: c.company ? extractDomain(c.company) : null,
    }))
    .filter((m) => m.titleTerms.length > 0 || m.domain !== null);

  // Combinar con matchers extra (p.ej. cliente recién creado)
  const matchers = [...dbMatchers, ...extraMatchers].filter(
    (m) => m.titleTerms.length > 0 || m.domain !== null
  );

  if (matchers.length === 0) return { synced: 0, alreadyExisted: 0, total: 0 };

  console.log(
    `[fireflies/sync] Buscando sesiones para ${matchers.length} clientes:`,
    matchers.map((m) => `${m.name} (domain=${m.domain ?? "—"})`).join(" | ")
  );

  // Cargar todos los IDs ya en DB de una sola vez → Set para lookup O(1)
  const existingIds = new Set(
    (await prisma.firefliesSession.findMany({ select: { id: true } })).map((s) => s.id)
  );

  // Páginas en paralelo por batch. Delay reducido porque DB ya no es el cuello.
  const BATCH = 3;
  const INTER_BATCH_DELAY = 200;
  // Stop early: si N batches consecutivos no producen sesiones nuevas,
  // Fireflies ya nos devolvió todo lo reciente → paramos.
  const MAX_EMPTY_BATCHES = 2;

  let skip = 0;
  let synced = 0;
  let alreadyExisted = 0;
  let hasMore = true;
  let emptyBatches = 0;

  while (hasMore) {
    if (skip > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY));

    // Fetch 3 páginas en paralelo
    const pages = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => fetchPage(apiKey, skip + i * 50))
    );

    // Filtrar sesiones relevantes y nuevas de este batch
    const toInsert: RawTranscript[] = [];
    let batchAlreadyExisted = 0;

    for (const page of pages) {
      for (const t of page) {
        if (!sessionMatchesAnyClient(t, matchers)) continue;
        if (existingIds.has(t.id)) {
          batchAlreadyExisted++;
        } else {
          toInsert.push(t);
          existingIds.add(t.id); // evitar duplicados dentro del mismo sync
        }
      }

      if (page.length < 50) {
        hasMore = false;
        break;
      }
    }

    alreadyExisted += batchAlreadyExisted;

    // Insertar todas las nuevas del batch en una sola operación
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
      emptyBatches = 0; // resetear contador al encontrar sesiones nuevas
    } else if (batchAlreadyExisted > 0) {
      // Hubo sesiones coincidentes pero todas ya estaban → zona conocida
      emptyBatches++;
      if (emptyBatches >= MAX_EMPTY_BATCHES) {
        console.log(`[fireflies/sync] Stop early: ${emptyBatches} batches sin sesiones nuevas (skip=${skip})`);
        break;
      }
    }
    // Si el batch no tuvo ninguna sesión coincidente (toInsert=0, batchAlreadyExisted=0),
    // no contamos como "empty" porque puede haber más sesiones relevantes adelante.

    if (hasMore) skip += BATCH * 50;
  }

  const total = synced + alreadyExisted;
  console.log(`[fireflies/sync] Completado: ${synced} nuevas, ${alreadyExisted} ya existían`);

  return { synced, alreadyExisted, total };
}
