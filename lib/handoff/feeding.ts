/**
 * lib/handoff/feeding.ts
 *
 * Feeding EFECTIVO del handoff de un proyecto (qué sesiones lo alimentarían hoy) y su
 * READINESS (¿hay material real para generar?). Reúsa el chokepoint de membresía
 * (getProjectHandoffSessions) + la política de link y la regla de relevancia
 * (session-relevance) — la MISMA lógica que aplica la generación en analyze/route.ts.
 *
 * Consumidores: el gate NO_HANDOFF_SOURCES del POST analyze (corta ANTES de crear el
 * AgentRun) y el GET /api/projects/[projectId]/handoff (subtítulo "N sesiones
 * alimentarán este handoff" en ProjectHandoffSection).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getProjectHandoffSessions, type ProjectSourceSession } from "@/lib/sessions/project-sources";
import { classifyHandoffSession, linkFeedsHandoff } from "@/lib/handoff/session-relevance";

/** Mínimo de chars de transcript para contar como "material real" (gate NO_HANDOFF_SOURCES). */
export const HANDOFF_MIN_TRANSCRIPT_CHARS = 200;

/** Sesiones que efectivamente alimentarán el handoff del proyecto (política linkFeedsHandoff). */
export async function computeHandoffFeeding(projectId: string): Promise<ProjectSourceSession[]> {
  const [{ sessions }, salesTeam] = await Promise.all([
    getProjectHandoffSessions(projectId),
    prisma.teamMember.findMany({
      where: { area: { in: ["Sales", "Ventas"] } },
      select: { email: true },
    }),
  ]);
  const salesEmails = new Set(salesTeam.map((m) => m.email.toLowerCase()));
  // organizerEmail ya viene plegado en participants (foldOrganizer del chokepoint).
  return sessions.filter((s) =>
    linkFeedsHandoff(s, classifyHandoffSession(s.title, s.participants, null, salesEmails).include),
  );
}

export interface HandoffReadiness {
  /** Sesiones que alimentarían el handoff hoy (política + regla). */
  feedingCount: number;
  /** De esas, cuántas tienen transcript real (> HANDOFF_MIN_TRANSCRIPT_CHARS). */
  withTranscript: number;
  /** Fuentes manuales vigentes del proyecto (HandoffSource sin borrar). */
  manualSources: number;
}

export async function computeHandoffReadiness(projectId: string): Promise<HandoffReadiness> {
  const feeding = await computeHandoffFeeding(projectId);
  const ids = feeding.map((s) => s.id);
  const [withTranscript, manualSources] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([] as { id: string }[])
      : // Raw: medir length del transcript sin cargar blobs de decenas de KB (≤20 filas).
        prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "FirefliesSession"
          WHERE id IN (${Prisma.join(ids)})
            AND length(coalesce(transcript, '')) > ${HANDOFF_MIN_TRANSCRIPT_CHARS}`,
    prisma.handoffSource.count({ where: { projectId, deletedAt: null } }),
  ]);
  return { feedingCount: feeding.length, withTranscript: withTranscript.length, manualSources };
}
