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
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import { fetchCompanyTimelineItems, projectEraSince } from "@/lib/hubspot/company-timeline";

/** Mínimo de chars de transcript para contar como "material real" (gate NO_HANDOFF_SOURCES). */
export const HANDOFF_MIN_TRANSCRIPT_CHARS = 200;

/** Sesiones que efectivamente alimentarán el handoff del proyecto (política linkFeedsHandoff). */
export async function computeHandoffFeeding(projectId: string): Promise<ProjectSourceSession[]> {
  const [{ sessions }, salesEmails] = await Promise.all([
    getProjectHandoffSessions(projectId),
    salesPresenceEmails(),
  ]);
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

/**
 * ¿El proyecto tiene engagements de HubSpot dentro de su ERA? (reuniones/llamadas/notas
 * de venta que NO vinieron por el sync de Meet pero sí quedan en el registro de la
 * company). Es el PISO de material del gate cuando no hay ni sesión-feeding ni fuente
 * manual: el handoff igual debe poder generarse con el contexto de HubSpot. Una sola
 * llamada a la API v1 (misma vía/era que la generación). best-effort: sin company o
 * ante error → false (el gate cae al "totalmente vacío"). Se consulta SOLO cuando ya
 * no hay otro material, así el caso común no paga el round-trip.
 */
export async function projectHasEraEngagements(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      createdAt: true,
      hubspotCreatedAt: true,
      client: { select: { id: true, hubspotCompanyId: true } },
    },
  });
  const companyId = project?.client?.hubspotCompanyId;
  if (!project || !companyId) return false;
  try {
    const { getSystemHubspotClient, getHubspotClient } = await import("@/lib/hubspot/client");
    // Mismo criterio que la generación: cuenta propia del cliente si existe, si no la del sistema.
    const hsAccount = await prisma.hubspotAccount.findFirst({
      where: { clientId: project.client.id },
      select: { id: true },
    });
    const hsClient = hsAccount ? await getHubspotClient(hsAccount.id) : await getSystemHubspotClient();
    const items = await fetchCompanyTimelineItems(hsClient, companyId, { since: projectEraSince(project) });
    return items.length > 0;
  } catch {
    return false;
  }
}
