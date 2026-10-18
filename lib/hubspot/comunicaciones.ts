/**
 * lib/hubspot/comunicaciones.ts — los correos, las notas y las llamadas de HubSpot, leídos por la BÚSQUEDA (lo modificado
 * desde una fecha) y con sus asociaciones a empresas y contactos en lote. Solo LEE. Lo usa la copia de cada hora
 * (lib/comunicaciones/copia-server.ts; plan en docs/correos-en-el-contexto-plan.md).
 *
 * Por qué la búsqueda y no el timeline de cada empresa: el timeline (API v1 de engagements) es un pedido por empresa y
 * por contacto, más de 1.500 por corrida. La búsqueda trae lo modificado de todo el portal en unas pocas páginas
 * (medido el 2026-10-18: 1.631 notas y 306 llamadas en 120 días), y las asociaciones v4 en lote dicen de quién es cada
 * una. Lo que no es de un cliente de Nexus se descarta después, sin guardarse.
 *
 * ⛔ «No se pudo leer» no es «no hay»: un error a mitad de la búsqueda vuelve como `completa: false`, y la copia no mueve
 * el punto de partida. Un 403 es `sinPermiso` (los correos, sin `sales-email-read`).
 */
import type { Client as HsClient } from "./sdk";
import { forceRefreshSystemToken, getSystemHubspotClient } from "./client";

/** correo | nota | llamada (los mismos valores que lib/comunicaciones/reglas.ts: la integración no importa del módulo). */
export type TipoDeComunicacion = "correo" | "nota" | "llamada";

type Respuesta = Awaited<ReturnType<HsClient["apiRequest"]>>;

async function pedir(hs: HsClient, req: { method: "GET" | "POST"; path: string; body?: object }): Promise<{ hs: HsClient; res: Respuesta }> {
  let res = await hs.apiRequest(req);
  if (res.status === 401) {
    await forceRefreshSystemToken();
    hs = await getSystemHubspotClient();
    res = await hs.apiRequest(req);
  }
  return { hs, res };
}

/** El objeto de HubSpot de cada tipo y las propiedades que se piden. */
export const OBJETO_DEL_TIPO: Record<TipoDeComunicacion, { objeto: "emails" | "notes" | "calls"; propiedades: readonly string[] }> = {
  correo: {
    objeto: "emails",
    propiedades: ["hs_timestamp", "hs_lastmodifieddate", "hs_email_direction", "hs_email_subject", "hs_email_text", "hs_email_html", "hs_email_from_email", "hubspot_owner_id"],
  },
  nota: { objeto: "notes", propiedades: ["hs_timestamp", "hs_lastmodifieddate", "hs_note_body", "hubspot_owner_id"] },
  llamada: {
    objeto: "calls",
    propiedades: ["hs_timestamp", "hs_lastmodifieddate", "hs_call_title", "hs_call_body", "hs_call_direction", "hubspot_owner_id"],
  },
};

export interface RegistroDeHubspot {
  id: string;
  p: Record<string, string | null | undefined>;
}

export interface Busqueda {
  sinPermiso: boolean;
  /** La búsqueda llegó al final (sin errores ni el tope de páginas). */
  completa: boolean;
  registros: RegistroDeHubspot[];
  /** La fecha de modificación más nueva que se vio (ms), para el punto de partida de la próxima. */
  ultimaModificacion: number | null;
}

const POR_PAGINA = 200;
/** La búsqueda de HubSpot no pasa de 10.000 resultados por consulta: antes de llegar, se vuelve a pedir desde lo último. */
const TOPE_DE_LA_CONSULTA = 9_800;

/**
 * Lo modificado desde `desdeModificacion` (ms) cuya fecha es posterior a `desdeOcurrio` (ms), ordenado por la fecha de
 * modificación. Como mucho `maxPaginas` páginas de 200: lo que falta lo trae la corrida siguiente (`completa: false`).
 */
