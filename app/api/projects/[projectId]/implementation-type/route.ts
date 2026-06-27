import { NextRequest, NextResponse } from "next/server";
import { guardProjectEditHandoff } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ projectId: string }> };

/**
 * PATCH /api/projects/[projectId]/implementation-type
 *
 * Override del CSE sobre el tipo de implementación que infirió el agente de handoff
 * (IMPLEMENTATION = nueva; REIMPLEMENTATION = el cliente ya usa HubSpot / viene de otro CRM).
 * Interno — NO cruza al cliente. Body: { implementationType: "IMPLEMENTATION" | "REIMPLEMENTATION" | null }.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectEditHandoff(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const value = (raw as { implementationType?: unknown } | null)?.implementationType ?? null;
  if (value !== "IMPLEMENTATION" && value !== "REIMPLEMENTATION" && value !== null) {
    return NextResponse.json({ error: "implementationType inválido" }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { implementationType: value },
    select: { implementationType: true },
  });

  return NextResponse.json({ implementationType: updated.implementationType });
}
