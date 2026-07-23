/**
 * PATCH / DELETE /api/projects/[projectId]/timeline/particularidades/[particularidadId]
 *
 * Edición de UNA particularidad ya creada — visibilidad al cliente (`visibleExternal`) Y contenido
 * (kind/party/title/detail/weeksImpact). El CSE la ajusta dentro de Nexus; el cliente ve los cambios
 * recién al «Subir al cliente» (el snapshot se re-congela con las visibles). Endpoint dedicado
 * (espejo de timeline/tasks/[taskId]): editar una particularidad no reescribe el borrador ni el árbol.
 *
 *   PATCH  → actualiza los campos que vengan (undefined = sin cambio)
 *   DELETE → borra la particularidad (mal propuesta por el agente, o ya no aplica)
 *
 * Ownership por traversal: la particularidad debe pertenecer al timeline de ESTE proyecto (no
 * alcanza con que el id exista). Guarded con guardTimelineEdit (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma, type ParticularidadKind } from "@prisma/client";
import {
  parseTitle,
  parseOptionalText,
  parseParty,
  parseKind,
  parseWeeksImpact,
  parseOccurredAt,
  normalizeWeeksForKind,
  checkKindWeeksInvariant,
} from "@/lib/timeline/particularidad-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; particularidadId: string }> },
) {
  const { projectId, particularidadId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as {
    visibleExternal?: unknown;
    title?: unknown;
    detail?: unknown;
    party?: unknown;
    weeksImpact?: unknown;
    kind?: unknown;
    sourceQuote?: unknown;
    occurredAt?: unknown;
    phaseId?: unknown;
  };

  // Ownership por traversal + estado actual (kind/weeksImpact) para las validaciones cross-field
  // (passthrough de kind legacy + invariante ATRASO). La particularidad debe colgar de ESTE proyecto.
  const existing = await prisma.particularidad.findFirst({
    where: { id: particularidadId, timeline: { projectId } },
    select: { id: true, kind: true, weeksImpact: true, timelineId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Particularidad no encontrada" }, { status: 404 });
  }

  // Construir el patch validando SOLO los campos que vengan (undefined = sin cambio).
  const data: Prisma.ParticularidadUpdateInput = {};

  if (body.visibleExternal !== undefined) {
    if (typeof body.visibleExternal !== "boolean") {
      return NextResponse.json({ error: "visibleExternal debe ser boolean" }, { status: 400 });
    }
    data.visibleExternal = body.visibleExternal;
  }
  if (body.title !== undefined) {
    const r = parseTitle(body.title);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    data.title = r.value;
  }
  if (body.detail !== undefined) {
    data.detail = parseOptionalText(body.detail);
  }
  if (body.party !== undefined) {
    const r = parseParty(body.party);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    data.party = r.value;
  }
  if (body.kind !== undefined) {
    // Passthrough del kind que ya tiene la fila: deja editar una legacy SOLICITUD sin poder
    // volver a fijar SOLICITUD en otras.
    const r = parseKind(body.kind, existing.kind);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    data.kind = r.value;
  }
  if (body.weeksImpact !== undefined) {
    const r = parseWeeksImpact(body.weeksImpact);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    data.weeksImpact = r.value;
  }
  if (body.sourceQuote !== undefined) {
    // Cita interna para el CSE (nunca cruza al cliente). null/"" la limpia.
    data.sourceQuote = parseOptionalText(body.sourceQuote);
  }
  if (body.occurredAt !== undefined) {
    const r = parseOccurredAt(body.occurredAt);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    data.occurredAt = r.value;
  }
  // Re-anclar la fase (o desanclar con null). La fase debe ser de ESTE timeline — si no, se podría
  // colgar la particularidad de otro proyecto.
  if (body.phaseId !== undefined) {
    if (body.phaseId === null) {
      data.phase = { disconnect: true };
    } else if (typeof body.phaseId === "string" && body.phaseId) {
      const phase = await prisma.timelinePhase.findFirst({
        where: { id: body.phaseId, timelineId: existing.timelineId },
        select: { id: true },
      });
      if (!phase) return NextResponse.json({ error: "La fase no pertenece a este cronograma" }, { status: 400 });
      data.phase = { connect: { id: phase.id } };
    } else {
      return NextResponse.json({ error: "phaseId debe ser un id o null" }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  // Invariante del eje DESTINO: un ATRASO debe quedar con weeksImpact ≥1. Se aplica SOLO si el patch
  // TOCA kind o weeksImpact (o sea, contenido nuevo/editado). Un patch que NO los toca —el toggle de
  // visibilidad, editar el título/detalle— pasa aunque la fila sea un ATRASO legacy sin semanas.
  // Por qué: esas filas existen (son pre-reconcepción, la migración las exporta sin borrar) y
  // bloquearlas trababa justo el triage que hay que hacer a mano — ocultarlas del cliente.
  if (body.kind !== undefined || body.weeksImpact !== undefined) {
    const effectiveKind = (data.kind as ParticularidadKind | undefined) ?? existing.kind;
    const rawWeeks =
      data.weeksImpact !== undefined ? (data.weeksImpact as number | null) : existing.weeksImpact;
    // Un AVISO no mueve el plan → se le limpian las semanas (incluso si venía de otro kind).
    const effectiveWeeks = normalizeWeeksForKind(effectiveKind, rawWeeks);
    const err = checkKindWeeksInvariant(effectiveKind, effectiveWeeks);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (effectiveWeeks !== rawWeeks) data.weeksImpact = effectiveWeeks;
  }

  const updated = await prisma.particularidad.update({
    where: { id: particularidadId },
    data,
    select: {
      id: true,
      kind: true,
      party: true,
      title: true,
      detail: true,
      sourceQuote: true,
      weeksImpact: true,
      visibleExternal: true,
      phaseId: true,
      occurredAt: true,
    },
  });

  return NextResponse.json({ ...updated, occurredAt: updated.occurredAt.toISOString() });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; particularidadId: string }> },
) {
  const { projectId, particularidadId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.particularidad.findFirst({
    where: { id: particularidadId, timeline: { projectId } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Particularidad no encontrada" }, { status: 404 });
  }

  await prisma.particularidad.delete({ where: { id: particularidadId } });
  return NextResponse.json({ deleted: true });
}
