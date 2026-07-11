/**
 * lib/timeline/reanchor.ts
 *
 * Re-anclaje AUTOMÁTICO del cronograma al Kick Off real (ciclo de vida). El caso
 * que arregla: el cronograma nace anclado a una fecha vieja/incorrecta (kickoff de
 * un proyecto anterior del mismo cliente — bug ya corregido en getKickoffSessionDate)
 * y el panel muestra semanas de "atraso" falso desde el día uno.
 *
 * GUARDAS (solo re-ancla cuando es inocuo):
 *   - hay fecha de Kick Off real y difiere del ancla actual (comparación por DÍA),
 *   - el cronograma existe y NO tiene avance real (ningún actualStart/actualEnd ni
 *     TimelineChange PROGRESS) — con avance, mover el ancla reescribiría historia,
 *   - NO hay baseline activa — la baseline congela la promesa al cliente; pisarle
 *     el ancla viva no arregla los vencidos (se comparan contra el snapshot) y
 *     re-publicar es decisión del CSE. En ese caso: no-op con log (la sugerencia
 *     de kickoff ya se muestra en el Gantt, y el watchdog ve ambas fechas).
 *
 * Al aplicar: TimelineChange kind=REANCHOR (reversible — el before queda en el
 * reason y el CSE puede re-editar el ancla en el Gantt) + TimelineEvent
 * ANCHOR_CHANGED source=SYSTEM (despierta al watchdog, que es el ÚNICO escritor
 * de CsAlert — el aviso a la CSL sale por ese camino) + CsAccountBrief.staleAt.
 *
 * Best-effort por diseño: los hooks (post-process de sesiones, publish-kickoff)
 * lo llaman en try/catch — un fallo acá no tumba nada.
 */
import { prisma } from "@/lib/db/prisma";
import { getKickoffSessionDate } from "@/lib/sessions/project-sessions";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";

export type ReanchorResult =
  | { action: "reanchored"; from: string | null; to: string }
  | { action: "skipped"; reason: "no_kickoff" | "no_timeline" | "same_anchor" | "has_progress" }
  | { action: "baseline_notice"; kickoffAt: string; anchorAt: string | null };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function maybeReanchorToKickoff(projectId: string): Promise<ReanchorResult> {
  const kickoffAt = await getKickoffSessionDate(projectId);
  if (!kickoffAt || kickoffAt.getTime() > Date.now()) return { action: "skipped", reason: "no_kickoff" };

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      anchorStartDate: true,
      project: { select: { clientId: true } },
      phases: {
        select: {
          actualStart: true,
          actualEnd: true,
          tasks: { select: { actualStart: true, actualEnd: true } },
        },
      },
      baselines: { where: { isActive: true }, take: 1, select: { id: true } },
      changes: { where: { kind: "PROGRESS" }, take: 1, select: { id: true } },
    },
  });
  if (!tl || tl.phases.length === 0) return { action: "skipped", reason: "no_timeline" };
  if (day(tl.anchorStartDate) === day(kickoffAt)) return { action: "skipped", reason: "same_anchor" };

  const hasProgress =
    tl.changes.length > 0 ||
    tl.phases.some(
      (p) =>
        p.actualStart || p.actualEnd || p.tasks.some((t) => t.actualStart || t.actualEnd),
    );
  if (hasProgress) return { action: "skipped", reason: "has_progress" };

  if (tl.baselines.length > 0) {
    console.log(
      `[reanchor] ${projectId}: Kick Off real ${day(kickoffAt)} ≠ ancla ${day(tl.anchorStartDate)}, pero hay baseline activa → sin re-anclaje automático (re-publicar es del CSE)`,
    );
    return {
      action: "baseline_notice",
      kickoffAt: kickoffAt.toISOString(),
      anchorAt: tl.anchorStartDate?.toISOString() ?? null,
    };
  }

  const before = tl.anchorStartDate;
  await prisma.$transaction([
    prisma.projectTimeline.update({
      where: { projectId },
      data: { anchorStartDate: kickoffAt },
    }),
    prisma.timelineChange.create({
      data: {
        timelineId: tl.id,
        kind: "REANCHOR",
        reason: `Re-anclaje automático al Kick Off real (sesión del ${day(kickoffAt)}). Ancla anterior: ${day(before) ?? "(vacía)"}. Reversible: editá el arranque en el Gantt si no corresponde.`,
        snapshot: { anchorStartDate: kickoffAt.toISOString(), anchorBefore: before?.toISOString() ?? null },
      },
    }),
  ]);

  await emitTimelineEventsSafe(
    prisma,
    {
      projectId,
      clientId: tl.project.clientId,
      timelineId: tl.id,
      actorEmail: null,
      source: "SYSTEM",
    },
    [
      {
        entityType: "TIMELINE",
        label: `Re-anclaje automático al Kick Off real (${day(kickoffAt)})`,
        action: "ANCHOR_CHANGED",
        before: { anchorStartDate: before?.toISOString() ?? null },
        after: { anchorStartDate: kickoffAt.toISOString() },
      },
    ],
  );
  // El resumen ejecutivo de la cuenta quedó desactualizado (fechas del plan cambiaron).
  await prisma.csAccountBrief
    .updateMany({ where: { clientId: tl.project.clientId }, data: { staleAt: new Date() } })
    .catch(() => {});

  console.log(`[reanchor] ${projectId}: ancla ${day(before) ?? "(vacía)"} → ${day(kickoffAt)}`);
  return { action: "reanchored", from: before?.toISOString() ?? null, to: kickoffAt.toISOString() };
}
