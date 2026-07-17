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
import { Prisma, type ParticularidadKind, type TaskParty } from "@prisma/client";

const VALID_KINDS = new Set(["ATRASO", "SOLICITUD", "COMPROMISO"]);
const VALID_PARTIES = new Set(["CLIENTE", "SMARTEAM", "AMBOS", "DEV"]);

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
  };

  // Construir el patch validando SOLO los campos que vengan (undefined = sin cambio).
  const data: Prisma.ParticularidadUpdateInput = {};

  if (body.visibleExternal !== undefined) {
    if (typeof body.visibleExternal !== "boolean") {
      return NextResponse.json({ error: "visibleExternal debe ser boolean" }, { status: 400 });
    }
    data.visibleExternal = body.visibleExternal;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "El título no puede quedar vacío" }, { status: 400 });
    data.title = title;
  }
  if (body.detail !== undefined) {
    data.detail = typeof body.detail === "string" && body.detail.trim() ? body.detail.trim() : null;
  }
  if (body.party !== undefined) {
    const party = typeof body.party === "string" ? body.party.toUpperCase() : "";
    if (!VALID_PARTIES.has(party)) {
      return NextResponse.json({ error: `party debe ser uno de ${[...VALID_PARTIES].join("|")}` }, { status: 400 });
    }
    data.party = party as TaskParty;
  }
  if (body.kind !== undefined) {
    const kind = typeof body.kind === "string" ? body.kind.toUpperCase() : "";
    if (!VALID_KINDS.has(kind)) {
      return NextResponse.json({ error: `kind debe ser uno de ${[...VALID_KINDS].join("|")}` }, { status: 400 });
    }
    data.kind = kind as ParticularidadKind;
  }
  if (body.weeksImpact !== undefined) {
    const w = body.weeksImpact;
    if (w === null) {
      data.weeksImpact = null;
    } else if (typeof w === "number" && Number.isFinite(w) && w >= 0) {
      data.weeksImpact = Math.round(w);
    } else {
      return NextResponse.json({ error: "weeksImpact debe ser un entero ≥0 o null" }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  // Ownership por traversal: la particularidad debe colgar del timeline de ESTE proyecto.
  const existing = await prisma.particularidad.findFirst({
    where: { id: particularidadId, timeline: { projectId } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Particularidad no encontrada" }, { status: 404 });
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
