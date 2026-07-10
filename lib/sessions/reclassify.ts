/**
 * lib/sessions/reclassify.ts
 *
 * Re-clasificación de sesiones al CAMBIAR EL PANORAMA de proyectos del cliente
 * (nace un proyecto). Cierra el hueco de que los links del atajo "1 solo proyecto
 * activo" eran permanentes: cuando aparece el segundo proyecto, las sesiones que
 * se pegaron al primero por ser el único nunca se reconsideraban (caso RC
 * Inmobiliaria: 5 sesiones al proyecto DocuSign 3 minutos antes de crearse el
 * proyecto CRM).
 *
 * Candidatas: sesiones del cliente (ownership materializado: resolvedClientId /
 * manualClientId — mismo criterio que autoClassifyOrphanSessions) cuyos links sean
 * TODOS de IA sin señal humana (ver `isLockedLink`), más las huérfanas (sin link).
 * Cualquier link tocado por humano (manual / revisado / tombstone / override de
 * handoff) saca a la sesión de la lista: su curación es durable.
 *
 * Secuencial a propósito (rate limits del LLM). Costo típico ~US$0.03-0.04 por
 * sesión multi-proyecto (sonnet, transcript 30k) → un trigger completo ≈ US$1.
 *
 * Triggers (fire-and-forget): sync de HubSpot al crear proyecto, creación manual
 * de proyecto, y el stepper de handoff al crear proyecto nuevo.
 */
import { prisma } from "@/lib/db/prisma";
import { classifySessionToProjects } from "@/lib/sessions/classify-session-project";
import { isLockedLink } from "@/lib/sessions/session-project-locks";

const DEFAULT_SINCE_DAYS = 90;
const DEFAULT_MAX_SESSIONS = 30;

export interface ReclassifyResult {
  /** Sesiones que entraron al loop (huérfanas o con todos los links vírgenes). */
  candidates: number;
  classified: number;
  skipped: number;
  errors: number;
}

/**
 * Re-corre el clasificador sobre las sesiones re-clasificables del cliente.
 * `sinceDays` acota la ventana (default 90 días); `max` el tope de sesiones por
 * corrida (default 30, más recientes primero) para acotar el gasto de tokens.
 */
export async function reclassifyClientSessions(
  clientId: string,
  opts: { sinceDays?: number; max?: number } = {},
): Promise<ReclassifyResult> {
  const sinceDays = opts.sinceDays ?? DEFAULT_SINCE_DAYS;
  const max = opts.max ?? DEFAULT_MAX_SESSIONS;
  const now = new Date();
  const since = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000);

  // date <= now: excluye las sesiones con fecha corrupta 2037+ (anomalía conocida del sync).
  const sessions = await prisma.firefliesSession.findMany({
    where: {
      OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }],
      date: { gte: since, lte: now },
    },
    orderBy: { date: "desc" },
    take: 200,
    select: {
      id: true,
      projects: {
        select: { source: true, reviewedAt: true, included: true, handoffOverride: true },
      },
    },
  });

  // `.every` sobre lista vacía = true → las huérfanas entran solas.
  const candidates = sessions
    .filter((s) => s.projects.every((l) => !isLockedLink(l)))
    .slice(0, max);

  let classified = 0;
  let skipped = 0;
  let errors = 0;
  for (const s of candidates) {
    try {
      const r = await classifySessionToProjects(s.id, clientId);
      if (r.status === "ok") classified++;
      else if (r.status === "skipped") skipped++;
      else {
        errors++;
        console.warn(`[reclassify] sesión ${s.id}: ${r.reason}`);
      }
    } catch (e) {
      errors++;
      console.warn(`[reclassify] sesión ${s.id} lanzó: ${(e as Error).message}`);
    }
  }

  console.log(
    `[reclassify] cliente=${clientId}: ${classified} clasificadas, ${skipped} skip, ` +
      `${errors} error(es) — ${candidates.length} candidatas de ${sessions.length} sesiones en ventana`,
  );
  return { candidates: candidates.length, classified, skipped, errors };
}
