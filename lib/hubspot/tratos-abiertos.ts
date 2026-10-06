/**
 * lib/hubspot/tratos-abiertos.ts — los tratos abiertos de venta propia, con su probabilidad y su empresa. SERVER-ONLY.
 *
 * Solo LEE. Lo usa la proyección de carga de Finanzas › Rentabilidad: cuánto trabajo trae el pipeline y desde cuándo.
 * La probabilidad es la de la etapa en HubSpot (`hs_deal_stage_probability`), la misma que ve Ventas.
 *
 * Devuelve tipos propios (no los del SDK), como pide ARCHITECTURE §7.
 */
import "server-only";
import { getSystemHubspotClient } from "./client";
import { ETAPAS_GANADAS, ETAPAS_PERDIDAS, PIPELINES_VENTA_PROPIA, labelDePipeline } from "@/lib/ventas/pipelines";

export interface TratoAbierto {
  id: string;
  nombre: string;
  pipeline: string;
  pipelineNombre: string;
  /** De 0 a 1, según la etapa. */
  probabilidad: number;
  /** ISO, o null si no tiene fecha de cierre. */
  cierre: string | null;
  monto: number | null;
  /** La empresa primaria del trato en HubSpot, o null. */
  hubspotCompanyId: string | null;
}

const PROPIEDADES = ["dealname", "pipeline", "dealstage", "closedate", "hs_deal_stage_probability", "amount"];

export async function leerTratosAbiertos(): Promise<TratoAbierto[]> {
  const hs = await getSystemHubspotClient();
  const crudos: Array<{ id: string; p: Record<string, string | null> }> = [];
  let after: string | undefined;
  do {
    const r = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/deals/search",
      body: {
        filterGroups: [
          {
            filters: [
              { propertyName: "pipeline", operator: "IN", values: [...PIPELINES_VENTA_PROPIA] },
              { propertyName: "dealstage", operator: "NOT_IN", values: [...ETAPAS_GANADAS, ...ETAPAS_PERDIDAS] },
            ],
          },
        ],
        properties: PROPIEDADES,
        limit: 100,
        after,
      },
    });
    if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as { results?: Array<{ id: string; properties: Record<string, string | null> }>; paging?: { next?: { after?: string } } };
    for (const d of data.results ?? []) crudos.push({ id: d.id, p: d.properties });
    after = data.paging?.next?.after;
  } while (after);

  const empresaDe = new Map<string, string>();
  for (let i = 0; i < crudos.length; i += 100) {
    const lote = crudos.slice(i, i + 100);
    const r = await hs.apiRequest({ method: "POST", path: "/crm/v4/associations/deals/companies/batch/read", body: { inputs: lote.map((d) => ({ id: d.id })) } });
    if (!r.ok) continue; // sin empresa el trato igual cuenta; solo no se sabe si ya es cliente
    const data = (await r.json()) as {
      results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number; associationTypes?: Array<{ label?: string | null; typeId?: number }> }> }>;
    };
    for (const x of data.results ?? []) {
      // La empresa que manda es la PRIMARIA, no la primera del arreglo (ver lib/ventas/sync-ganadas.ts).
      const primaria = x.to?.find((t) => t.associationTypes?.some((a) => a.typeId === 5 || /primary/i.test(a.label ?? "")));
      const elegida = primaria ?? x.to?.[0];
      if (elegida) empresaDe.set(x.from.id, String(elegida.toObjectId));
    }
  }

  return crudos.map(({ id, p }) => {
    const prob = Number(p.hs_deal_stage_probability);
    const monto = Number(p.amount);
    return {
      id,
      nombre: (p.dealname ?? "").trim() || "Trato sin nombre",
      pipeline: p.pipeline ?? "",
      pipelineNombre: labelDePipeline(p.pipeline ?? ""),
      probabilidad: Number.isFinite(prob) ? Math.max(0, Math.min(1, prob)) : 0,
      cierre: p.closedate ? new Date(p.closedate).toISOString() : null,
      monto: p.amount && Number.isFinite(monto) ? monto : null,
      hubspotCompanyId: empresaDe.get(id) ?? null,
    };
  });
}
