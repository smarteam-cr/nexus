/**
 * lib/hubspot/leads.ts — los LEADS de HubSpot (el objeto 0-136: el prospecto en calificación), con sus asociaciones a
 * empresas y contactos y las etapas de su pipeline (B3 etapa 1, 2026-10-25). Solo LEE. Lo usa la copia de cada hora
 * (lib/leads/copia-server.ts).
 *
 * Se leen TODOS los leads del portal por la búsqueda (medido el 2026-10-24: 86 en el portal, 55 asociados a 28 empresas
 * de Nexus): unas pocas páginas, menos pedidos que leer las asociaciones de cada empresa, y entran también los leads
 * que solo están asociados a un contacto de un cliente. El permiso de leads se dio el 24 oct.
 *
 * ⛔ «No se pudo leer» no es «no hay»: un error a mitad de la lista vuelve como `completa: false`, y la copia no le da de
 * baja a nadie. Un 403 es `sinPermiso`.
 */
import type { Client as HsClient } from "./sdk";

export const PROPIEDADES_DEL_LEAD = [
  "hs_lead_name",
  "hs_lead_name_calculated",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_pipeline_stage_category",
  "hs_lead_type",
  "hs_lead_source",
  "hubspot_owner_id",
  "hs_createdate",
  "hs_lastmodifieddate",
] as const;

export interface LeadLeido {
  id: string;
  p: Record<string, string | null | undefined>;
}

export interface ListaDeLeads {
  sinPermiso: boolean;
  completa: boolean;
  leads: LeadLeido[];
}

const POR_PAGINA = 200;
const MAX_PAGINAS = 40;

/** Todos los leads del portal (los archivados no vienen). */
export async function listarLeads(hs: HsClient): Promise<ListaDeLeads> {
  const out: ListaDeLeads = { sinPermiso: false, completa: false, leads: [] };
  let after: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let r: Awaited<ReturnType<HsClient["apiRequest"]>>;
    try {
      r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/leads/search",
        body: { filterGroups: [], sorts: [{ propertyName: "hs_createdate", direction: "ASCENDING" }], properties: PROPIEDADES_DEL_LEAD, limit: POR_PAGINA, ...(after ? { after } : {}) },
      });
    } catch {
      return out;
    }
    if (r.status === 403) return { ...out, sinPermiso: true };
    if (!r.ok) return out;
    const data = (await r.json()) as { results?: { id: string; properties?: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };
    for (const x of data.results ?? []) out.leads.push({ id: String(x.id), p: x.properties ?? {} });
    after = data.paging?.next?.after;
    if (!after) {
      out.completa = true;
      return out;
    }
  }
  return out;
}

export interface AsociacionesDeLeads {
  sinPermiso: boolean;
  /** Por lead, los ids asociados (el principal primero, si HubSpot lo marca). */
  porLead: Map<string, string[]>;
  /** Los leads cuyo lote no contestó. */
  ilegibles: Set<string>;
}

/** A qué empresas (o contactos) está asociado cada lead, en lotes de 100. */
export async function asociacionesDeLeads(hs: HsClient, ids: readonly string[], hacia: "companies" | "contacts"): Promise<AsociacionesDeLeads> {
  const out: AsociacionesDeLeads = { sinPermiso: false, porLead: new Map(), ilegibles: new Set() };
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    try {
      const r = await hs.apiRequest({ method: "POST", path: `/crm/v4/associations/leads/${hacia}/batch/read`, body: { inputs: lote.map((id) => ({ id })) } });
      if (r.status === 403) return { ...out, sinPermiso: true };
      if (r.status !== 200 && r.status !== 207) {
        for (const id of lote) out.ilegibles.add(id);
        continue;
      }
      const data = (await r.json()) as {
        results?: { from: { id: string | number }; to?: { toObjectId: string | number; associationTypes?: { label?: string | null }[] }[] }[];
        errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[];
      };
      for (const id of lote) out.porLead.set(id, []);
      for (const fila of data.results ?? []) {
        const destinos = [...(fila.to ?? [])].sort((a, b) => Number(esPrincipal(b)) - Number(esPrincipal(a)));
        out.porLead.set(String(fila.from.id), destinos.map((t) => String(t.toObjectId)));
      }
      for (const e of data.errors ?? []) {
        if (/NO_ASSOCIATIONS_FOUND/.test(e.subCategory ?? "")) continue;
        for (const id of e.context?.fromObjectId ?? []) {
          out.porLead.delete(String(id));
          out.ilegibles.add(String(id));
        }
      }
    } catch {
      for (const id of lote) out.ilegibles.add(id);
    }
  }
  return out;
}

const esPrincipal = (t: { associationTypes?: { label?: string | null }[] }) => (t.associationTypes ?? []).some((a) => /primary/i.test(a.label ?? ""));

/** Las etapas de los pipelines de leads: id → nombre. Sin respuesta, vacío (se guarda el id). */
export async function etapasDeLeads(hs: HsClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const r = await hs.apiRequest({ method: "GET", path: "/crm/v3/pipelines/leads" });
    if (!r.ok) return out;
    const data = (await r.json()) as { results?: { stages?: { id: string; label: string }[] }[] };
    for (const p of data.results ?? []) for (const s of p.stages ?? []) out.set(String(s.id), s.label);
  } catch {
    /* sin etapas: se guarda el id */
  }
  return out;
}
