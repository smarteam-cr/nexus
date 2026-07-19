/**
 * lib/sessions/bookends.ts
 *
 * Cálculo PURO de los "bookends" de sesiones de un cliente (la próxima futura y
 * la última pasada, global y POR FRENTE Ventas/CSE) — extraído del endpoint GPS
 * para poder testearlo sin Prisma.
 *
 * PERF #1 (la dieta del GPS): la selección de QUÉ sesiones son del cliente ya NO
 * pasa por acá. Antes el endpoint cargaba las ~16.000 FirefliesSession (con su
 * blob `summary`) y corría el cascade de matching + enrichClient (4-8 llamadas
 * HubSpot en vivo) EN CADA render del widget (~6s, y el peor consumidor del pool).
 * Ahora el caller consulta por `resolvedClientId` (materializado + índice
 * `[resolvedClientId, date desc]`, mantenido por resolve-sessions — el MISMO dato
 * del que ya depende /clients para "última actividad") y esto solo ordena y
 * clasifica las ~decenas de sesiones del cliente.
 */

/** Fila mínima que necesita el cálculo (subset del select de FirefliesSession). */
export interface BookendSessionRow {
  id: string;
  title: string;
  date: Date;
  participants: string[];
  summary: unknown;
  googleDocId: string | null;
  googleEventId: string | null;
}

/** Sesión por frente (auto-detectada). mixed = participan ambas áreas. */
export type FrontSession = {
  sessionId: string;
  title: string;
  date: string;
  mixed: boolean;
  summary: string | null;
  googleDocId: string | null;
  googleEventId: string | null;
};

/** Por frente: la próxima futura y la última pasada (cada una puede faltar). */
export type FrontPairAuto = { next: FrontSession | null; last: FrontSession | null };

export interface SessionBookends {
  next: {
    sessionId: string;
    title: string;
    date: string;
    googleEventId: string | null;
    googleDocId: string | null;
  } | null;
  last: {
    sessionId: string;
    title: string;
    date: string;
    summary: string | null;
    googleDocId: string | null;
  } | null;
  fronts: { ventas: FrontPairAuto; cs: FrontPairAuto };
}

export const EMPTY_BOOKENDS: SessionBookends = {
  next: null,
  last: null,
  fronts: { ventas: { next: null, last: null }, cs: { next: null, last: null } },
};

/** Texto legible del blob `summary` de Fireflies ({ overview, shorthand_bullet, … }). */
export function extractSummaryText(summary: unknown): string | null {
  if (!summary || typeof summary !== "object") return null;
  const s = summary as Record<string, unknown>;
  if (typeof s.overview === "string") return s.overview;
  if (typeof s.shorthand_bullet === "string") return s.shorthand_bullet;
  return null;
}

/**
 * Bookends global + por frente a partir de las sesiones YA acotadas al cliente.
 * `sessions` puede venir en cualquier orden (se ordena acá, DESC por fecha).
 * El frente "cs" del GPS es el de ENTREGA (deliveryEmails = CSE ∪ Development,
 * igual que lib/timeline/delivery-sessions.ts). Una sesión mixta cae en ambos.
 */
export function computeBookends(
  sessions: BookendSessionRow[],
  now: number,
  salesEmails: Set<string>,
  deliveryEmails: Set<string>,
): SessionBookends {
  const desc = [...sessions].sort((a, b) => b.date.getTime() - a.date.getTime());

  // desc está DESC por fecha → reversa para encontrar la primera futura ASC.
  const future = [...desc].reverse().filter((s) => s.date.getTime() > now);
  const past = desc.filter((s) => s.date.getTime() <= now);

  const nextRaw = future[0] ?? null;
  const lastRaw = past[0] ?? null;

  const involvesArea = (s: BookendSessionRow, emails: Set<string>) =>
    s.participants.some((p) => emails.has(p.toLowerCase()));

  const buildFront = (s: BookendSessionRow): FrontSession => ({
    sessionId: s.id,
    title: s.title,
    date: s.date.toISOString(),
    mixed: involvesArea(s, salesEmails) && involvesArea(s, deliveryEmails),
    summary: extractSummaryText(s.summary),
    googleDocId: s.googleDocId,
    googleEventId: s.googleEventId,
  });

  // future está ASC y past DESC → el primer .find() es el bookend correcto.
  const frontPair = (emails: Set<string>): FrontPairAuto => {
    if (emails.size === 0) return { next: null, last: null };
    const n = future.find((s) => involvesArea(s, emails)) ?? null;
    const l = past.find((s) => involvesArea(s, emails)) ?? null;
    return { next: n ? buildFront(n) : null, last: l ? buildFront(l) : null };
  };

  return {
    next: nextRaw
      ? {
          sessionId: nextRaw.id,
          title: nextRaw.title,
          date: nextRaw.date.toISOString(),
          googleEventId: nextRaw.googleEventId,
          googleDocId: nextRaw.googleDocId,
        }
      : null,
    last: lastRaw
      ? {
          sessionId: lastRaw.id,
          title: lastRaw.title,
          date: lastRaw.date.toISOString(),
          summary: extractSummaryText(lastRaw.summary),
          googleDocId: lastRaw.googleDocId,
        }
      : null,
    fronts: {
      ventas: frontPair(salesEmails),
      cs: frontPair(deliveryEmails),
    },
  };
}
