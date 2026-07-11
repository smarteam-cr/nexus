/**
 * PATCH /api/projects/[projectId]/health
 *
 * D.3 panel de cartera — override CURADO de la salud del proyecto (parte humana del
 * híbrido). EXCLUSIVO de `seeAllClients` (CSL / Ventas / Super Admin).
 *
 *   PATCH { status: "SALUDABLE"|"EN_FRICCION"|"EN_RIESGO"|"PAUSADO", reason? } → fija el override
 *   PATCH { status: null }                                                     → limpia (vuelve a la derivada)
 *
 * El override prevalece sobre la salud derivada al vuelo; limpiarlo restablece la automática.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { ProjectHealth } from "@prisma/client";

const HEALTHS = ["SALUDABLE", "EN_FRICCION", "EN_RIESGO", "PAUSADO"] as const;

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
  const body = (raw ?? {}) as { status?: unknown; reason?: unknown };

  const exists = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  // Limpiar el override → volver a la salud derivada automática.
  if (body.status === null || body.status === undefined || body.status === "") {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        healthStatusOverride: null,
        healthStatusOverrideReason: null,
        healthStatusOverrideAt: null,
        healthStatusOverrideBy: null,
      },
    });
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (typeof body.status !== "string" || !(HEALTHS as readonly string[]).includes(body.status)) {
    return NextResponse.json(
      { error: `status debe ser uno de ${HEALTHS.join("|")} o null para limpiar` },
      { status: 400 },
    );
  }
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      healthStatusOverride: body.status as ProjectHealth,
      healthStatusOverrideReason: reason,
      healthStatusOverrideAt: new Date(),
      healthStatusOverrideBy: guard.user.email ?? null,
      // Cualquier override zanja la propuesta pendiente del watchdog (coherencia:
      // el humano ya decidió — confirmar EN_RIESGO también pasa por acá).
      healthProposed: null,
      healthProposedReason: null,
      healthProposedAt: null,
      healthProposedByRunId: null,
    },
  });
  return NextResponse.json({ ok: true });
}
