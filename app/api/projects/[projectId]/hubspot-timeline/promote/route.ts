/**
 * POST /api/projects/[projectId]/hubspot-timeline/promote   { engagementId }
 *
 * "Usar en el handoff": copia un engagement de HubSpot a una FUENTE MANUAL persistida
 * (HandoffSource) para que cuente como MATERIAL COMPLETO del handoff y sobreviva la
 * regeneración. Pensado sobre todo para el HISTORIAL PREVIO a la era del proyecto (que si
 * no entra solo como trasfondo comprimido): el material de venta real de muchos clientes
 * vive ahí (reuniones de Zoom registradas en HubSpot, no en el sync de Meet).
 *
 * Owner del cliente o handoffAnywhere (mismo scope que gestionar el contexto). Idempotente:
 * si ese engagement ya se promovió (misma fuente vigente), no duplica.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fetchCompanyTimelineSplit, projectEraSince, type TimelineItem } from "@/lib/hubspot/company-timeline";

const TYPE_LABEL: Record<TimelineItem["type"], string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { engagementId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* body vacío → 400 abajo */
  }
  const engagementId = typeof body.engagementId === "string" ? body.engagementId.trim() : "";
  if (!engagementId) {
    return NextResponse.json({ error: "engagementId requerido" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true, hubspotCreatedAt: true, client: { select: { hubspotCompanyId: true } } },
  });
  const companyId = project?.client?.hubspotCompanyId;
  if (!project || !companyId) {
    return NextResponse.json({ error: "El cliente no tiene empresa de HubSpot vinculada." }, { status: 400 });
  }

  // Buscar el engagement por id (era + previo) — trae el body COMPLETO (no el snippet).
  let item: TimelineItem | undefined;
  try {
    const hs = await getSystemHubspotClient();
    const { current, previous } = await fetchCompanyTimelineSplit(hs, companyId, projectEraSince(project));
    item = [...current, ...previous].find((i) => i.id === engagementId);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el timeline de HubSpot." }, { status: 502 });
  }
  if (!item) {
    return NextResponse.json({ error: "No se encontró ese engagement en HubSpot." }, { status: 404 });
  }

  const title = `HubSpot · ${TYPE_LABEL[item.type] ?? item.type}${item.date ? ` · ${item.date}` : ""}${
    item.title ? ` · ${item.title}` : ""
  }`.slice(0, 300);

  // Idempotente: mismo engagement (título derivado idéntico) ya vigente → devolverlo.
  const existing = await prisma.handoffSource.findFirst({
    where: { projectId, deletedAt: null, title },
    select: { id: true, title: true, content: true, createdByEmail: true, createdAt: true },
  });
  if (existing) {
    return NextResponse.json({ source: existing, alreadyPromoted: true });
  }

  const source = await prisma.handoffSource.create({
    data: { projectId, title, content: item.body, createdByEmail: guard.user.email ?? null },
    select: { id: true, title: true, content: true, createdByEmail: true, createdAt: true },
  });
  return NextResponse.json({ source });
}
