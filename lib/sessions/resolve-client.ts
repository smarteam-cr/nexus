/**
 * lib/sessions/resolve-client.ts
 *
 * Materialización del match sesión→cliente (PERF #1). En vez de cargar las ~16k
 * `FirefliesSession` a memoria y matchear en cada navegación, persistimos el
 * resultado de `categorizeSession` en `FirefliesSession.resolvedClientId` y leemos
 * con queries agregadas indexadas.
 *
 * Única fuente de verdad: `categorizeSession` (la MISMA cascada que usaba el sidebar
 * en vivo → fidelidad exacta). El paso HubSpot del cascade solo produce
 * `hubspotCompany`, nunca un cliente, así que `hubspotCompaniesByDomain` vacío NO
 * cambia la resolución de cliente.
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
  type CategorizeContext,
  type CategorizableSession,
} from "@/lib/sessions/categorize";

/** Carga el contexto de categorización (clientes + categorías) una sola vez. */
export async function buildCategorizeCtx(): Promise<CategorizeContext> {
  const [clients, categories] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, name: true, company: true, emailDomains: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
  ]);
  return {
    clients,
    categories,
    // Vacío a propósito: el paso HubSpot del cascade nunca resuelve a un cliente.
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };
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
  const c = ctx ?? (await buildCategorizeCtx());
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

  let changed = 0;
  let nullCount = 0;
  const byClient: Record<string, number> = {};
  // Agrupar las sesiones que cambian por el NUEVO valor → un updateMany por grupo.
  const idsByNewValue = new Map<string | null, string[]>();

  for (const s of sessions) {
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

  return { total: sessions.length, changed, nullCount, byClient };
}
