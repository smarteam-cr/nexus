/**
 * GET /api/projects/[projectId]/hubspot-timeline
 *
 * Ítems del timeline de HubSpot de la empresa del cliente (notas + llamadas con su
 * resumen IA + reuniones, incluidos transcripts de Zoom) para MOSTRARLOS en el panel de
 * contexto del handoff/canvases. Estas fuentes se usan automáticamente al generar (ver
 * clients/[id]/analyze/route.ts). Solo lectura, vía la API v1 de engagements (funciona con
 * los scopes actuales). Espejo de business-cases/[id]/hubspot-timeline, a nivel proyecto.
 * Gateado con guardProjectHandoffAccess (mismo gate que el resto del handoff).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fetchCompanyTimelineSplit, projectEraSince, type TimelineItem } from "@/lib/hubspot/company-timeline";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true, hubspotCreatedAt: true, client: { select: { hubspotCompanyId: true } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  const companyId = project.client.hubspotCompanyId;
  if (!companyId) {
    return NextResponse.json({ items: [] });
  }

  try {
    const hs = await getSystemHubspotClient();
    // Partido por la ERA del proyecto — la columna muestra lo mismo que entra al prompt
    // del handoff: los de la era como material, y los ANTERIORES (cap 10) marcados como
    // historial/trasfondo (atenuados en la UI).
    const { current, previous } = await fetchCompanyTimelineSplit(hs, companyId, projectEraSince(project));
    const toDto = (i: TimelineItem, prev: boolean) => ({
      type: i.type,
      title: i.title,
      date: i.date,
      snippet: i.body.length > 200 ? i.body.slice(0, 200).trimEnd() + "…" : i.body,
      previous: prev,
    });
    return NextResponse.json({
      items: [...current.map((i) => toDto(i, false)), ...previous.map((i) => toDto(i, true))],
    });
  } catch {
    // Sin cuenta HubSpot del sistema / API caída → panel sin la sección (no rompe).
    return NextResponse.json({ items: [] });
  }
}
