/**
 * lib/cs/partner-state.ts — funciones PURAS del módulo de partner (sin Prisma).
 *
 * Viven acá y no en los loaders a propósito: los tests unit del repo corren sin DB
 * (vitest project "unit"), e importar lib/db/prisma instancia PrismaClient+Pool en
 * el import. Este módulo no importa nada.
 */

/**
 * Los TRES estados vacíos que antes eran un solo mensaje ambiguo, más el estado con
 * datos. La distinción sale de `cs-partner-sync-status.lastResult` (escrito por
 * syncPartnerClients solo en corridas concluyentes) + el snapshot propio de la cuenta:
 *
 *  - no_scope:     el último sync REAL devolvió 403 (falta autorizar el scope).
 *  - never_synced: nunca corrió un sync concluyente (o no hay rastro de ninguno).
 *  - no_match:     el sync corrió, hay datos en la base, pero ESTA cuenta no está
 *                  vinculada a ningún partner client de HubSpot.
 *  - ok:           la cuenta tiene snapshot.
 */
export type PartnerState = "no_scope" | "never_synced" | "no_match" | "ok";

export function resolvePartnerState(args: {
  /** La cuenta tiene su propio ClientPartnerSnapshot. */
  hasSnapshot: boolean;
  /** Hay ALGÚN snapshot en toda la base (fallback para instalaciones sin lastResult). */
  anySnapshots: boolean;
  /** `cs-partner-sync-status.lastResult` (null = nunca se persistió un run concluyente). */
  lastSync: { supported: boolean } | null;
}): PartnerState {
  if (args.hasSnapshot) return "ok";
  if (args.lastSync) return args.lastSync.supported ? "no_match" : "no_scope";
  // Sin rastro del sync: si hay snapshots ajenos, algún sync corrió (pre-lastResult).
  return args.anySnapshots ? "no_match" : "never_synced";
}

/** Mensaje por estado — copy ÚNICO compartido por la vista de cuenta y sus chips,
 *  para que las dos superficies nunca vuelvan a decir causas distintas. */
export const PARTNER_STATE_META: Record<Exclude<PartnerState, "ok">, { chip: string; message: string }> = {
  no_scope: {
    chip: "sin permiso de partner",
    message:
      "El scope de Partner Clients no está autorizado en la app de HubSpot — al re-autorizarla, el sync trae los datos de uso y licencias.",
  },
  never_synced: {
    chip: "sin sincronizar",
    message:
      "El sync de Partner Clients todavía no corrió — los datos de uso y licencias aparecen tras la primera sincronización.",
  },
  no_match: {
    chip: "sin partner client",
    message:
      "Esta cuenta no está vinculada a ningún partner client de HubSpot — si existe en el book de partner, revisá el company ID o los dominios del cliente.",
  },
};

/**
 * Riesgo efectivo de una fila de adopción, para ORDENAR la tabla de uso (menor = más
 * riesgo = más arriba). Corrige el sesgo de `uusScore ?? 999` (dato faltante rankeaba
 * como la cuenta más sana) e incorpora la tendencia: una cuenta con puntaje decente
 * pero cayendo sube posiciones. La tendencia viene como fracción (-0.18…0.01), se
 * escala ×100 para que reste puntos comparables al score (0–100).
 */
export function adoptionRiskScore(row: { uusScore: number | null; uusTrend: number | null }): number {
  const base = row.uusScore ?? -1; // sin dato = peor que cualquier score real
  const trendPenalty = row.uusTrend !== null && row.uusTrend < 0 ? row.uusTrend * 100 : 0;
  return base + trendPenalty;
}

/** Comparator para la tabla de uso: más riesgo primero. */
export function compareAdoptionRisk(
  a: { uusScore: number | null; uusTrend: number | null },
  b: { uusScore: number | null; uusTrend: number | null },
): number {
  return adoptionRiskScore(a) - adoptionRiskScore(b);
}

/** ¿El dato está rancio? (para el tono `stale` de SourceChip). `date` null = sin dato,
 *  que no es "rancio" — es otro estado y lo maneja el caller. */
export function isStale(date: Date | string | null, staleAfterDays: number, now: Date): boolean {
  if (date === null) return false;
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t > staleAfterDays * 24 * 60 * 60 * 1000;
}

/** Umbrales de rancidez por fuente (días). Ajustables; ver plan CS360 F3. */
export const STALE_AFTER_DAYS = { partner: 14, stageSync: 7 } as const;
