/**
 * PATCH /api/projects/[projectId]/adoption-mode
 *
 * Ciclo de vida — modalidad de ADOPCIÓN del proyecto: el sistema la SUGIERE por
 * el tamaño de la cuenta (snapshot Partner), el CSE la confirma acá.
 *
 *   PATCH { mode: "directa" | "por_pilotos" } → confirma
 *   PATCH { mode: null }                      → limpia (vuelve a "sugerida, sin confirmar")
 *
 * La modalidad de adopción es del ciclo de Customer Success: no aplica a un proyecto cuya
 * etapa manda su pipeline de HubSpot (ver lib/lifecycle/gate.ts). Limpiar sí se permite.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { vetoSiNoCorreCicloDeCs } from "@/lib/lifecycle";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const mode = (raw as { mode?: unknown })?.mode;

  if (mode === null || mode === undefined || mode === "") {
    await prisma.project.update({
      where: { id: projectId },
      data: { adoptionMode: null, adoptionModeConfirmedAt: null, adoptionModeConfirmedBy: null },
    });
    return NextResponse.json({ ok: true, cleared: true });
  }
  if (mode !== "directa" && mode !== "por_pilotos") {
    return NextResponse.json({ error: 'mode debe ser "directa", "por_pilotos" o null' }, { status: 400 });
  }
  // Después de la rama de limpiar, que se permite siempre.
  const veto = await vetoSiNoCorreCicloDeCs(projectId);
  if (veto) return veto;
  await prisma.project.update({
    where: { id: projectId },
    data: {
      adoptionMode: mode,
      adoptionModeConfirmedAt: new Date(),
      adoptionModeConfirmedBy: guard.user.email ?? null,
    },
  });
  return NextResponse.json({ ok: true, mode });
}
