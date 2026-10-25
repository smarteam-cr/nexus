import { NextRequest, NextResponse } from "next/server";
import { guardLecturaParaArrancar } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { crearOReusarFicha, fichaConLaEmpresa } from "@/lib/clients/empresa-de-hubspot";
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
 * con targetProjectId. Gate: `guardLecturaParaArrancar` — no crea nada en HubSpot, solo trae
 * a Nexus un proyecto que allá ya existe.
 */
interface Body {
  companyId?: string;
  companyName?: string;
  domain?: string;
  hubspotProjectId?: string;
}

export async function POST(req: NextRequest) {
  const guard = await guardLecturaParaArrancar();
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
  let creado = false;
  const existing = await fichaConLaEmpresa(companyId);
  if (existing) {
    clientId = existing.id;
  } else {
    const companyName = body.companyName?.trim();
    if (!companyName) {
      return NextResponse.json({ error: "companyName requerido para crear el cliente" }, { status: 400 });
    }
    // R7b: si otra alta la creó entre la lectura y el create, el índice frena esta y se usa la que ganó.
    const r = await crearOReusarFicha(companyId, () =>
      prisma.client.create({
        data: {
          name: companyName,
          company: companyName,
          hubspotCompanyId: companyId,
          emailDomains: body.domain ? [body.domain.trim().toLowerCase()] : [],
        },
        select: { id: true },
      }),
    );
    clientId = r.clientId;
    creado = r.creado;
  }
  if (creado) {
    /* ⚠ Un cliente NUEVO puede matchear reuniones que ya están, y hay que atribuírselas ANTES
       de que se reclasifiquen a sus proyectos — si no, el proyecto nace sin ninguna. Es el
       defecto de «Discover Puerto Rico» (2026-08-18); el censo vive en
       lib/sessions/puertas-que-crean-cliente.test.ts y el estado lo caza INV21. */
    await (await import("@/lib/sessions/resolve-client"))
      .resolveAllSessions({ reclassify: false })
      .catch((e) => console.error("[handoff] la atribución del cliente nuevo falló", e));
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
