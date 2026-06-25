/**
 * lib/sessions/resolve-client.ts
 *
 * Materialización del match sesión→cliente (PERF #1). En vez de cargar las ~16k
 * `FirefliesSession` a memoria y matchear en cada navegación, persistimos el
 * resultado de `categorizeSession` en `FirefliesSession.resolvedClientId` y leemos
 * con queries agregadas indexadas.
 *
 * Única fuente de verdad de "de quién es la sesión": `categorizeSession` (la MISMA
 * cascada que /sessions). Acá se materializa CON la señal de HubSpot poblada (batch
 * `searchCompaniesByDomains` sobre los dominios externos) + el map company→Client, así
 * el paso 5 resuelve dominio→empresa-HubSpot→Client (señal fuerte) y NO cae al título.
 * Si HubSpot falla, degrada a mapa vacío (comportamiento previo).
 *
 * Disparadores que lo mantienen fresco (ver plan, Decisión 5):
 *   - meet-sync (create/update): resuelve inline con el ctx de la corrida.
 *   - endpoint de override manualClientId: `reResolveSession(id)`.
 *   - mutaciones de Client (crear / editar emailDomains/company): `resolveAllSessions()` en background.
 *   - backfill one-time: `resolveAllSessions({ dryRun })`.
 */

import { prisma } from "@/lib/db/prisma";
import {
  categorizeSession,
  buildInternalDomainsSet,
  collectExternalDomains,
  computeAmbiguousNameTokens,
  type CategorizeContext,
  type CategorizableSession,
} from "@/lib/sessions/categorize";
import { searchCompaniesByDomains, type HubspotCompanyLite } from "@/lib/hubspot/companies";

/** Carga el contexto de categorización (clientes + categorías) una sola vez. */
export async function buildCategorizeCtx(): Promise<CategorizeContext> {
  const [clients, categories] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
  ]);
  // Señal fuerte del paso 5: company de HubSpot ligada → Client de Nexus.
  const clientsByHubspotCompanyId = new Map<string, { id: string; name: string; company: string | null }>();
  for (const c of clients) {
    if (c.hubspotCompanyId) {
      clientsByHubspotCompanyId.set(c.hubspotCompanyId, { id: c.id, name: c.name, company: c.company });
    }
  }
  return {
    clients,
    categories,
    // Se puebla por sesión/batch en reResolveSession/resolveAllSessions (degrada a vacío si falla HubSpot).
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
    clientsByHubspotCompanyId,
    ambiguousNameTokens: computeAmbiguousNameTokens(clients),
  };
}

/**
 * Pobla el map dominio→company de HubSpot para un conjunto de sesiones (1 batch).
 * Usa la versión NO cacheada (corre también desde scripts `tsx`, fuera del runtime
 * Next donde `unstable_cache` no aplica). Si HubSpot falla, devuelve vacío (degrada).
 */
async function buildHubspotDomainMap(
  sessions: { participants: string[] }[],
  internalDomains: Set<string>,
): Promise<Map<string, HubspotCompanyLite>> {
  try {
    const domains = collectExternalDomains(sessions, internalDomains);
    if (domains.length === 0) return new Map();
    return await searchCompaniesByDomains(domains);
  } catch (e) {
    console.warn(
      "[resolve-client] lookup de HubSpot falló — degradando sin la señal HubSpot→Client:",
      e instanceof Error ? e.message : e,
    );
    return new Map();
  }
}

/** Resuelve el clientId de UNA sesión (null si no matchea un cliente). */
export function resolveSessionClientId(
  session: CategorizableSession,
  ctx: CategorizeContext,
): string | null {
  const group = categorizeSession(session, ctx);
  return group.kind === "client" ? group.id : null;
}

/**
 * Re-resuelve y persiste `resolvedClientId` de una sesión por id. Para hooks
 * puntuales (override de manualClientId). Construye el ctx si no se pasa.
 */
export async function reResolveSession(
  sessionId: string,
  ctx?: CategorizeContext,
): Promise<void> {
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, participants: true, manualClientId: true },
  });
  if (!session) return;
  let c = ctx;
  if (!c) {
    c = await buildCategorizeCtx();
    c.hubspotCompaniesByDomain = await buildHubspotDomainMap([session], c.internalDomains);
  }
  const resolved = resolveSessionClientId(session, c);
  await prisma.firefliesSession.update({
    where: { id: sessionId },
    data: { resolvedClientId: resolved },
  });
}

export interface ResolveAllResult {
  total: number;
  changed: number;
  nullCount: number;
  /** conteo de sesiones resueltas por clientId (solo las que matchean cliente) */
  byClient: Record<string, number>;
  /** delta por cliente (before→after) de los que cambian — gate del dry-run del re-resolve */
  deltas: { clientId: string; name: string; before: number; after: number }[];
}

/**
 * Re-resuelve TODAS las sesiones. Con `dryRun` solo calcula y devuelve conteos
 * (no escribe). En modo escritura agrupa por valor y usa `updateMany` en chunks
 * (≈ N_clientes llamadas, no 16k).
 */
export async function resolveAllSessions(opts?: { dryRun?: boolean }): Promise<ResolveAllResult> {
  const ctx = await buildCategorizeCtx();
  const sessions = await prisma.firefliesSession.findMany({
    select: { id: true, title: true, participants: true, manualClientId: true, resolvedClientId: true },
  });
  // Señal fuerte: poblar el map de HubSpot con los dominios externos de TODAS las
  // sesiones (1 batch). El paso 5 del cascade resuelve dominio→company→Client ligado.
  ctx.hubspotCompaniesByDomain = await buildHubspotDomainMap(sessions, ctx.internalDomains);

  let changed = 0;
  let nullCount = 0;
  const byClient: Record<string, number> = {};
  const beforeByClient: Record<string, number> = {}; // distribución actual (para el delta)
  // Agrupar las sesiones que cambian por el NUEVO valor → un updateMany por grupo.
  const idsByNewValue = new Map<string | null, string[]>();

  for (const s of sessions) {
    if (s.resolvedClientId) beforeByClient[s.resolvedClientId] = (beforeByClient[s.resolvedClientId] ?? 0) + 1;
    const resolved = resolveSessionClientId(s, ctx);
    if (resolved === null) nullCount++;
    else byClient[resolved] = (byClient[resolved] ?? 0) + 1;
    if (resolved !== s.resolvedClientId) {
      changed++;
      const arr = idsByNewValue.get(resolved) ?? [];
      arr.push(s.id);
      idsByNewValue.set(resolved, arr);
    }
  }

  // Delta por cliente (before→after) para los que cambian — gate del dry-run.
  const nameById = new Map(ctx.clients.map((c) => [c.id, c.name]));
  const deltas = [...new Set([...Object.keys(beforeByClient), ...Object.keys(byClient)])]
    .map((id) => ({ clientId: id, name: nameById.get(id) ?? id, before: beforeByClient[id] ?? 0, after: byClient[id] ?? 0 }))
    .filter((d) => d.before !== d.after)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));

  if (!opts?.dryRun) {
    for (const [value, ids] of idsByNewValue) {
      for (let i = 0; i < ids.length; i += 1000) {
        await prisma.firefliesSession.updateMany({
          where: { id: { in: ids.slice(i, i + 1000) } },
          data: { resolvedClientId: value },
        });
      }
    }
  }

  return { total: sessions.length, changed, nullCount, byClient, deltas };
}
