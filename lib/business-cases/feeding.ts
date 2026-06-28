/**
 * lib/business-cases/feeding.ts
 *
 * Sesiones del prospecto que ALIMENTAN un business case. Regla (igual que el
 * handoff): una sesión del prospecto alimenta si tiene a alguien de Ventas en la
 * sala, salvo override explícito del CSE (BusinessCaseSession.included). Así las
 * sesiones relevantes quedan PRE-SELECCIONADAS sin que el CSE las busque a mano.
 *
 * Fuente de sesiones del prospecto: `resolvedClientId` (índice) + suplemento por
 * dominio (raw, sin ventana de fecha). Lo usan el panel (/session-candidates) y la
 * generación (/generate) para no duplicar el criterio. Solo lectura.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

const emailOf = (p: string): string => (p.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? "").toLowerCase();
const domainOf = (p: string): string => {
  const e = emailOf(p);
  const at = e.indexOf("@");
  return at === -1 ? "" : e.slice(at + 1);
};

export type BcSessionMeta = {
  sessionId: string;
  title: string;
  date: Date;
  participants: string[];
  applies: boolean;        // ¿hay alguien de Ventas en la sala? (regla de auto-feed)
  hasTranscript: boolean;
};

type Row = { id: string; title: string; date: Date; participants: string[]; organizerEmail: string | null };

export interface BcFeedingResult {
  /** Sesiones que alimentan el caso (pre-seleccionadas): override=true o (sin override y aplica). */
  included: BcSessionMeta[];
  /** Las demás sesiones del prospecto (para "Buscar más sesiones"). */
  candidates: (BcSessionMeta & { linkedExcluded: boolean })[];
  /** Ids que alimentan (para juntar transcripts en la generación). */
  feedingIds: string[];
}

export async function loadBcFeeding(businessCaseId: string): Promise<BcFeedingResult | null> {
  const bc = await prisma.businessCase.findUnique({
    where: { id: businessCaseId },
    select: { client: { select: { id: true, emailDomains: true } } },
  });
  if (!bc) return null;

  const domains = (bc.client.emailDomains ?? []).map((d) => d.toLowerCase()).filter(Boolean);

  const [salesRows, links] = await Promise.all([
    prisma.teamMember.findMany({ where: { area: { in: ["Sales", "Ventas"] } }, select: { email: true } }),
    prisma.businessCaseSession.findMany({ where: { businessCaseId }, select: { sessionId: true, included: true } }),
  ]);
  const salesEmails = new Set(salesRows.map((m) => m.email.toLowerCase()));
  // Override del CSE por sesión: true=incluir, false=excluir. Sin entrada = decide la regla.
  const override = new Map(links.map((l) => [l.sessionId, l.included]));
  const linkedIds = new Set(links.map((l) => l.sessionId));

  const hasVentas = (participants: string[], organizerEmail: string | null): boolean =>
    participants.some((p) => salesEmails.has(emailOf(p))) ||
    (organizerEmail ? salesEmails.has(organizerEmail.toLowerCase()) : false);

  const SELECT = { id: true, title: true, date: true, participants: true, organizerEmail: true } as const;

  const resolved: Row[] = await prisma.firefliesSession.findMany({
    where: { resolvedClientId: bc.client.id },
    orderBy: { date: "desc" },
    take: 200,
    select: SELECT,
  });
  const seen = new Set(resolved.map((s) => s.id));

  let domainExtra: Row[] = [];
  if (domains.length) {
    try {
      const patterns = domains.map((d) => `%@${d}`);
      const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT id, title, date, participants, "organizerEmail"
        FROM "FirefliesSession"
        WHERE EXISTS (SELECT 1 FROM unnest(participants) p WHERE lower(p) LIKE ANY(${patterns}))
        ORDER BY date DESC LIMIT 100`);
      domainExtra = rows.filter((s) => !seen.has(s.id));
      domainExtra.forEach((s) => seen.add(s.id));
    } catch (e) {
      console.warn("[bc feeding] suplemento por dominio falló:", e);
    }
  }

  // Sesiones con override que no aparezcan arriba (agregadas a mano) → traer su meta.
  const outside = [...linkedIds].filter((sid) => !seen.has(sid));
  const extra: Row[] = outside.length
    ? await prisma.firefliesSession.findMany({ where: { id: { in: outside } }, select: SELECT })
    : [];

  const all = [...resolved, ...domainExtra, ...extra];

  const tRows = all.length
    ? await prisma.firefliesSession.findMany({ where: { id: { in: all.map((s) => s.id) } }, select: { id: true, transcript: true } })
    : [];
  const hasT = new Map(tRows.map((r) => [r.id, !!r.transcript?.trim()]));

  // Alimenta: override=true → sí; override=false → no; sin override → la regla (Ventas en la sala).
  const feeds = (s: Row): boolean => {
    const o = override.get(s.id);
    if (o === true) return true;
    if (o === false) return false;
    return hasVentas(s.participants, s.organizerEmail);
  };

  const meta = (s: Row): BcSessionMeta => ({
    sessionId: s.id,
    title: s.title,
    date: s.date,
    participants: s.participants,
    applies: hasVentas(s.participants, s.organizerEmail),
    hasTranscript: hasT.get(s.id) ?? false,
  });
  const byDateDesc = (a: { date: Date }, b: { date: Date }) => b.date.getTime() - a.date.getTime();

  const included = all.filter(feeds).map(meta).sort(byDateDesc);
  const candidates = all
    .filter((s) => !feeds(s))
    .map((s) => ({ ...meta(s), linkedExcluded: override.get(s.id) === false }))
    .sort((a, b) => Number(b.applies) - Number(a.applies) || byDateDesc(a, b));

  return { included, candidates, feedingIds: included.map((s) => s.sessionId) };
}
