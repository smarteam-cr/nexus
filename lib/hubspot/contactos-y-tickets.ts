/**
 * lib/hubspot/contactos-y-tickets.ts — los contactos y los tickets de VARIAS empresas de HubSpot, en lote (etapa 6a de
 * docs/mi-dia-plan.md). Solo LEE. Lo usa la copia de cada hora (lib/contactos/copia-server.ts).
 *
 * `company-contacts.ts` y `tickets.ts` leen de a UNA empresa (la copia diaria de señales de Éxito del cliente); acá van
 * las asociaciones v4 en lotes de 100 empresas y la lectura en lotes de 100 registros: unas pocas llamadas por corrida.
 *
 * ⛔ «No se pudo leer» no es «no tiene»: una empresa cuyo lote de asociaciones falló vuelve en `ilegibles`, y la copia
 * NO le da de baja a nadie (un 429 no puede vaciar la lista de personas de un cliente). Un 403 es `sinPermiso`.
 */
import type { Client as HsClient } from "./sdk";

const LOTE = 100;

export type ObjetoAsociado = "contacts" | "tickets";

export interface Asociaciones {
  sinPermiso: boolean;
  /** Por empresa, los ids asociados. Una empresa leída sin asociaciones viene con []. */
  porEmpresa: Map<string, string[]>;
  /** Las empresas cuyo lote no contestó: no se sabe qué tienen. */
  ilegibles: Set<string>;
  /** Las empresas con más asociaciones de las que trae una página (500): se copian las primeras. */
  truncadas: Set<string>;
}

export interface ContactoLeido {
  id: string;
  nombre: string;
  email: string | null;
  cargo: string | null;
  ownerId: string | null;
  ultimoContacto: Date | null;
  ultimaActividad: Date | null;
  creado: Date | null;
}

export interface TicketLeido {
  id: string;
  asunto: string;
  pipeline: string | null;
  etapaId: string | null;
  prioridad: string | null;
  ownerId: string | null;
  creado: Date | null;
  cerrado: Date | null;
  modificado: Date | null;
}

export interface EtapaDeTicket {
  nombre: string;
  pipeline: string;
  /** HubSpot la marca cerrada (metadata.ticketState = CLOSED). */
  cerrada: boolean;
}

function fecha(v: string | null | undefined): Date | null {
  if (!v) return null;
  const ms = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

const texto = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Un pedido; el transporte (lib/hubspot/client.ts) ya renueva el token ante un 401 y espera ante un 429. Devuelve la respuesta cruda. */
type Respuesta = Awaited<ReturnType<HsClient["apiRequest"]>>;

async function pedir(hs: HsClient, req: { method: "GET" | "POST"; path: string; body?: object }): Promise<Respuesta> {
  return hs.apiRequest(req);
}

/** Qué contactos (o tickets) tiene asociados cada empresa. */
export async function asociacionesDeEmpresas(hs: HsClient, companyIds: readonly string[], hacia: ObjetoAsociado): Promise<Asociaciones> {
  const out: Asociaciones = { sinPermiso: false, porEmpresa: new Map(), ilegibles: new Set(), truncadas: new Set() };
  for (let i = 0; i < companyIds.length; i += LOTE) {
    const lote = companyIds.slice(i, i + LOTE);
    try {
      const r = await pedir(hs, { method: "POST", path: `/crm/v4/associations/companies/${hacia}/batch/read`, body: { inputs: lote.map((id) => ({ id })) } });
      if (r.status === 403) {
        out.sinPermiso = true;
        return out;
      }
      if (r.status !== 200 && r.status !== 207) {
        for (const id of lote) out.ilegibles.add(id);
        continue;
      }
      const data = (await r.json()) as {
        results?: { from: { id: string }; to?: { toObjectId: string | number }[]; paging?: { next?: { after?: string } } }[];
        errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[];
      };
      for (const id of lote) out.porEmpresa.set(id, []);
      for (const fila of data.results ?? []) {
        out.porEmpresa.set(String(fila.from.id), (fila.to ?? []).map((t) => String(t.toObjectId)));
        if (fila.paging?.next?.after) out.truncadas.add(String(fila.from.id));
      }
      // En un 207, «NO_ASSOCIATIONS_FOUND» es una empresa sin nada asociado (se queda con []). Cualquier otro error es
      // una empresa que no se leyó: ilegible, no «sin nada».
      for (const e of data.errors ?? []) {
        if (/NO_ASSOCIATIONS_FOUND/.test(e.subCategory ?? "")) continue;
        for (const id of e.context?.fromObjectId ?? []) {
          out.porEmpresa.delete(String(id));
          out.ilegibles.add(String(id));
        }
      }
    } catch {
      for (const id of lote) out.ilegibles.add(id);
    }
  }
  return out;
}

/** Lee registros en lote. Lo que no vuelve (borrado, o un lote que falló) se informa en `faltan` / `fallo`. */
async function leerEnLote(
  hs: HsClient,
  objeto: ObjetoAsociado,
  ids: readonly string[],
  propiedades: readonly string[],
): Promise<{ sinPermiso: boolean; fallo: boolean; filas: { id: string; p: Record<string, string | null | undefined> }[] }> {
  const filas: { id: string; p: Record<string, string | null | undefined> }[] = [];
  let fallo = false;
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    try {
      const r = await pedir(hs, {
        method: "POST",
        path: `/crm/v3/objects/${objeto}/batch/read`,
        body: { inputs: lote.map((id) => ({ id })), properties: propiedades },
      });
      if (r.status === 403) return { sinPermiso: true, fallo, filas };
      if (r.status !== 200 && r.status !== 207) {
        fallo = true;
        continue;
      }
      const data = (await r.json()) as { results?: { id: string; properties: Record<string, string | null | undefined> }[] };
      for (const x of data.results ?? []) filas.push({ id: String(x.id), p: x.properties ?? {} });
    } catch {
      fallo = true;
    }
  }
  return { sinPermiso: false, fallo, filas };
}

