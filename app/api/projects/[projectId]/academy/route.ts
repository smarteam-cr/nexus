/**
 * /api/projects/[projectId]/academy — lo que el editor del kickoff necesita para «Tu ruta en HubSpot Academy» (Q1,
 * 2026-10-27): el catálogo activo, los hubs vendidos del proyecto y la ruta que sugiere Nexus. Solo lectura; la sección
 * guarda su copia en el kickoff como cualquier edición.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { academyDelProyecto } from "@/lib/kickoff/academy-server";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!z.string().cuid().safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await academyDelProyecto(projectId));
}
