/**
 * lib/hubspot/stage.ts
 *
 * Lee la ETAPA actual del pipeline de Customer Success de un proyecto desde
 * HubSpot (objeto Projects 0-970) y resuelve el label legible. Es la fuente
 * "ancla #1" de D.2 (cronograma vivo): se materializa en Project vía
 * sync-projects y se revalida en vivo al disparar la regeneración del avance.
 *
 * Extraído de app/api/projects/[projectId]/gps/route.ts (donde vivía privado)
 * para compartirlo entre el GPS, el sync de proyectos y el disparo del avance.
 * Best-effort: cualquier fallo de la API devuelve null (el llamador degrada).
 */
import { getSystemHubspotClient } from "@/lib/hubspot/client";

// Slugs del objeto Proyectos en HubSpot (mismos que usa sync-projects).
const PROJECT_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];

export interface ProjectStage {
  stageId: string;
  label: string;
}

/**
 * Resuelve la etapa actual del pipeline de CS de un proyecto a { stageId, label }.
 * Devuelve null si el proyecto no existe en HubSpot, no tiene etapa, o la API falla.
 */
export async function getProjectStage(serviceId: string): Promise<ProjectStage | null> {
  try {
    const hs = await getSystemHubspotClient();

    let pipelineId: string | null = null;
    let stageId: string | null = null;
    let workingSlug: string | null = null;

    for (const slug of PROJECT_SLUGS) {
      try {
        const res = await hs.apiRequest({
          method: "GET",
          path: `/crm/v3/objects/${slug}/${serviceId}?properties=hs_pipeline,hs_pipeline_stage`,
        });
        const data = (await res.json()) as {
          id?: string;
          properties?: { hs_pipeline?: string; hs_pipeline_stage?: string };
          status?: string;
        };
        if (data.status === "error" || !data.id) continue;
        pipelineId = data.properties?.hs_pipeline ?? null;
        stageId = data.properties?.hs_pipeline_stage ?? null;
        workingSlug = slug;
        break;
      } catch {
        continue;
      }
    }

    if (!pipelineId || !stageId || !workingSlug) return null;

    const pipelineRes = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/pipelines/${workingSlug}/${pipelineId}/stages`,
    });
    const pipelineData = (await pipelineRes.json()) as {
      results?: Array<{ id: string; label: string }>;
    };
    const stage = pipelineData.results?.find((s) => s.id === stageId);
    if (!stage) return null;
    return { stageId: stage.id, label: stage.label };
  } catch {
    return null;
  }
}
