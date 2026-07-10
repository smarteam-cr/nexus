/**
 * lib/cs/partner-sync.ts
 *
 * Sync del objeto Partner Clients de HubSpot → ClientPartnerSnapshot (+ creación
 * de Clients para los no matcheados, decisión de producto: TODO el book de partner
 * vive en Nexus).
 *
 * REGLAS DE ROBUSTEZ (post-revisión adversaria):
 *   - LOCK EN DB (CronJobState "cs-partner-sync-lock", compare-and-set con timeout
 *     de 15 min): el cron, el endpoint manual y el script comparten UNA corrida a
 *     la vez ENTRE LAS DOS MÁQUINAS que comparten la DB.
 *   - EL VÍNCULO EXISTENTE ES LA FUENTE #0 del match: un snapshot ya vinculado
 *     CONSERVA su Client (los vínculos solo se mueven con evidencia positiva:
 *     match por company ID hacia otro cliente). Nunca se degrada un vínculo a null.
 *   - Si el batch de asociaciones falló (associationsOk=false), la corrida es
 *     "partial": actualiza propiedades/escalares pero NO re-matchea ni crea Clients.
 *   - Los índices de matching EXCLUYEN prospectos (un snapshot vinculado a un
 *     prospecto sería invisible para todo el módulo CS).
 *   - materialKey usa stringify con keys ORDENADAS (jsonb de Postgres reordena
 *     keys — comparar contra el orden de inserción JS marcaba cambio SIEMPRE).
 *   - Reconciliación: records que ya no existen en HubSpot → snapshot desvinculado
 *     (con guarda de sanidad: solo si el fetch trajo ≥50% del total conocido).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { fetchAllPartnerClients, type PartnerClientRecord } from "@/lib/hubspot/partner-clients";

export interface PartnerSyncResult {
  supported: boolean;
  /** true = otra corrida (esta u otra máquina) tiene el lock — no se hizo nada. */
  locked?: boolean;
  /** false = asociaciones no confiables esta corrida (solo se refrescaron datos). */
  associationsOk?: boolean;
  total: number;
  matchedByCompany: number;
  matchedByDomain: number;
  alreadyLinked: number;
  unmatched: number;
  createdClients: Array<{ name: string; domain: string | null; hubspotCompanyId: string | null }>;
  wouldCreateClients: Array<{ name: string; domain: string | null; hubspotCompanyId: string | null }>;
  briefsMarkedStale: number;
  unlinkedGone: number;
  errors: string[];
}

const LOCK_KEY = "cs-partner-sync-lock";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/** Lock cross-machine vía CronJobState (lastRunAt = "lock tomado en"). */
async function acquireSyncLock(now: Date): Promise<boolean> {
  await prisma.cronJobState
    .upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } })
    .catch((e) => { if ((e as { code?: string })?.code !== "P2002") throw e; });
  const claimed = await prisma.cronJobState.updateMany({
    where: {
      id: LOCK_KEY,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }],
    },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}
async function releaseSyncLock(): Promise<void> {
  await prisma.cronJobState
    .updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } })
    .catch(() => {});
}

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: string | undefined): number | null => {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
};
const dateOrNull = (v: string | undefined): Date | null => {
  if (!v) return null;
  // HubSpot v3 devuelve ISO o epoch ms según la property.
  const t = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) && !Number.isNaN(t) ? new Date(t) : null;
};

/** Semana ISO "YYYY-Www" — clave del historial semanal de uso (el UUS se
 *  recalcula semanalmente en HubSpot; el sync diario pisa la fila de la semana). */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** stringify determinístico (keys ordenadas recursivamente) — jsonb reordena keys,
 *  así que comparar stringify de orden de inserción marcaba "cambio" siempre. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Escalares del snapshot a partir de los campos resueltos por label. */