export async function leerContactos(hs: HsClient, ids: readonly string[]) {
  const r = await leerEnLote(hs, "contacts", ids, [
    "firstname", "lastname", "email", "jobtitle", "hubspot_owner_id", "notes_last_contacted", "notes_last_updated", "createdate",
  ]);
  const contactos: ContactoLeido[] = r.filas.map(({ id, p }) => {
    const nombre = [p.firstname, p.lastname].filter((x) => x && x.trim()).join(" ").trim();
    return {
      id,
      nombre: nombre || texto(p.email) || "Contacto sin nombre",
      email: texto(p.email)?.toLowerCase() ?? null,
      cargo: texto(p.jobtitle),
      ownerId: texto(p.hubspot_owner_id),
      ultimoContacto: fecha(p.notes_last_contacted),
      ultimaActividad: fecha(p.notes_last_updated),
      creado: fecha(p.createdate),
    };
  });
  return { sinPermiso: r.sinPermiso, fallo: r.fallo, contactos };
}

export async function leerTickets(hs: HsClient, ids: readonly string[]) {
  const r = await leerEnLote(hs, "tickets", ids, [
    "subject", "hs_pipeline", "hs_pipeline_stage", "hs_ticket_priority", "hubspot_owner_id", "createdate", "closed_date", "hs_lastmodifieddate",
  ]);
  const tickets: TicketLeido[] = r.filas.map(({ id, p }) => ({
    id,
    asunto: texto(p.subject) ?? "Ticket sin asunto",
    pipeline: texto(p.hs_pipeline),
    etapaId: texto(p.hs_pipeline_stage),
    prioridad: texto(p.hs_ticket_priority),
    ownerId: texto(p.hubspot_owner_id),
    creado: fecha(p.createdate),
    cerrado: fecha(p.closed_date),
    modificado: fecha(p.hs_lastmodifieddate),
  }));
  return { sinPermiso: r.sinPermiso, fallo: r.fallo, tickets };
}

/** Las etapas de los pipelines de tickets: su nombre y si HubSpot la da por cerrada. */
export async function etapasDeTickets(hs: HsClient): Promise<Map<string, EtapaDeTicket>> {
  const out = new Map<string, EtapaDeTicket>();
  try {
    const res = await pedir(hs, { method: "GET", path: "/crm/v3/pipelines/tickets" });
    if (!res.ok) return out;
    const data = (await res.json()) as {
      results?: { label: string; stages?: { id: string; label: string; metadata?: { ticketState?: string } }[] }[];
    };
    for (const p of data.results ?? []) {
      for (const s of p.stages ?? []) {
        out.set(String(s.id), { nombre: s.label, pipeline: p.label, cerrada: (s.metadata?.ticketState ?? "").toUpperCase() === "CLOSED" });
      }
    }
  } catch {
    /* sin etapas: se guarda el id y «abierto» sale de la fecha de cierre */
  }
  return out;
}