export async function buscarModificadas(
  hs: HsClient,
  tipo: TipoDeComunicacion,
  desdeModificacion: number,
  desdeOcurrio: number,
  maxPaginas = 25,
): Promise<Busqueda> {
  const { objeto, propiedades } = OBJETO_DEL_TIPO[tipo];
  const out: Busqueda = { sinPermiso: false, completa: false, registros: [], ultimaModificacion: null };
  let desde = desdeModificacion;
  let after: string | undefined;
  let enEstaConsulta = 0;
  const vistos = new Set<string>();
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_lastmodifieddate", operator: "GTE", value: String(desde) },
            { propertyName: "hs_timestamp", operator: "GTE", value: String(desdeOcurrio) },
          ],
        },
      ],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
      properties: propiedades,
      limit: POR_PAGINA,
      ...(after ? { after } : {}),
    };
    let r: { hs: HsClient; res: Respuesta };
    try {
      r = await pedir(hs, { method: "POST", path: `/crm/v3/objects/${objeto}/search`, body });
    } catch {
      return out;
    }
    hs = r.hs;
    if (r.res.status === 403) return { ...out, sinPermiso: true };
    if (!r.res.ok) return out;
    const data = (await r.res.json()) as { results?: { id: string; properties?: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };
    for (const x of data.results ?? []) {
      const id = String(x.id);
      if (vistos.has(id)) continue;
      vistos.add(id);
      const p = x.properties ?? {};
      out.registros.push({ id, p });
      const mod = fechaMs(p.hs_lastmodifieddate);
      if (mod !== null && (out.ultimaModificacion === null || mod > out.ultimaModificacion)) out.ultimaModificacion = mod;
    }
    enEstaConsulta += data.results?.length ?? 0;
    after = data.paging?.next?.after;
    if (!after) {
      out.completa = true;
      return out;
    }
    if (enEstaConsulta + POR_PAGINA > TOPE_DE_LA_CONSULTA && out.ultimaModificacion !== null) {
      // Una consulta nueva desde lo último que se vio (GTE: repite lo de ese mismo milisegundo, y `vistos` lo saca).
      desde = out.ultimaModificacion;
      after = undefined;
      enEstaConsulta = 0;
    }
  }
  return out;
}

export interface AsociacionesDeRegistros {
  sinPermiso: boolean;
  /** Por registro, los ids asociados. Un registro leído sin asociaciones viene con []. */
  porRegistro: Map<string, string[]>;
  /** Los registros cuyo lote no contestó: no se sabe de quién son. */
  ilegibles: Set<string>;
}

/** A qué empresas (o contactos) está asociado cada registro, en lotes de 100. */
export async function asociacionesDe(
  hs: HsClient,
  tipo: TipoDeComunicacion,
  ids: readonly string[],
  hacia: "companies" | "contacts",
): Promise<AsociacionesDeRegistros> {
  const { objeto } = OBJETO_DEL_TIPO[tipo];
  const out: AsociacionesDeRegistros = { sinPermiso: false, porRegistro: new Map(), ilegibles: new Set() };
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    try {
      const r = await pedir(hs, { method: "POST", path: `/crm/v4/associations/${objeto}/${hacia}/batch/read`, body: { inputs: lote.map((id) => ({ id })) } });
      hs = r.hs;
      if (r.res.status === 403) return { ...out, sinPermiso: true };
      if (r.res.status !== 200 && r.res.status !== 207) {
        for (const id of lote) out.ilegibles.add(id);
        continue;
      }
      const data = (await r.res.json()) as {
        results?: { from: { id: string | number }; to?: { toObjectId: string | number }[] }[];
        errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[];
      };
      for (const id of lote) out.porRegistro.set(id, []);
      for (const fila of data.results ?? []) out.porRegistro.set(String(fila.from.id), (fila.to ?? []).map((t) => String(t.toObjectId)));
      // En un 207, «NO_ASSOCIATIONS_FOUND» es un registro sin nada asociado (se queda con []). Otro error: ilegible.
      for (const e of data.errors ?? []) {
        if (/NO_ASSOCIATIONS_FOUND/.test(e.subCategory ?? "")) continue;
        for (const id of e.context?.fromObjectId ?? []) {
          out.porRegistro.delete(String(id));
          out.ilegibles.add(String(id));
        }
      }
    } catch {
      for (const id of lote) out.ilegibles.add(id);
    }
  }
  return out;
}

export function fechaMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const ms = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}
