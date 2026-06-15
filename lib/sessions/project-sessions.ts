/**
 * lib/sessions/project-sessions.ts
 *
 * Helper: las sesiones PASADAS de un proyecto, con su transcript serializado.
 * Lo usa el cronograma vivo (D.2) para que el agente de avance cruce lo que ya
 * ocurrió con la etapa de HubSpot. Factoriza el patrón inline del handoff
 * (SessionProject.findMany → FirefliesSession) y le agrega:
 *   - filtro temporal: solo sesiones con date <= now (las futuras no son avance),
 *   - el transcript (reusa fetchTranscriptContent, misma fuente que el handoff).
 */
import { prisma } from "@/lib/db/prisma";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";

export interface PastSessionContext {
  id: string;
  title: string;
  date: Date;
  /** Transcript/summary serializado a markdown, o null si no hay contenido. */
  content: string | null;
}

/**
 * Devuelve las sesiones del proyecto que YA ocurrieron (date <= now), de más
 * antigua a más reciente, con su transcript. `limit` acota a las N más recientes
 * (se devuelven igual en orden cronológico) para no inflar el prompt.
 */
export async function getPastSessionsForProject(
  projectId: string,
  opts: { limit?: number } = {},
): Promise<PastSessionContext[]> {
  const now = new Date();
  const links = await prisma.sessionProject.findMany({
    where: { projectId, session: { date: { lte: now } } },
    orderBy: { session: { date: "desc" } },
    take: opts.limit ?? 12,
    select: { session: { select: { id: true, title: true, date: true } } },
  });

  // De más antigua a más reciente (el avance se lee mejor en orden cronológico).
  const sessions = links
    .map((l) => l.session)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const out: PastSessionContext[] = [];
  for (const s of sessions) {
    const content = await fetchTranscriptContent(s.id, s.title ?? "(sin título)");
    out.push({ id: s.id, title: s.title ?? "(sin título)", date: s.date, content });
  }
  return out;
}
