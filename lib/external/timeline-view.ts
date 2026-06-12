/**
 * lib/external/timeline-view.ts
 *
 * D.1.5 — lectura EXTERNA del cronograma, en dos piezas:
 *
 *   - readClientTimeline(projectId): EL filtro de seguridad del cronograma en
 *     UN solo lugar. Fases {name/order/durationWeeks/sessionCount/notes} y
 *     tareas {title, weekIndex} SOLO si detailConfirmedAt. Lo consumen los DOS
 *     chokepoints (kickoff-view para la sección embebida y el de esta página):
 *     un único select decide qué cruza al cliente — sin drift entre superficies.
 *   - getPublishedTimelineForToken(token): chokepoint de /external/cronograma.
 *     Doble check OBLIGATORIO en CADA lectura: acceso activo (forma del token +
 *     existencia + revokedAt, vía resolveActiveAccess) + timelinePublishedAt
 *     != null. Cualquiera falla → null (la cookie nunca otorga acceso sola).
 *
 * NUNCA cruzan: status/notes/source/needsValidation de tarea, ni el source de
 * fase. SÍ cruzan, by-design: las notas de FASE (lenguaje cliente, D.1) y el
 * activityType (D.1.5 — el Gantt del cliente colorea y arma leyenda por tipo).
 */
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import type { ExternalTimelineData } from "./timeline-view-types";

/** Lo que la página /external/cronograma pasa a su render. */
export interface ExternalTimelinePage {
  projectName: string;
  /** Nombre de la EMPRESA cliente — el titular de la página lo lleva. */
  clientName: string;
  /** Logo de la EMPRESA cliente (Client.logoUrl, bucket público) o null. */
  clientLogoUrl: string | null;
  timeline: ExternalTimelineData;
}

/**
 * Lectura del cronograma en shape cliente. NO chequea publicación ni acceso —
 * eso es de los chokepoints que la llaman. Server-side only.
 */
export async function readClientTimeline(projectId: string): Promise<ExternalTimelineData> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      anchorStartDate: true,
      detailConfirmedAt: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          sessionCount: true,
          notes: true,
          activityType: true,
        },
      },
    },
  });

  // Acciones por semana SOLO si el CSE confirmó el detalle (D.1). Gate
  // server-side: sin confirmación las tareas ni se consultan — jamás llegan
  // al JSON del browser. Select explícito: título + semana, nada interno.
  let tasksByPhase: Map<string, Array<{ title: string; weekIndex: number }>> | null = null;
  if (tl?.detailConfirmedAt) {
    const tasks = await prisma.timelineTask.findMany({
      where: { phase: { timelineId: tl.id } },
      orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
      select: { phaseId: true, title: true, weekIndex: true },
    });
    tasksByPhase = new Map();
    for (const t of tasks) {
      const arr = tasksByPhase.get(t.phaseId) ?? [];
      arr.push({ title: t.title, weekIndex: t.weekIndex });
      tasksByPhase.set(t.phaseId, arr);
    }
  }

  return {
    exists: !!tl,
    anchorStartDate: tl?.anchorStartDate?.toISOString() ?? null,
    phases: (tl?.phases ?? []).map((p) => ({
      ...p,
      ...(tasksByPhase ? { tasks: tasksByPhase.get(p.id) ?? [] } : {}),
    })),
  };
}

/**
 * Chokepoint de /external/cronograma. Devuelve el shape listo para render o
 * null si el acceso no aplica (token inválido/inexistente, revocado, o
 * cronograma NO publicado) — el motivo nunca se revela.
 */
export async function getPublishedTimelineForToken(
  token: string,
): Promise<ExternalTimelinePage | null> {
  const access = await resolveActiveAccess(token);
  if (!access) return null;

  // Check de superficie EXPLÍCITO (regla unificada D.1.5): despublicar el
  // cronograma corta el acceso a esta página en el render siguiente.
  if (!access.project.timelinePublishedAt) return null;

  const timeline = await readClientTimeline(access.project.id);
  await touchAccess(access.accessId);

  return {
    projectName: access.project.name,
    clientName: access.project.client.name,
    clientLogoUrl: access.project.client.logoUrl,
    timeline,
  };
}
