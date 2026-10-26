/**
 * /api/projects/[projectId]/planificacion/asientos — los asientos de HubSpot que la empresa tiene comprados, para la
 * cuenta de licencias de «Usuarios y permisos» (L4, 2026-10-27, `licenciasContraLoComprado` en lib/planificacion/brief.ts).
 *
 *   GET → { asientos: { core, sales, service } | null, al: fecha de la copia }: de la copia de HubSpot Partner. Interno:
 *         solo lo lee el editor, nunca va al documento del cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!z.string().min(1).max(64).safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const snap = await prisma.clientPartnerSnapshot.findFirst({
    where: { clientId: guard.clientId },
    orderBy: { fetchedAt: "desc" },
    select: { seats: true, fetchedAt: true },
  });
  return NextResponse.json({ asientos: snap?.seats ?? null, al: snap?.fetchedAt?.toISOString() ?? null });
}
