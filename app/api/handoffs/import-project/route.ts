import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";

/**
 * POST /api/handoffs/import-project
 *
 * Stepper, decisión "importar y adjuntar": cuando el vendedor elige un proyecto que
 * existe en HubSpot pero NO en Nexus, lo importamos antes de adjuntar el handoff.
 *   1. Asegura el Client de Nexus (por hubspotCompanyId, o lo crea).
 *   2. syncProjectsForClient → trae los proyectos de la company a Nexus.
 *   3. Resuelve el Project de Nexus por hubspotServiceId === el record elegido.
 * Devuelve { clientId, nexusProjectId } para que el front llame a POST /api/handoffs
 * con targetProjectId. (El gate sube a createHandoff en la pieza de gating.)
 */
interface Body {
  companyId?: string;
  companyName?: string;
  domain?: string;
  hubspotProjectId?: string;
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const companyId = body.companyId?.trim();
  const hubspotProjectId = body.hubspotProjectId?.trim();
  if (!companyId || !hubspotProjectId) {
    return NextResponse.json({ error: "companyId y hubspotProjectId requeridos" }, { status: 400 });
  }

  // 1. Asegurar el Client de Nexus (mismo find-or-create que POST /api/handoffs).
  let clientId: string;
  const existing = await prisma.client.findFirst({
    where: { hubspotCompanyId: companyId },
    select: { id: true },
  });
  if (existing) {
    clientId = existing.id;
  } else {
    if (!body.companyName?.trim()) {
      return NextResponse.json({ error: "companyName requerido para crear el cliente" }, { status: 400 });
    }
    const created = await prisma.client.create({
      data: {
        name: body.companyName.trim(),
        company: body.companyName.trim(),
        hubspotCompanyId: companyId,
        emailDomains: body.domain ? [body.domain.trim().toLowerCase()] : [],
      },
      select: { id: true },
    });
    clientId = created.id;
  }

  // 2. Importar los proyectos de la company a Nexus.
  try {
    await syncProjectsForClient(clientId);
  } catch (e) {
    console.error("[handoffs/import-project] sync error:", e);
    return NextResponse.json({ error: "No se pudo importar el proyecto desde HubSpot." }, { status: 502 });
  }

  // 3. Resolver el Project de Nexus por el record elegido.
  const project = await prisma.project.findFirst({
    where: { clientId, hubspotServiceId: hubspotProjectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: "El proyecto se sincronizó pero no se encontró en Nexus. Probá de nuevo." },
      { status: 404 },
    );
  }

  return NextResponse.json({ clientId, nexusProjectId: project.id });
}
