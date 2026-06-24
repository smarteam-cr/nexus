import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { resolveCompanyProjectIds } from "@/lib/hubspot/sync-projects";

/**
 * GET /api/handoffs/projects-of-company?companyId=<id>
 *
 * Paso 4 del stepper: lista los proyectos (record 0-970) que la company ya tiene en el
 * HubSpot SISTEMA, con nombre + etapa, cruzados con Nexus:
 *   - nexusProjectId: el Project de Nexus mapeado (si ya se importó) — adjuntable directo.
 *   - hasHandoff: si ese proyecto ya tiene handoff (para filtrarlo y evitar el 409).
 * Los que NO tienen nexusProjectId se importan al adjuntar (decisión: importar y adjuntar).
 * Solo lectura. (El gate sube a createHandoff junto con /lookup en la pieza de gating.)
 */
const PROJECTS_OBJECT_TYPE = "0-970";

export async function GET(req: NextRequest) {
  const guard = await guardCapability("createHandoff");
  if (guard instanceof NextResponse) return guard;

  const companyId = req.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  if (!companyId) {
    return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
  }

  try {
    const hs = await getSystemHubspotClient();
    const ids = await resolveCompanyProjectIds(hs, companyId);
    if (ids.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    // Nombre + etapa + fecha de creación de cada record.
    const readRes = await hs.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${PROJECTS_OBJECT_TYPE}/batch/read`,
      body: {
        properties: ["hs_name", "hs_pipeline_stage", "hs_createdate"],
        inputs: ids.map((id) => ({ id })),
      },
    });
    const readData = (await readRes.json()) as {
      results?: { id: string; properties: Record<string, string | null> }[];
    };
    const records = readData.results ?? [];

    // Cruce con Nexus: hubspotServiceId → { nexusProjectId, hasHandoff }.
    const nexusProjects = await prisma.project.findMany({
      where: { hubspotServiceId: { in: ids } },
      select: { id: true, hubspotServiceId: true, handoff: { select: { id: true } } },
    });
    const byServiceId = new Map(
      nexusProjects.map((p) => [p.hubspotServiceId!, { nexusProjectId: p.id, hasHandoff: !!p.handoff }]),
    );

    const projects = records.map((r) => {
      const nexus = byServiceId.get(r.id);
      return {
        hubspotProjectId: r.id,
        name: r.properties.hs_name ?? "(sin nombre)",
        stage: r.properties.hs_pipeline_stage ?? null,
        createdAt: r.properties.hs_createdate ?? null,
        nexusProjectId: nexus?.nexusProjectId ?? null,
        hasHandoff: nexus?.hasHandoff ?? false,
      };
    });

    return NextResponse.json({ projects });
  } catch (e) {
    console.error("[handoffs/projects-of-company] error:", e);
    return NextResponse.json({ error: "No se pudieron traer los proyectos." }, { status: 500 });
  }
}
