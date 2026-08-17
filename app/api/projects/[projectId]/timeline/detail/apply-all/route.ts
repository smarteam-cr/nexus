/**
 * POST /api/projects/[projectId]/timeline/detail/apply-all
 *
 * Aplica el set CURADO de TODAS las fases del cronograma de una sola vez ("Regenerar todo el
 * cronograma", Tanda N) — la generalización de .../timeline/phases/[phaseId]/apply a N fases
 * en UNA transacción. Cada fase se aplica con applyCuratedPhaseTasks; al final, UNA sola
 * invalidación de pendingProgress + marca de edición humana.
 *
 * ⚠ Esta línea decía "preserva DONE/iniciadas/manuales" y era FALSA hasta 2026-08-11: la regla
 * vivía solo en el cliente y el servidor borraba todo lo que no viniera en el payload. Ahora sí
 * es cierta, y la sostiene `repartoDeBorrado` (lib/timeline/apply-curated-phase.ts). Lo que se
 * conservó pese a venir omitido viaja en la respuesta como `preservadas`.
 *
 * Gate por RADIO DE EXPLOSIÓN, no por endpoint (guardTimelineDetailApply): con tareas ya
 * escritas pide la vara del regen completo; sobre un cronograma VACÍO —la primera generación,
 * que desde 2026-08-16 también pasa por acá— alcanza la del apply por fase. Ver su docblock.
 *
 * Además del set curado, acepta por fase el `activityType` PROPUESTO por el agente: lo escribía
 * el camino directo que se retiró, y sin esto las fases nacerían sin tipo (el color de la barra
 * del Gantt y la leyenda que ve el cliente). Se aplica solo-si-null: nunca pisa lo elegido a mano.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineDetailApply } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { normalizeCuratedTasks, applyCuratedPhaseTasks } from "@/lib/timeline/apply-curated-phase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineDetailApply(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const bodyPhases = (body as { phases?: unknown })?.phases;
  if (!Array.isArray(bodyPhases)) {
    return NextResponse.json({ error: "Falta la lista de fases" }, { status: 400 });
  }
  /* Trazabilidad: de qué corrida salió el detalle. Lo escribía el camino directo; se conserva
     acá para que la columna no quede muda cuando la generación pasa por curación. */
  const agentRunId =
    typeof (body as { agentRunId?: unknown })?.agentRunId === "string" && (body as { agentRunId: string }).agentRunId
      ? (body as { agentRunId: string }).agentRunId
      : null;
  const reason =
    typeof (body as { reason?: unknown })?.reason === "string" && (body as { reason: string }).reason.trim()
      ? (body as { reason: string }).reason.trim()
      : "Regeneración completa del cronograma (curada)";

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      phases: {
        select: {
          id: true,
          durationWeeks: true,
          activityType: true,
          tasks: {
            select: { id: true, title: true, weekIndex: true, order: true, notes: true, party: true, type: true, source: true, status: true, actualStart: true },
          },
        },
      },
    },
  });
  if (!tl) {
    return NextResponse.json({ error: "El proyecto no tiene cronograma" }, { status: 404 });
  }

  const phaseById = new Map(tl.phases.map((p) => [p.id, p]));
  // Anti-alucinación: ignorar cualquier phaseId que no pertenezca a ESTE timeline — mismo
  // criterio que el resto del módulo de cronograma con ids del agente/cliente.
  const entries = bodyPhases
    .filter((e): e is { phaseId: string; tasks: unknown[] } => {
      if (!e || typeof e !== "object") return false;
      const rec = e as Record<string, unknown>;
      return typeof rec.phaseId === "string" && phaseById.has(rec.phaseId) && Array.isArray(rec.tasks);
    })
    .map((e) => ({
      phase: phaseById.get(e.phaseId)!,
      rawTasks: e.tasks,
      // El tipo propuesto viaja como string suelto; Prisma valida el enum al escribir, y solo
      // se intenta cuando la fase lo tiene en null (ver abajo).
      activityType: ((): string | null => {
        const at = (e as unknown as Record<string, unknown>).activityType;
        return typeof at === "string" && at ? at : null;
      })(),
    }));
  if (entries.length === 0) {
    return NextResponse.json({ error: "Sin fases válidas para aplicar" }, { status: 400 });
  }

  const now = new Date();
  /* Tareas que el payload omitió pero el servidor conservó por tener progreso encima. En el
     camino feliz es 0 — si no lo es, algo llegó incompleto y vale decirlo en vez de tragarlo. */
  let preservadas = 0;
  await prisma.$transaction(async (tx) => {
    for (const { phase, rawTasks, activityType } of entries) {
      /* Solo-si-null, igual que el camino que se retiró: el tipo que el CSE eligió a mano manda
         sobre el que propone el modelo. Un tipo inválido lo rechaza Prisma (enum), no un if. */
      if (activityType && phase.activityType === null) {
        await tx.timelinePhase.update({
          where: { id: phase.id },
          data: { activityType: activityType as never },
        });
      }
      const existingIds = new Set(phase.tasks.map((t) => t.id));
      const curated = normalizeCuratedTasks(rawTasks, phase.durationWeeks, existingIds);
      const r = await applyCuratedPhaseTasks(tx, {
        phaseId: phase.id, timelineId: tl.id, existingTasks: phase.tasks, curated, now,
        actorEmail: guard.user.email ?? null,
      });
      preservadas += r.preservadasPorProgreso;
    }
    // UNA sola invalidación de avance + marca de edición humana, tras aplicar TODAS las fases.
    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: {
        lastEditedByHuman: now,
        pendingProgress: Prisma.DbNull,
        pendingProgressRunId: null,
        ...(agentRunId ? { detailGeneratedByAgentRunId: agentRunId } : {}),
      },
    });
  }, { maxWait: 20000, timeout: 60000 }); // más fases que un regen por fase → más margen

  // Audit best-effort POST-tx (no rollbackea): un solo snapshot del timeline completo.
  try {
    const snapPhases = await prisma.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: {
        id: true, name: true, order: true, durationWeeks: true, startWeek: true, sessionCount: true,
        activityType: true, status: true,
        tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: { id: true, title: true, weekIndex: true, order: true, status: true } },
      },
    });
    const tlRow = await prisma.projectTimeline.findUnique({ where: { id: tl.id }, select: { anchorStartDate: true } });
    await prisma.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason,
        kind: "AI_ASSIST",
        instruction:
          `Regeneración completa del cronograma (curada, ${entries.length} fases)` +
          (preservadas > 0 ? ` · ${preservadas} tarea(s) con progreso se conservaron pese a venir omitidas` : ""),
        changedByEmail: guard.user.email ?? null,
        snapshot: {
          anchorStartDate: tlRow?.anchorStartDate?.toISOString() ?? null,
          phases: snapPhases,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[timeline/detail/apply-all] audit best-effort falló:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, phasesApplied: entries.length, preservadas });
}