function buildScalars(rec: PartnerClientRecord) {
  const r = rec.resolved;
  const seat = (k: string) => intOrNull(r[`seats${k}`]);
  const seats = {
    core: { assigned: seat("CoreAssigned"), available: seat("CoreAvailable"), limit: seat("CoreLimit") },
    sales: { assigned: seat("SalesAssigned"), available: seat("SalesAvailable"), limit: seat("SalesLimit") },
    service: { assigned: seat("ServiceAssigned"), available: seat("ServiceAvailable"), limit: seat("ServiceLimit") },
  };
  const renewalsByHub = {
    marketing: dateOrNull(r.renewalMarketing)?.toISOString() ?? null,
    sales: dateOrNull(r.renewalSales)?.toISOString() ?? null,
    service: dateOrNull(r.renewalService)?.toISOString() ?? null,
    ops: dateOrNull(r.renewalOps)?.toISOString() ?? null,
  };
  const hubEditions = {
    marketing: r.editionMarketing ?? null,
    sales: r.editionSales ?? null,
    service: r.editionService ?? null,
    ops: r.editionOps ?? null,
    content: r.editionContent ?? null,
    commerce: r.editionCommerce ?? null,
  };
  const domain = (r.domain ?? r.domainFallback ?? "").toLowerCase() || null;
  return {
    domain,
    associatedCompanyIds: rec.associatedCompanyIds,
    uusScore: numOrNull(r.uusScore),
    // Float directo: sondeado contra los 157 records (2026-07-10) — siempre número plano.
    uusTrend: numOrNull(r.uusTrend),
    activationScore: numOrNull(r.activationScore),
    toolUsageScore: numOrNull(r.toolUsageScore),
    valueMetricsScore: numOrNull(r.valueMetricsScore),
    consumptionScore: numOrNull(r.consumptionScore),
    marketingScore: numOrNull(r.marketingScore),
    salesScore: numOrNull(r.salesScore),
    serviceScore: numOrNull(r.serviceScore),
    commerceScore: numOrNull(r.commerceScore),
    seats,
    marketingContactsLimit: intOrNull(r.marketingContactsLimit),
    marketingContactsUsed: intOrNull(r.marketingContactsUsed),
    mrrTotal: numOrNull(r.mrrTotal),
    mrrManaged: numOrNull(r.mrrManaged),
    mrrUpForRenewal: numOrNull(r.mrrUpForRenewal),
    nextRenewalAt: dateOrNull(r.nextRenewalAt),
    renewalsByHub,
    managedExpiryAt: dateOrNull(r.managedExpiryAt),
    cancellationHubs: r.cancellationHubs ?? null,
    revenueSignal: r.revenueSignal ?? null,
    revenueSignalDetail: r.revenueSignalDetail ?? null,
    hubEditions,
    activeProducts: r.activeProducts ?? null,
    hsCsmName: r.hsCsmName ?? null,
    hsCsmEmail: r.hsCsmEmail ?? null,
    hsGrowthName: r.hsGrowthName ?? null,
    hsGrowthEmail: r.hsGrowthEmail ?? null,
    cslImplementaciones: r.cslImplementaciones ?? null,
    country: r.country ?? null,
    portalLink: r.portalLink ?? null,
  };
}

/** Subset que define "cambio material" (dispara staleAt del brief). */
function materialKey(s: {
  uusScore: number | null; marketingScore: number | null; salesScore: number | null;
  serviceScore: number | null; seats: unknown; mrrTotal: number | null;
  mrrUpForRenewal: number | null; nextRenewalAt: Date | null; cancellationHubs: string | null;
  revenueSignal: string | null;
}): string {
  return stableStringify({
    uus: s.uusScore, mk: s.marketingScore, sl: s.salesScore, sv: s.serviceScore,
    seats: s.seats, mrr: s.mrrTotal, mrrRen: s.mrrUpForRenewal,
    ren: s.nextRenewalAt?.toISOString() ?? null, cancel: s.cancellationHubs,
    signal: s.revenueSignal,
  });
}

