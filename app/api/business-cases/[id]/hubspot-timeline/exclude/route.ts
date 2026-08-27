/**
 * POST /api/business-cases/[id]/hubspot-timeline/exclude   { engagementId, excluded }
 *
 * La "X" de la columna HubSpot del Contexto de una PROPUESTA: saca —o vuelve a meter— una
 * nota / llamada / reunión de HubSpot del contexto con el que se genera. Espejo del mismo
 * endpoint del lado de proyectos (`/api/projects/[projectId]/hubspot-timeline/exclude`), que
 * es donde esto ya existía; la propuesta se había quedado sin él.
 *
 * Por defecto TODO el timeline de la company alimenta. Acá se poda lo que no es de esta venta
 * — la nota de otro proyecto, la llamada de soporte, el diagnóstico viejo.
 *
 * Persistido en `BusinessCase.excludedEngagementIds`: por PROPUESTA, no por cliente. Un
 * `update` y no un upsert, porque a diferencia del Handoff la fila siempre existe.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
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

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { excludedEngagementIds: true },
  });
  if (!bc) {
    return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });
  }

  // Set y no push/filter: excluir dos veces el mismo ítem (doble clic, dos pestañas) tiene
  // que dar lo mismo que excluirlo una.
  const set = new Set(bc.excludedEngagementIds);
  if (excluded) set.add(engagementId);
  else set.delete(engagementId);
  const next = [...set];

  await prisma.businessCase.update({
    where: { id },
    data: { excludedEngagementIds: next },
  });
  return NextResponse.json({ excludedEngagementIds: next });
}
