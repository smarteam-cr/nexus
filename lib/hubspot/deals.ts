import type { Client as HsClient } from "@hubspot/api-client";

export interface AvailableDeal {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
  /** true = cerrado (ganado O perdido). Distingue "abierto" de "perdido viejo" —
   *  lo usa la señal de renovación/expansión del panel de Éxito del cliente. */
  isClosed: boolean;
  pipeline: string | null; // label del pipeline (resuelto del id), ej. "Sales Pipeline"
  stage: string | null; // label de la etapa DENTRO del pipeline, ej. "Contactado"
}

interface PipelineMeta {
  labels: Map<string, string>; // pipelineId → label
  stages: Map<string, Map<string, string>>; // pipelineId → (stageId → label)
}

// Cache por proceso de los pipelines de deals + sus etapas. Cambian rara vez; un
// restart del server lo refresca.
let dealPipelineCache: PipelineMeta | null = null;

async function dealPipelineMeta(hsClient: HsClient): Promise<PipelineMeta> {
  if (dealPipelineCache) return dealPipelineCache;
  const labels = new Map<string, string>();
  const stages = new Map<string, Map<string, string>>();
  try {
    // GET /crm/v3/pipelines/deals ya trae las etapas ANIDADAS por pipeline — no
    // hace falta una llamada aparte por pipeline (a diferencia de projects, que
    // resuelve etapa por etapa vía /crm/v3/pipelines/{slug}/{id}/stages).
    const res = await hsClient.apiRequest({ method: "GET", path: "/crm/v3/pipelines/deals" });
    if (res.ok) {
      const data = (await res.json()) as {
        results?: { id: string; label: string; stages?: { id: string; label: string }[] }[];
      };
      for (const p of data.results ?? []) {
        labels.set(p.id, p.label);
        const stageMap = new Map<string, string>();
        for (const s of p.stages ?? []) stageMap.set(s.id, s.label);
        stages.set(p.id, stageMap);
      }
    }
  } catch {
    /* sin labels → se muestra el id crudo, y la etapa queda null */
  }
  dealPipelineCache = { labels, stages };
  return dealPipelineCache;
}

/**
 * Lee los deals asociados a una company y los formatea: ganados primero (por
 * closedate desc), luego el resto. Mismo criterio que el selector de
 * deal-line-items. Devuelve [] si no hay company o no hay deals.
 */
export async function fetchCompanyDeals(hsClient: HsClient, companyId: string): Promise<AvailableDeal[]> {
  const assocRes = await hsClient.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/companies/${companyId}/associations/deals?limit=100`,
  });
  if (assocRes.status !== 200) return [];

  const assocData = (await assocRes.json()) as { results?: { id: string }[] };
  const dealIds = (assocData.results ?? []).map((r) => r.id);
  if (dealIds.length === 0) return [];

  const [dealsRes, meta] = await Promise.all([
    hsClient.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/deals/batch/read",
      body: {
        inputs: dealIds.slice(0, 100).map((id) => ({ id })),
        properties: ["dealname", "amount", "closedate", "hs_is_closed_won", "hs_is_closed", "pipeline", "dealstage"],
      },
    }),
    dealPipelineMeta(hsClient),
  ]);
  const dealsData = (await dealsRes.json()) as {
    results?: {
      id: string;
      properties: {
        dealname?: string | null;
        amount?: string | null;
        closedate?: string | null;
        hs_is_closed_won?: string | null;
        hs_is_closed?: string | null;
        pipeline?: string | null;
        dealstage?: string | null;
      };
    }[];
  };
  const all = dealsData.results ?? [];

  const won = all
    .filter((d) => d.properties.hs_is_closed_won === "true")
    .sort((a, b) => {
      const tA = a.properties.closedate ? new Date(a.properties.closedate).getTime() : 0;
      const tB = b.properties.closedate ? new Date(b.properties.closedate).getTime() : 0;
      return tB - tA;
    });

  return [...won, ...all.filter((d) => d.properties.hs_is_closed_won !== "true")].map((d) => {
    const pipelineId = d.properties.pipeline ?? null;
    const stageId = d.properties.dealstage ?? null;
    return {
      id: d.id,
      name: d.properties.dealname ?? "Deal sin nombre",
      amount: d.properties.amount ?? null,
      closedate: d.properties.closedate ?? null,
      isWon: d.properties.hs_is_closed_won === "true",
      isClosed: d.properties.hs_is_closed === "true" || d.properties.hs_is_closed_won === "true",
      pipeline: pipelineId ? (meta.labels.get(pipelineId) ?? pipelineId) : null,
      stage: pipelineId && stageId ? (meta.stages.get(pipelineId)?.get(stageId) ?? stageId) : null,
    };
  });
}
