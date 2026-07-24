/**
 * lib/external/timeline-view.ts
 *
 * D.1.5 — lectura EXTERNA del cronograma, en dos piezas:
 *
 *   - readClientTimeline(projectId): EL filtro de seguridad del cronograma en
 *     UN solo lugar. Fases {name/order/durationWeeks/sessionCount/notes} y
 *     tareas {title, weekIndex, status, party} SOLO si detailConfirmedAt. Lo consumen los DOS
 *     chokepoints (kickoff-view para la sección embebida y el de esta página):
 *     un único select decide qué cruza al cliente — sin drift entre superficies.
 *   - getPublishedTimelineForToken(token): chokepoint de /external/cronograma.
 *     Doble check OBLIGATORIO en CADA lectura: acceso activo (forma del token +
 *     existencia + revokedAt, vía resolveActiveAccess) + timelinePublishedAt
 *     != null. Cualquiera falla → null (la cookie nunca otorga acceso sola).
 *
 * Por tarea cruzan {title, weekIndex, status, party}: el status y el party
 * (responsable) los muestra la página compartible del cronograma (gated por
 * "Subir"). NUNCA cruzan: notes/source/needsValidation de tarea, ni el source de
 * fase. Las tareas SUSPENDED (E) se EXCLUYEN por completo — algo descartado del
 * plan, no parte del cronograma del cliente. SÍ cruzan, by-design: las notas de
 * FASE (lenguaje cliente, D.1) y el activityType (D.1.5 — el Gantt del cliente
 * colorea y arma leyenda por tipo).
 *
 * PARTICULARIDADES (desviaciones curadas): cruzan SOLO las visibleExternal=true, y de
 * ellas solo {kind, party, title, detail, weeksImpact, phaseId, occurredAt}. NUNCA cruzan
 * source/needsValidation/createdByEmail. Gate por-registro (visibleExternal), fail-closed,
 * igual que el filtro de SUSPENDED — quedan congeladas en publishedSnapshot al "Subir".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import type { ExternalTimelineData } from "./timeline-view-types";
import { normalizePublishedTimeline } from "./snapshot-normalize";

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
          startWeek: true,
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
  let tasksByPhase: Map<string, Array<{ title: string; weekIndex: number; status: string; party: string | null; type: string | null }>> | null = null;
  if (tl?.detailConfirmedAt) {
    const tasks = await prisma.timelineTask.findMany({
      where: { phase: { timelineId: tl.id } },
      orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
      // status + party + type cruzan al cronograma compartible (gated por "Subir"); status además filtra SUSPENDED.
      select: { phaseId: true, title: true, weekIndex: true, status: true, party: true, type: true },
    });
    tasksByPhase = new Map();
    for (const t of tasks) {
      // E — una tarea SUSPENDED se descartó del plan: no es parte del cronograma del cliente.
      // Filtramos en JS (NO en un WHERE con el literal del enum) para no depender de que el valor
      // SUSPENDED exista ya en la DB — así funciona aunque la migración E se aplique recién al deploy.
      if (t.status === "SUSPENDED") continue;
      const arr = tasksByPhase.get(t.phaseId) ?? [];
      arr.push({ title: t.title, weekIndex: t.weekIndex, status: t.status, party: t.party, type: t.type });
      tasksByPhase.set(t.phaseId, arr);
    }
  }

  // Particularidades visibles al cliente — gate por-registro visibleExternal=true (fail-closed:
  // si dudo, no cruza), independiente de detailConfirmedAt (una desviación se comunica aunque el
  // detalle de tareas no esté confirmado). Select EXPLÍCITO de los 7 campos client-safe: NUNCA
  // cruzan source/needsValidation/createdByEmail NI sourceQuote (nota interna del CSE). Se congelan
  // dentro de publishedSnapshot al "Subir".
  let particularidades: ExternalTimelineData["particularidades"] = [];
  if (tl) {
    const parts = await prisma.particularidad.findMany({
      // DOS barreras a propósito (defensa en profundidad):
      //  · visibleExternal=true  → el CSE decidió que este hecho se comunica.
      //  · needsValidation=false → es un hecho CONFIRMADO, no una sugerencia sin revisar.
      // La segunda es redundante hoy (una sugerencia nace con visibleExternal=false y no se
      // puede prender sin aprobarla), y así debe quedar: si un día alguien agrega una vía
      // que prenda la visibilidad antes de la aprobación, el cliente igual no lo ve.
      where: { timelineId: tl.id, visibleExternal: true, needsValidation: false },
      orderBy: { occurredAt: "desc" },
      select: { kind: true, party: true, title: true, detail: true, weeksImpact: true, phaseId: true, occurredAt: true },
    });
    particularidades = parts.map((p) => ({
      kind: p.kind,
      party: p.party,
      title: p.title,
      detail: p.detail,
      weeksImpact: p.weeksImpact,
      phaseId: p.phaseId,
      occurredAt: p.occurredAt.toISOString(),
    }));
  }

  return {
    exists: !!tl,
    anchorStartDate: tl?.anchorStartDate?.toISOString() ?? null,
    phases: (tl?.phases ?? []).map((p) => ({
      ...p,
      ...(tasksByPhase ? { tasks: tasksByPhase.get(p.id) ?? [] } : {}),
    })),
    particularidades,
  };
}

/**
 * Lectura EXTERNA con STAGING (D.3): el cliente ve SOLO el SNAPSHOT publicado (la
 * foto client-safe congelada en el último "Subir"). Editar/guardar el plan NO la
 * toca → el cliente la ve recién al re-subir.
 *
 * Backfill perezoso (auto-migración): si la superficie está publicada pero todavía
 * NO tiene snapshot (cronograma publicado antes de D.3), congelamos el vivo actual
 * como snapshot y lo devolvemos — el cliente no ve vacío y, a partir de ahí, dejan
 * de filtrarse las ediciones (leer en vivo era el leak). Si ni siquiera existe el
 * timeline → vacío (fail-closed: NUNCA el vivo sin congelar). NO chequea publicación
 * ni acceso (eso es de los chokepoints que la llaman). Server-side only.
 */
export async function readPublishedClientTimeline(projectId: string): Promise<ExternalTimelineData> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { publishedSnapshot: true },
  });
  if (tl?.publishedSnapshot) {
    // El snapshot ya nace sin tareas SUSPENDED: se congela desde readClientTimeline (que las
    // filtra) tanto en publish-timeline como en el backfill de abajo — no hay status que filtrar acá.
    // SANEO antes de devolver: era un cast crudo, y un snapshot congelado viejo sin `phases`
    // reventaba al consumidor (el read vivo sí guarda `?? []`; el congelado no lo hacía).
    return normalizePublishedTimeline(tl.publishedSnapshot) as unknown as ExternalTimelineData;
  }
  if (!tl) return { exists: false, anchorStartDate: null, phases: [] };

  // Publicado sin snapshot → congelar el vivo actual (= lo que el cliente ya veía
  // por el fallback viejo) y devolverlo. Best-effort: si el update falla, igual
  // devolvemos esta foto (se reintenta en la próxima lectura).
  const live = await readClientTimeline(projectId);
  try {
    await prisma.projectTimeline.update({
      where: { projectId },
      data: { publishedSnapshot: live as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    console.error("[timeline-view] backfill de snapshot falló:", e instanceof Error ? e.message : e);
  }
  return live;
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

  const timeline = await readPublishedClientTimeline(access.project.id);
  await touchAccess(access.accessId);

  return {
    projectName: access.project.name,
    clientName: access.project.client.name,
    clientLogoUrl: access.project.client.logoUrl,
    timeline,
  };
}
