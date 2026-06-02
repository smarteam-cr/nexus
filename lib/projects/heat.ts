/**
 * lib/projects/heat.ts
 *
 * "Heat" de un proyecto: cuántos AgentRun de análisis (post-sesión, sales,
 * service) se generaron en los últimos 30 días. Si >= HOT_THRESHOLD, el
 * proyecto se considera "caliente" y dispara comportamientos proactivos:
 *   - postProcessSession genera cards de contexto además de minute/acciones.
 *   - El sub-tab "Última minuta" arranca generación automática si entrás y
 *     todavía no hay minute (en vez de mostrar CTA).
 *
 * Cacheado en memoria 5 minutos para no martillar la DB en cada render.
 */
import { prisma } from "@/lib/db/prisma";
import { unstable_cache, revalidateTag } from "next/cache";

export const HOT_THRESHOLD = 3;
export const HOT_WINDOW_DAYS = 30;
const HEAT_AGENTS = [
  "agent-post-session",
  "agent-sales-analysis",
  "agent-service-analysis",
];

async function countRecentRuns(projectId: string): Promise<number> {
  const since = new Date(Date.now() - HOT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return prisma.agentRun.count({
    where: {
      projectId,
      status: "DONE",
      createdAt: { gte: since },
      agentId: { in: HEAT_AGENTS },
    },
  });
}

/**
 * Cacheado 5 min con tag "project-heat:<id>".
 * Llamá `invalidateProjectHeat(projectId)` después de crear un nuevo AgentRun.
 */
export async function isProjectHot(projectId: string): Promise<boolean> {
  const count = await getRecentRunsCount(projectId);
  return count >= HOT_THRESHOLD;
}

export const getRecentRunsCount = (projectId: string) =>
  unstable_cache(
    async () => countRecentRuns(projectId),
    [`project-heat-count-${projectId}`],
    { tags: [`project-heat:${projectId}`], revalidate: 300 },
  )();

export function invalidateProjectHeat(projectId: string): void {
  try {
    // Next 15 cambió la firma: (tag, profile). "default" usa el TTL del cache().
    revalidateTag(`project-heat:${projectId}`, "default");
  } catch {
    // Fuera de contexto request (ej. background job) — el caché se vencerá solo
  }
}