/**
 * Records de partner que NUNCA se convierten en Client aunque no matcheen:
 * los portales internos de Smarteam y los records sin nombre real. Post-mortem
 * 2026-07-10: crearlos rompió el resolver de sesiones (dos "Smarteam" = token
 * ambiguo → el cliente Smarteam cayó de 1313 sesiones resueltas a 1). Sus
 * snapshots se sincronizan igual, solo que sin vincular (invisibles en CS).
 */
export const PARTNER_CREATE_SKIP = /^(smarteam([ _].*)?|hub id:.*)$/i;

export async function syncPartnerClients(
  options: { createClients?: boolean } = {},
): Promise<PartnerSyncResult> {
  const createClients = options.createClients ?? true;
  const result: PartnerSyncResult = {
    supported: true, total: 0, matchedByCompany: 0, matchedByDomain: 0, alreadyLinked: 0,
    unmatched: 0, createdClients: [], wouldCreateClients: [], briefsMarkedStale: 0,
    unlinkedGone: 0, errors: [],
  };

  const now = new Date();
  if (!(await acquireSyncLock(now))) {
    result.locked = true;
    result.errors.push("otra corrida del sync tiene el lock — no se hizo nada");
    return result;
  }

  try {
    const fetched = await fetchAllPartnerClients();
    if (!fetched.supported) {
      result.supported = false;
      return result;
    }
    if (fetched.records.length === 0) {
      // Error transitorio (API caída): no pisar snapshots existentes.
      result.errors.push("0 records — posible error transitorio de la API; no se tocó nada");
      return result;
    }
    result.total = fetched.records.length;
    result.associationsOk = fetched.associationsOk;
    const canRelink = fetched.associationsOk; // sin asociaciones confiables NO se re-matchea ni se crean Clients

    // ── Índices de matching (SIN prospectos: un vínculo a prospecto es invisible
    //    para el módulo CS) + estado actual de vínculos ────────────────────────
    const clients = await prisma.client.findMany({
      where: { isProspect: false },
      select: { id: true, name: true, hubspotCompanyId: true, emailDomains: true },
    });
    const byCompanyId = new Map<string, string>();
    const byDomain = new Map<string, string>();
    for (const c of clients) {
      if (c.hubspotCompanyId) byCompanyId.set(c.hubspotCompanyId, c.id);
      for (const d of c.emailDomains) byDomain.set(d.toLowerCase(), c.id);
    }
    const existingSnapshots = await prisma.clientPartnerSnapshot.findMany({
      select: {
        hubspotPartnerClientId: true, clientId: true,
        uusScore: true, marketingScore: true, salesScore: true, serviceScore: true,
        seats: true, mrrTotal: true, mrrUpForRenewal: true, nextRenewalAt: true,
        cancellationHubs: true, revenueSignal: true,
      },
    });
    const existingByPartnerId = new Map(existingSnapshots.map((s) => [s.hubspotPartnerClientId, s]));
    // clientId → partnerId dueño actual del vínculo (clientId es @unique en el snapshot).
    const linkOwner = new Map<string, string>();
    for (const s of existingSnapshots) if (s.clientId) linkOwner.set(s.clientId, s.hubspotPartnerClientId);

    for (const rec of fetched.records) {
      try {
        const scalars = buildScalars(rec);
        const existing = existingByPartnerId.get(rec.id);
        const name =
          rec.resolved.clientName?.trim() ||
          rec.resolved.accountName?.trim() ||
          scalars.domain ||
          `Partner ${rec.id}`;

        // ── Match — FUENTE #0: el vínculo existente se conserva ─────────────
        let clientId: string | null = existing?.clientId ?? null;
        if (clientId) {
          result.alreadyLinked++;
        } else if (canRelink) {
          for (const companyId of rec.associatedCompanyIds) {
            const hit = byCompanyId.get(companyId);
            if (hit) { clientId = hit; result.matchedByCompany++; break; }
          }
          if (!clientId && scalars.domain) {
            const hit = byDomain.get(scalars.domain);
            if (hit) { clientId = hit; result.matchedByDomain++; }
          }

          // Los portales INTERNOS de Smarteam y los records basura NO se convierten
          // en Client: el resolver de sesiones matchea por nombre/dominio, y un
          // segundo "Smarteam" vuelve ambiguo el token — el 2026-07-10 eso desplomó
          // la resolución del cliente Smarteam de 1313 sesiones a 1 (INV1/INV2 rojos).
          // Tampoco los records SIN dominio NI company asociada: no hay nada con qué
          // matchearlos — un Client solo-nombre roba sesiones por el fallback débil
          // de título (caso real: "Alejandro Rodríguez" se llevó 57 sesiones internas).
          // El snapshot igual se sincroniza (queda sin vincular, invisible en CS).
          const unmatchable = !scalars.domain && rec.associatedCompanyIds.length === 0;
          if (!clientId && (PARTNER_CREATE_SKIP.test(name) || unmatchable)) {
            result.unmatched++;
            continue;
          }

          // Crear Client si no hay match (decisión de producto).
          if (!clientId) {
            const draft = {
              name,
              domain: scalars.domain,
              hubspotCompanyId: rec.associatedCompanyIds[0] ?? null,
            };
            if (!createClients) {
              result.wouldCreateClients.push(draft);
              result.unmatched++;
            } else {
              const created = await prisma.client.create({
                data: {
                  name,
                  hubspotCompanyId: draft.hubspotCompanyId,
                  emailDomains: scalars.domain ? [scalars.domain] : [],
                  isProspect: false,
                },
                select: { id: true },
              });
              clientId = created.id;
              if (draft.hubspotCompanyId) byCompanyId.set(draft.hubspotCompanyId, created.id);
              if (scalars.domain) byDomain.set(scalars.domain, created.id);
              result.createdClients.push(draft);
            }
          }

          // clientId es @unique en el snapshot: si otro record ya es dueño del
          // vínculo, este queda sin vincular (se loguea; el dueño se conserva).
          if (clientId) {
            const owner = linkOwner.get(clientId);
            if (owner && owner !== rec.id) {
              result.errors.push(`client ${clientId} ya vinculado al partner record ${owner} — ${rec.id} queda sin vincular`);
              clientId = null;
            } else {
              linkOwner.set(clientId, rec.id);
            }
          }
        } else {
          result.unmatched += clientId ? 0 : 1;
        }

        // ── Upsert + staleAt del brief si cambió lo material ────────────────
        // La CREACIÓN también cuenta como cambio material: un brief redactado antes
        // del primer sync no cita el bloque entero de partner que acaba de aparecer.
        const changedMaterially = !existing || materialKey(existing) !== materialKey(scalars);

        const base = {
          fetchedAt: new Date(),
          fetchStatus: fetched.associationsOk ? "ok" : "partial",
          properties: rec.properties as Prisma.InputJsonValue,
          ...scalars,
          seats: scalars.seats as Prisma.InputJsonValue,
          renewalsByHub: scalars.renewalsByHub as Prisma.InputJsonValue,
          hubEditions: scalars.hubEditions as Prisma.InputJsonValue,
        };
        await prisma.clientPartnerSnapshot.upsert({
          where: { hubspotPartnerClientId: rec.id },
          create: { hubspotPartnerClientId: rec.id, clientId, ...base },
          // El vínculo NUNCA se degrada: solo se escribe cuando hay match positivo.
          update: { ...base, ...(clientId ? { clientId } : {}) },
        });

        if (changedMaterially && clientId) {
          const marked = await prisma.csAccountBrief.updateMany({
            where: { clientId, staleAt: null },
            data: { staleAt: new Date() },
          });
          result.briefsMarkedStale += marked.count;
        }

        // ── Historial SEMANAL de uso (el UUS se recalcula semanalmente): una fila
        //    por (record, semana ISO); el sync diario pisa la de la semana en curso
        //    → queda la última foto de cada semana para tendencia propia. ────────
        const weekKey = isoWeekKey(now);
        const usageRow = {
          clientId,
          uusScore: scalars.uusScore,
          activationScore: scalars.activationScore,
          toolUsageScore: scalars.toolUsageScore,
          valueMetricsScore: scalars.valueMetricsScore,
          consumptionScore: scalars.consumptionScore,
          marketingScore: scalars.marketingScore,
          salesScore: scalars.salesScore,
          serviceScore: scalars.serviceScore,
          marketingContactsUsed: scalars.marketingContactsUsed,
          marketingContactsLimit: scalars.marketingContactsLimit,
          seats: scalars.seats as Prisma.InputJsonValue,
          mrrTotal: scalars.mrrTotal,
          nextRenewalAt: scalars.nextRenewalAt,
          capturedAt: new Date(),
        };
        await prisma.partnerUsageSnapshot.upsert({
          where: { hubspotPartnerClientId_weekKey: { hubspotPartnerClientId: rec.id, weekKey } },
          create: { hubspotPartnerClientId: rec.id, weekKey, ...usageRow },
          update: usageRow,
        });
      } catch (e) {
        result.errors.push(`record ${rec.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    // ── Reconciliación: records que YA NO existen en HubSpot → desvincular el
    //    snapshot (su clientId @unique bloquearía el re-vínculo para siempre).
    //    Guarda de sanidad: solo con un fetch razonablemente completo. ────────
    if (fetched.records.length >= existingByPartnerId.size * 0.5) {
      const fetchedIds = new Set(fetched.records.map((r) => r.id));
      const gone = [...existingByPartnerId.values()].filter(
        (s) => s.clientId && !fetchedIds.has(s.hubspotPartnerClientId),
      );
      for (const s of gone) {
        await prisma.clientPartnerSnapshot
          .update({ where: { hubspotPartnerClientId: s.hubspotPartnerClientId }, data: { clientId: null } })
          .catch(() => {});
        result.unlinkedGone++;
      }
    }

    return result;
  } finally {
    await releaseSyncLock();
    // Persistir el resultado del ÚLTIMO run CONCLUYENTE — la fuente de verdad de
    // "¿el scope está autorizado?" para los paneles de CS (fila cs-partner-sync-status).
    // Concluyente = 403 de scope (supported:false) o una corrida real con records.
    // Las corridas locked y los "0 records" transitorios NO pisan el último resultado
    // bueno (el propio job los trata como transitorios y reintenta, lib/jobs/defs.ts).
    await persistSyncStatus(result);
  }
}

/** Escribe cs-partner-sync-status.lastResult si la corrida fue concluyente. Best-effort:
 *  un fallo acá no debe tumbar el sync (los datos ya están persistidos). */
async function persistSyncStatus(result: PartnerSyncResult): Promise<void> {
  const conclusive = !result.locked && (!result.supported || result.total > 0);
  if (!conclusive) return;
  const lastResult = {
    supported: result.supported,
    total: result.total,
    matched: result.matchedByCompany + result.matchedByDomain + result.alreadyLinked,
    unmatched: result.unmatched,
    wouldCreate: result.wouldCreateClients.length,
    created: result.createdClients.length,
    errors: result.errors.length,
    at: new Date().toISOString(),
  };
  await prisma.cronJobState
    .upsert({
      where: { id: "cs-partner-sync-status" },
      create: { id: "cs-partner-sync-status", lastResult },
      update: { lastResult },
    })
    .catch((e) => console.error("[partner-sync] no se pudo persistir cs-partner-sync-status:", e));
}

/** Shape del lastResult de cs-partner-sync-status (lo leen los loaders de CS). */
export interface PartnerSyncStatus {
  supported: boolean;
  total: number;
  matched: number;
  unmatched: number;
  wouldCreate: number;
  created: number;
  errors: number;
  at: string;
}
