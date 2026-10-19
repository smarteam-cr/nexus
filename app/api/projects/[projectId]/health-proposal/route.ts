/**
 * PATCH /api/projects/[projectId]/health-proposal
 *
 * Ciclo de vida — resolución de la propuesta "EN RIESGO" del watchdog (el agente
 * PROPONE por señales duras, el CSE decide acá). EXCLUSIVO de `seeAllClients`.
 *
 *   PATCH { action: "confirm", reason? } → escribe healthStatusOverride=EN_RIESGO
 *                                          (curado) y limpia la propuesta
 *   PATCH { action: "dismiss" }          → solo limpia la propuesta
 *
 * Se decide en Éxito del cliente › «Propuestas del vigía» (lib/cs/propuestas-del-vigia.ts). Al decidir se olvida la
 * medición de «Para ti» de quien decidió: al volver, la propuesta ya no está en el número (2026-10-19).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const body = (raw ?? {}) as { action?: unknown; reason?: unknown };
  if (body.action !== "confirm" && body.action !== "dismiss") {
    return NextResponse.json({ error: 'action debe ser "confirm" o "dismiss"' }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, healthProposed: true, healthProposedReason: true },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  if (!project.healthProposed) {
    return NextResponse.json({ error: "No hay ninguna propuesta pendiente para este proyecto." }, { status: 409 });
  }

  const clearProposal = {
    healthProposed: null,
    healthProposedReason: null,
    healthProposedAt: null,
    healthProposedByRunId: null,
  };

  if (body.action === "dismiss") {
    await prisma.project.update({ where: { id: projectId }, data: clearProposal });
    if (guard.user.email) olvidarMedicion(guard.user.email);
    return NextResponse.json({ ok: true, dismissed: true });
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : project.healthProposedReason
        ? `Propuesta del agente confirmada: ${project.healthProposedReason}`
        : "Propuesta del agente confirmada";
  await prisma.project.update({
    where: { id: projectId },
    data: {
      healthStatusOverride: project.healthProposed,
      healthStatusOverrideReason: reason,
      healthStatusOverrideAt: new Date(),
      healthStatusOverrideBy: guard.user.email ?? null,
      ...clearProposal,
    },
  });
  if (guard.user.email) olvidarMedicion(guard.user.email);
  return NextResponse.json({ ok: true, confirmed: true });
}
