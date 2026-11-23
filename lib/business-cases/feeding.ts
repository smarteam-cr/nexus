/**
 * lib/business-cases/feeding.ts
 *
 * Sesiones del prospecto que ALIMENTAN un business case. Regla (igual que el
 * handoff): una sesión del prospecto alimenta si tiene a alguien de Ventas en la
 * sala, salvo override explícito del CSE (BusinessCaseSession.included). Así las
 * sesiones relevantes quedan PRE-SELECCIONADAS sin que el CSE las busque a mano.
 *
 * ⚠ SALVO LAS QUE YA SON DE UN PROYECTO (2026-10-08, F-4 de Feedback). La regla no tenía ni
 * ventana ni proyecto, y en un cliente con historia arrastraba TODO: RC Inmobiliaria abría una
 * propuesta nueva con 23 reuniones desde 2023, las de los proyectos en curso incluidas, y Ventas
 * tenía que sacarlas de a una para quedarse con la última. Una reunión atada a un proyecto
 * (`SessionProject`) ya es la venta o la entrega de ESE proyecto: no alimenta sola una propuesta
 * nueva. Sigue en «Buscar», marcada `enProyecto`, por si sí hace falta.
 *
 * ⚠ SOLO LAS REUNIONES DE LA EMPRESA, por el lugar único (2026-11-23). Las reuniones salen de
 * `getClientSessions` (lib/sessions/project-sources.ts): las que `resolvedClientId` (o la asignación a mano) dan como
 * de esta empresa, y nada más. Hasta ese día la propuesta tenía su propia regla: sumaba por dominio reuniones SIN
 * dueño y aceptaba vínculos a mano a reuniones sin dueño. Una reunión sin dueño es justo la que el resolver no pudo
 * atribuir (por ejemplo, gente de dos empresas que comparten dominio), y meterla al prompt de una propuesta es el
 * invariante 1 con otra cara (docs/evaluacion-de-nexus-2026-11.md §3.1). Medido ese día en producción: 0 propuestas
 * usaban alguna. Si una reunión de un prospecto no tiene dueño, se le asigna en Sesiones y entra sola.
 *
 * Lo usan el panel (/session-candidates) y la generación (/generate) para no duplicar el criterio. Solo lectura.
 * El panel muestra también las agendadas (`conAgendadas`): las ve una persona. A la generación (`feedingIds`) solo van
 * las que ya ocurrieron: una agendada puede traer texto si alguien movió al futuro un evento que ya había pasado.
 */
import { prisma } from "@/lib/db/prisma";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import { getClientSessions, type ProjectSourceSession } from "@/lib/sessions/project-sources";
import { yaOcurrio } from "@/lib/sessions/ocurridas";

const emailOf = (p: string): string => (p.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? "").toLowerCase();

export type BcSessionMeta = {
  sessionId: string;
  title: string;
  date: Date;
  participants: string[];
  applies: boolean;        // ¿hay alguien de Ventas en la sala? (regla de auto-feed)
  hasTranscript: boolean;
  /** Ya es de un proyecto: no entra sola (ver el encabezado). */
  enProyecto: boolean;
};

export interface BcFeedingResult {
  /** Sesiones que alimentan el caso (pre-seleccionadas): override=true o (sin override y aplica). */
  included: BcSessionMeta[];
  /** Las demás sesiones del prospecto (para "Buscar más sesiones"). */
  candidates: (BcSessionMeta & { linkedExcluded: boolean })[];
  /** Ids que alimentan (para juntar transcripts en la generación): las incluidas que ya ocurrieron. */
  feedingIds: string[];
}

export async function loadBcFeeding(businessCaseId: string): Promise<BcFeedingResult | null> {
  const bc = await prisma.businessCase.findUnique({ where: { id: businessCaseId }, select: { clientId: true } });
  if (!bc) return null;

  const [salesEmails, links] = await Promise.all([
    salesPresenceEmails(),
    prisma.businessCaseSession.findMany({ where: { businessCaseId }, select: { sessionId: true, included: true } }),
  ]);
  // Override del CSE por sesión: true=incluir, false=excluir. Sin entrada = decide la regla.
  const override = new Map(links.map((l) => [l.sessionId, l.included]));
  const linkedIds = new Set(links.map((l) => l.sessionId));

  // `participants` ya trae al organizador (el lugar único lo suma): con eso alcanza para ver si hubo Ventas en la sala.
  const hasVentas = (participants: string[]): boolean => participants.some((p) => salesEmails.has(emailOf(p)));

  const resolved = await getClientSessions(bc.clientId, { take: 200, conAgendadas: true });
  const seen = new Set(resolved.map((s) => s.id));

  // Las agregadas a mano que no salieron arriba (más viejas que las 200): por el mismo lugar único, así que un vínculo
  // viejo a una reunión de otro cliente o sin dueño no entra.
  const outside = [...linkedIds].filter((sid) => !seen.has(sid));
  const extra = outside.length ? await getClientSessions(bc.clientId, { ids: outside, conAgendadas: true }) : [];

  const all: ProjectSourceSession[] = [...resolved, ...extra];

  const tRows = all.length
    ? await prisma.firefliesSession.findMany({ where: { id: { in: all.map((s) => s.id) } }, select: { id: true, transcript: true } })
    : [];
  const hasT = new Map(tRows.map((r) => [r.id, !!r.transcript?.trim()]));
  const deProyecto = all.length
    ? new Set(
        (await prisma.sessionProject.findMany({ where: { sessionId: { in: all.map((s) => s.id) } }, select: { sessionId: true } })).map(
          (r) => r.sessionId,
        ),
      )
    : new Set<string>();

  // Alimenta: override=true → sí; override=false → no; sin override → la regla (Ventas en la sala
  // y todavía no es de ningún proyecto).
  const feeds = (s: ProjectSourceSession): boolean => {
    const o = override.get(s.id);
    if (o === true) return true;
    if (o === false) return false;
    return hasVentas(s.participants) && !deProyecto.has(s.id);
  };

  const meta = (s: ProjectSourceSession): BcSessionMeta => ({
    sessionId: s.id,
    title: s.title,
    date: new Date(s.date),
    participants: s.participants,
    applies: hasVentas(s.participants),
    hasTranscript: hasT.get(s.id) ?? false,
    enProyecto: deProyecto.has(s.id),
  });
  const byDateDesc = (a: { date: Date }, b: { date: Date }) => b.date.getTime() - a.date.getTime();

  const included = all.filter(feeds).map(meta).sort(byDateDesc);
  const candidates = all
    .filter((s) => !feeds(s))
    .map((s) => ({ ...meta(s), linkedExcluded: override.get(s.id) === false }))
    .sort((a, b) => Number(b.applies) - Number(a.applies) || byDateDesc(a, b));

  // Lo que va a la generación: solo las que ya ocurrieron. El panel muestra la agendada como incluida (va a alimentar
  // cuando pase), pero su texto no llega al modelo: una reunión que alguien movió al futuro conserva la transcripción
  // vieja (KNOWN-ERRORS), y `conAgendadas` nunca es para un prompt.
  const feedingIds = included.filter((s) => yaOcurrio(s.date)).map((s) => s.sessionId);
  return { included, candidates, feedingIds };
}
