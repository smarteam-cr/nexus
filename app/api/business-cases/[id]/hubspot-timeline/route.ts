/**
 * GET /api/business-cases/[id]/hubspot-timeline
 *
 * Ítems del timeline de HubSpot de la empresa del prospecto (notas + llamadas con su
 * resumen IA + reuniones) para MOSTRARLOS en el panel de Contexto del BC. Estas fuentes
 * se usan automáticamente al generar (ver generate/route.ts). Solo lectura, vía la API v1
 * de engagements (funciona con los scopes actuales). Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fetchCompanyTimelineItems } from "@/lib/hubspot/company-timeline";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { hubspotCompanyId: true },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }
  if (!bc.hubspotCompanyId) {
    return NextResponse.json({ items: [] });
  }

  try {
    const hs = await getSystemHubspotClient();
    const items = await fetchCompanyTimelineItems(hs, bc.hubspotCompanyId);
    return NextResponse.json({
      items: items.map((i) => ({
        type: i.type,
        title: i.title,
        date: i.date,
        snippet: i.body.length > 200 ? i.body.slice(0, 200).trimEnd() + "…" : i.body,
      })),
    });
  } catch {
    // Sin cuenta HubSpot del sistema / API caída → panel sin la sección (no rompe).
    return NextResponse.json({ items: [] });
  }
}
