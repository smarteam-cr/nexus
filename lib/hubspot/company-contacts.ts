/**
 * lib/hubspot/company-contacts.ts — los CONTACTOS asociados a una empresa de HubSpot (2026-10-04).
 *
 * Para Éxito del cliente: quiénes son las personas del cliente, qué cargo tienen y cuándo se habló
 * con cada una por última vez. Con eso el agente vigía puede notar que el sponsor dejó de aparecer
 * o que solo queda un contacto activo. Lo guarda la copia de señales (`lib/hubspot/cs-signals.ts`)
 * dentro de `ClientCsSignals.engagement`, sin columna nueva.
 *
 * Mismo molde que `tickets.ts`: asociaciones v3 + lectura en lote, 403 = sin permiso (no es
 * error), 401 = reintento con el token del sistema renovado. Scope: `crm.objects.contacts.read`,
 * que la app ya tiene.
 */
import type { Client as HsClient } from "@hubspot/api-client";
import { forceRefreshSystemToken, getSystemHubspotClient } from "./client";

export interface ContactoDeEmpresa {
  id: string;
  nombre: string;
  email: string | null;
  cargo: string | null;
  /** ISO: la última vez que alguien del equipo registró un contacto con esta persona en HubSpot. */
  ultimoContacto: string | null;
  /** ISO: cuándo se creó el contacto. */
  creado: string | null;
}

export interface ContactosDeEmpresa {
  supported: boolean;
  contactos: ContactoDeEmpresa[];
}

/** Tope: una empresa con cientos de contactos no aporta más al agente que sus 25 más recientes. */
const TOPE = 25;

function instante(v: string | null | undefined): string | null {
  if (!v) return null;
  const ms = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function fetchOnce(hs: HsClient, companyId: string): Promise<{ status: number; result: ContactosDeEmpresa }> {
  const assoc = await hs.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/companies/${companyId}/associations/contacts?limit=100`,
  });
  if (assoc.status === 403) return { status: 403, result: { supported: false, contactos: [] } };
  if (assoc.status !== 200) return { status: assoc.status, result: { supported: true, contactos: [] } };
  const ids = (((await assoc.json()) as { results?: { id: string }[] }).results ?? []).map((r) => r.id);
  if (ids.length === 0) return { status: 200, result: { supported: true, contactos: [] } };

  const lote = await hs.apiRequest({
    method: "POST",
    path: "/crm/v3/objects/contacts/batch/read",
    body: {
      inputs: ids.slice(0, 100).map((id) => ({ id })),
      properties: ["firstname", "lastname", "email", "jobtitle", "notes_last_contacted", "createdate"],
    },
  });
  if (lote.status === 403) return { status: 403, result: { supported: false, contactos: [] } };
  if (lote.status !== 200 && lote.status !== 207) return { status: lote.status, result: { supported: true, contactos: [] } };
  const data = (await lote.json()) as {
    results?: { id: string; properties: Record<string, string | null | undefined> }[];
  };
  const contactos = (data.results ?? [])
    .map((c) => {
      const p = c.properties;
      const nombre = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
      return {
        id: c.id,
        nombre: nombre || p.email || "Contacto sin nombre",
        email: p.email ?? null,
        cargo: p.jobtitle?.trim() || null,
        ultimoContacto: instante(p.notes_last_contacted),
        creado: instante(p.createdate),
      };
    })
    // Primero con quien se habló hace menos; los nunca contactados, al final por fecha de alta.
    .sort((a, b) => (b.ultimoContacto ?? "").localeCompare(a.ultimoContacto ?? "") || (b.creado ?? "").localeCompare(a.creado ?? ""))
    .slice(0, TOPE);
  return { status: 200, result: { supported: true, contactos } };
}

/** Contactos de la empresa, con degradación de permiso y reintento ante 401. */
export async function fetchCompanyContacts(hs: HsClient, companyId: string): Promise<ContactosDeEmpresa> {
  try {
    let r = await fetchOnce(hs, companyId);
    if (r.status === 401) {
      await forceRefreshSystemToken();
      r = await fetchOnce(await getSystemHubspotClient(), companyId);
    }
    return r.result;
  } catch {
    return { supported: true, contactos: [] };
  }
}
