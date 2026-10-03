/**
 * PATCH /api/projects/[projectId]/timeline/arranque — cambiar SOLO la fecha de arranque.
 *
 * ── POR QUÉ EXISTE (2026-10-02) ──────────────────────────────────────────────
 * En la portada del kickoff la fecha de arranque no se podía editar a mano: solo pidiéndosela
 * al chat, que escribía un TEXTO encima («23 de septiembre») sin mover el cronograma. Resultado
 * en «CAV - SHP»: la portada decía una fecha, el cronograma otra y el enlace del cliente una
 * tercera. Ahora la portada edita LA fecha —el ancla del cronograma—, una sola verdad para el
 * kickoff, el cronograma, el PDF y (al subir) el enlace del cliente.
 *
 * Mismo permiso que editar el cronograma y el mismo rastro que el Gantt: evento ANCHOR_CHANGED
 * para el vigilante y una fila de TimelineChange con el corrimiento del cierre. No toca fases.
 * Body: `{ anchorStartDate: "YYYY-MM-DD" | null }`.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { projectedEnd, describeEndShift, fmtFull } from "@/lib/timeline/weeks";

type Params = Promise<{ projectId: string }>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => null)) as { anchorStartDate?: unknown } | null;
  const raw = body?.anchorStartDate;
  if (raw !== null && !(typeof raw === "string" && FECHA.test(raw))) {
    return NextResponse.json({ error: "La fecha tiene que venir como AAAA-MM-DD (o null para quitarla)." }, { status: 400 });
  }
  const nueva = raw === null ? null : new Date(`${raw}T00:00:00.000Z`);
  if (nueva && isNaN(nueva.getTime())) {
    return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
  }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, anchorStartDate: true, phases: { select: { durationWeeks: true, startWeek: true } } },
  });
  if (!tl) {
    return NextResponse.json({ error: "El proyecto todavía no tiene cronograma: genéralo primero." }, { status: 409 });
  }
  const antesISO = tl.anchorStartDate?.toISOString() ?? null;
  const despuesISO = nueva?.toISOString() ?? null;
  if (antesISO === despuesISO) {
    return NextResponse.json({ anchorStartDate: despuesISO, cambio: false });
  }

  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { anchorStartDate: nueva, lastEditedByHuman: new Date() },
  });

  const corrimiento = describeEndShift(projectedEnd(antesISO, tl.phases), projectedEnd(despuesISO, tl.phases));
  const actor = guard.user.email ?? null;
  await emitTimelineEventsSafe(
    prisma,
    { projectId, clientId: guard.clientId, timelineId: tl.id, actorEmail: actor, source: "UI_PUT" },
    [
      {
        entityType: "TIMELINE",
        entityId: tl.id,
        label: "Fecha de arranque",
        action: "ANCHOR_CHANGED",
        before: { anchorStartDate: antesISO },
        after: { anchorStartDate: despuesISO },
      },
    ],
  );
  try {
    await prisma.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason:
          `Fecha de arranque cambiada en el kickoff: ${antesISO ? fmtFull(antesISO) : "sin fecha"} → ` +
          `${despuesISO ? fmtFull(despuesISO) : "sin fecha"}.` +
          (corrimiento ? ` ${corrimiento}` : ""),
        kind: "MANUAL",
        instruction: null,
        changedByEmail: actor,
        snapshot: { anchorStartDate: despuesISO } as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[timeline/arranque] el registro del cambio falló:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ anchorStartDate: despuesISO, cambio: true, corrimiento });
}
