/**
 * GET /api/business-cases/[id]/session-candidates
 *
 * Sesiones de Fireflies del PROSPECTO, para el panel "Contexto para generar caso
 * de negocio". Devuelve:
 *   - included:   las marcadas como contexto (BusinessCaseSession.included=true).
 *   - candidates: las demás sesiones del prospecto, con `applies` (¿alguien de
 *                 Ventas en la sala?) y `hasTranscript`.
 *
 * Fuente principal: `resolvedClientId === client.id` (índice; la MISMA materialización
 * que usa el handoff, ya poblada por el resolve pipeline al crear el prospecto). SIN
 * ventana de recencia ni filtro de fecha — antes una ventana "600 más recientes"
 * quedaba copada por sesiones con fechas basura a futuro (2037-2038) y un filtro
 * `date <= now` ocultaba reuniones agendadas a futuro. Suplemento por DOMINIO (raw,
 * acotado) para prospectos cuyas sesiones aún no se materializaron en resolvedClientId.
 *
 * Solo lectura (no toca el módulo de sesiones). Incluir/excluir va por POST
 * /api/business-cases/[id]/sessions. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

const emailOf = (p: string): string => (p.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? "").toLowerCase();

type SessRow = { id: string; title: string; date: Date; participants: string[]; organizerEmail: string | null };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { client: { select: { id: true, emailDomains: true } } },
  });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  const domains = (bc.client.emailDomains ?? []).map((d) => d.toLowerCase()).filter(Boolean);

  const [salesRows, links] = await Promise.all([
    prisma.teamMember.findMany({ where: { area: { in: ["Sales", "Ventas"] } }, select: { email: true } }),
    prisma.businessCaseSession.findMany({ where: { businessCaseId: id }, select: { sessionId: true, included: true } }),
  ]);
  const salesEmails = new Set(salesRows.map((m) => m.email.toLowerCase()));
  const includedIds = new Set(links.filter((l) => l.included).map((l) => l.sessionId));
  const linkedIds = new Set(links.map((l) => l.sessionId));

  const hasVentas = (participants: string[], organizerEmail: string | null): boolean =>
    participants.some((p) => salesEmails.has(emailOf(p))) ||
    (organizerEmail ? salesEmails.has(organizerEmail.toLowerCase()) : false);

  const SELECT = { id: true, title: true, date: true, participants: true, organizerEmail: true } as const;

  // Principal: sesiones resueltas al Client del prospecto (índice resolvedClientId).
  const resolved: SessRow[] = await prisma.firefliesSession.findMany({
    where: { resolvedClientId: bc.client.id },
    orderBy: { date: "desc" },
    take: 200,
    select: SELECT,
  });
  const seen = new Set(resolved.map((s) => s.id));

  // Suplemento por dominio (prospectos aún no materializados). Raw + acotado; sin
  // ventana de recencia. EXISTS sobre participants (text[]) → no toca datos basura.
  let domainExtra: SessRow[] = [];
  if (domains.length) {
    try {
      const patterns = domains.map((d) => `%@${d}`);
      const rows = await prisma.$queryRaw<SessRow[]>(Prisma.sql`
        SELECT id, title, date, participants, "organizerEmail"
        FROM "FirefliesSession"
        WHERE EXISTS (SELECT 1 FROM unnest(participants) p WHERE lower(p) LIKE ANY(${patterns}))
        ORDER BY date DESC
        LIMIT 100`);
      domainExtra = rows.filter((s) => !seen.has(s.id));
      domainExtra.forEach((s) => seen.add(s.id));
    } catch (e) {
      console.warn("[bc session-candidates] suplemento por dominio falló (degrada a resolvedClientId):", e);
    }
  }

  // Incluidas que no aparezcan en lo anterior (agregadas a mano) → traer su meta.
  const includedOutside = [...includedIds].filter((sid) => !seen.has(sid));
  const extra: SessRow[] = includedOutside.length
    ? await prisma.firefliesSession.findMany({ where: { id: { in: includedOutside } }, select: SELECT })
    : [];

  const all = [...resolved, ...domainExtra, ...extra];

  // Presencia de transcript solo para este set acotado (evita cargar transcripts en masa).
  const tRows = all.length
    ? await prisma.firefliesSession.findMany({ where: { id: { in: all.map((s) => s.id) } }, select: { id: true, transcript: true } })
    : [];
  const hasT = new Map(tRows.map((r) => [r.id, !!r.transcript?.trim()]));

  const meta = (s: SessRow) => ({
    sessionId: s.id,
    title: s.title,
    date: s.date,
    participants: s.participants,
    applies: hasVentas(s.participants, s.organizerEmail),
    hasTranscript: hasT.get(s.id) ?? false,
  });
  const byDateDesc = (a: { date: Date }, b: { date: Date }) => b.date.getTime() - a.date.getTime();

  const included = all.filter((s) => includedIds.has(s.id)).map(meta).sort(byDateDesc);
  const candidates = all
    .filter((s) => !includedIds.has(s.id))
    .map((s) => ({ ...meta(s), linkedExcluded: linkedIds.has(s.id) }))
    .sort((a, b) => Number(b.applies) - Number(a.applies) || byDateDesc(a, b));

  return NextResponse.json({ included, candidates });
}
