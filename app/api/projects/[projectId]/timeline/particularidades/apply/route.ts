/**
 * POST /api/projects/[projectId]/timeline/particularidades/apply
 *
 * Aplica las PARTICULARIDADES que el CSE aceptó del borrador (pendingParticularidades). Es el
 * ÚNICO lugar donde una particularidad propuesta por el agente se vuelve un registro real
 * (invariante: nada se crea sin que el CSE apruebe). Espejo del patrón progress/apply, pero
 * para un modelo aparte (Particularidad), con apply SEPARADO: aceptar avance ≠ aceptar desviaciones.
 *
 * Body = subconjunto ACEPTADO por el CSE, por ÍNDICE del borrador (el CONTENIDO viene del
 * borrador en DB, no del cliente — el cliente solo elige cuáles crear y su visibilidad):
 *   { accepted: Array<{ index: number, visibleExternal?: boolean }> }
 *
 * En una transacción: crea una Particularidad por índice aceptado (source=AGENT,
 * needsValidation=false al confirmar, createdByEmail = quien aplica) y LIMPIA el borrador
 * entero (aceptar es "resolví esta tanda"; lo no aceptado se descarta con el borrador).
 *
 * Guarded con guardTimelineEdit (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma, type ParticularidadKind, type TaskParty } from "@prisma/client";
import type { PendingParticularidad } from "../../route";

const VALID_KINDS = new Set(["ATRASO", "SOLICITUD", "COMPROMISO"]);
const VALID_PARTIES = new Set(["CLIENTE", "SMARTEAM", "AMBOS", "DEV"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as { accepted?: unknown };
  const acceptedRaw = Array.isArray(body.accepted) ? body.accepted : [];
  // Mapa índice → visibleExternal (último gana si se repite). Solo índices enteros ≥0.
  const visByIndex = new Map<number, boolean>();
  for (const a of acceptedRaw) {
    const o = (a ?? {}) as { index?: unknown; visibleExternal?: unknown };
    if (typeof o.index === "number" && Number.isInteger(o.index) && o.index >= 0) {
      visByIndex.set(o.index, o.visibleExternal === true);
    }
  }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, pendingParticularidades: true },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });

  const draft = (tl.pendingParticularidades as PendingParticularidad[] | null) ?? [];
  if (draft.length === 0) {
    return NextResponse.json({ error: "No hay particularidades propuestas por aplicar." }, { status: 400 });
  }

  // Construir las filas a crear desde el BORRADOR (source de verdad del contenido), solo para
  // los índices aceptados que resuelven a una particularidad válida. Re-validamos kind/party por
  // si el borrador quedó de una versión vieja o corrupto (defensa en profundidad).
  const toCreate: Prisma.ParticularidadCreateManyInput[] = [];
  for (const [index, visibleExternal] of visByIndex) {
    const d = draft[index];
    if (!d) continue;
    if (!VALID_KINDS.has(d.kind) || !VALID_PARTIES.has(d.party) || !d.title) continue;
    toCreate.push({
      timelineId: tl.id,
      phaseId: d.phaseId ?? null,
      kind: d.kind as ParticularidadKind,
      party: d.party as TaskParty,
      title: d.title,
      detail: d.detail ?? null,
      weeksImpact: d.weeksImpact ?? null,
      visibleExternal,
      source: "AGENT",
      needsValidation: false, // el CSE lo confirmó en el banner
      createdByEmail: guard.user.email ?? null,
    });
  }

  let created = 0;
  await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      const r = await tx.particularidad.createMany({ data: toCreate });
      created = r.count;
    }
    // Aceptar esta tanda LIMPIA el borrador entero: lo no aceptado se descarta junto con él.
    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: { pendingParticularidades: Prisma.DbNull, pendingParticularidadesRunId: null },
    });
  });

  return NextResponse.json({ applied: true, created });
}

// DELETE → descartar el borrador de particularidades sin crear nada (botón "Descartar").
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });

  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingParticularidades: Prisma.DbNull, pendingParticularidadesRunId: null },
  });
  return NextResponse.json({ discarded: true });
}
