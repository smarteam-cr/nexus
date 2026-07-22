/**
 * POST /api/projects/[projectId]/hubspot-timeline/exclude   { engagementId, excluded }
 *
 * La "X" de la columna HubSpot del Contexto (espeja la de Google Meet): excluye — o
 * re-incluye — una reunión/nota/llamada de HubSpot de ESTE handoff. Por defecto TODAS
 * alimentan (las de la era completas, las previas resumidas como trasfondo); acá se sacan
 * las que son de otro proyecto. Persistido en Handoff.excludedEngagementIds (por-proyecto,
 * así excluir en un proyecto no afecta a los otros del cliente). Owner||handoffAnywhere.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { engagementId?: unknown; excluded?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* body vacío → 400 abajo */
  }
  const engagementId = typeof body.engagementId === "string" ? body.engagementId.trim() : "";
  const excluded = body.excluded === true;
  if (!engagementId) {
    return NextResponse.json({ error: "engagementId requerido" }, { status: 400 });
  }

  const existing = await prisma.handoff.findUnique({
    where: { projectId },
    select: { excludedEngagementIds: true },
  });
  const set = new Set(existing?.excludedEngagementIds ?? []);
  if (excluded) set.add(engagementId);
  else set.delete(engagementId);
  const next = [...set];

  // Re-incluir sin Handoff previo → nada que persistir (no crear un Handoff vacío).
  if (!existing && next.length === 0) {
    return NextResponse.json({ excludedEngagementIds: [] });
  }

  // Upsert: el Handoff 1:1 puede no existir todavía (lo crea el ensure al generar) — mismo
  // patrón que el PATCH de contextExclusions.
  await prisma.handoff.upsert({
    where: { projectId },
    create: { clientId: guard.clientId, projectId, excludedEngagementIds: next },
    update: { excludedEngagementIds: next },
  });
  return NextResponse.json({ excludedEngagementIds: next });
}
