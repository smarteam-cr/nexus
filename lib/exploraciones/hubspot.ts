/**
 * lib/exploraciones/hubspot.ts — lo que la exploración lee del HubSpot de SMARTEAM. SERVIDOR.
 *
 * Solo lee: la exploración nunca escribe en HubSpot. Todo pasa por el token del sistema con el
 * reintento ante un 401 que usan los demás lectores (el token se refresca y se vuelve a pedir una
 * vez). Lo que no responde se devuelve vacío: sin HubSpot, el lienzo se puede llenar a mano.
 */
import "server-only";
import { forceRefreshSystemToken, getSystemHubspotClient } from "@/lib/hubspot/client";

interface Pedido {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

/** Un pedido a HubSpot con un reintento si el token venció. null si no se pudo. */
export async function pedirAHubspot<T>(pedido: Pedido): Promise<T | null> {
  try {
    let hs = await getSystemHubspotClient();
    let res = await hs.apiRequest(pedido);
    if (res.status === 401) {
      await forceRefreshSystemToken();
      hs = await getSystemHubspotClient();
      res = await hs.apiRequest(pedido);
    }
    if (!res.ok) {
      console.error(`[exploraciones/hubspot] ${pedido.method} ${pedido.path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`[exploraciones/hubspot] ${pedido.method} ${pedido.path} falló`, e);
    return null;
  }
}

export interface EmpresaDeHubspot {
  id: string;
  nombre: string;
  dominio: string | null;
  industria: string | null;
  pais: string | null;
  ciudad: string | null;
  empleados: string | null;
  sitio: string | null;
  etapa: string | null;
  descripcion: string | null;
}

const PROPIEDADES_DE_EMPRESA = [
  "name",
  "domain",
  "industry",
  "country",
  "city",
  "numberofemployees",
  "website",
  "lifecyclestage",
  "description",
];

type FilaDeEmpresa = { id: string; properties: Record<string, string | null | undefined> };

const aEmpresa = (f: FilaDeEmpresa): EmpresaDeHubspot => ({
  id: f.id,
  nombre: f.properties.name?.trim() || "(sin nombre)",
  dominio: f.properties.domain?.trim().toLowerCase() || null,
  industria: f.properties.industry || null,
  pais: f.properties.country || null,
  ciudad: f.properties.city || null,
  empleados: f.properties.numberofemployees || null,
  sitio: f.properties.website || null,
  etapa: f.properties.lifecyclestage || null,
  descripcion: f.properties.description || null,
});

/**
 * Busca empresas por nombre o dominio. Devuelve VARIAS para que el vendedor elija: tomar la primera,
 * como hacía el buscador de propuestas, abre la exploración de otra empresa sin que nadie lo note.
 */
export async function buscarEmpresas(q: string): Promise<EmpresaDeHubspot[] | null> {
  const termino = q.trim();
  if (termino.length < 2) return [];
  const data = await pedirAHubspot<{ results?: FilaDeEmpresa[] }>({
    method: "POST",
    path: "/crm/v3/objects/companies/search",
    body: {
      /* `query` busca en las propiedades de texto por defecto de la empresa (nombre, dominio, sitio,
         teléfono) y acepta varias palabras: «grupo inve» encuentra «Grupo INVE S.A.». Un filtro
         CONTAINS_TOKEN solo calza un token suelto. */
      query: termino,
      properties: PROPIEDADES_DE_EMPRESA,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      limit: 10,
    },
  });
  if (!data) return null;
  return (data.results ?? []).map(aEmpresa);
}

/** Una empresa por su id. null si no existe o HubSpot no respondió. */
export async function leerEmpresa(companyId: string): Promise<EmpresaDeHubspot | null> {
  const data = await pedirAHubspot<FilaDeEmpresa>({
    method: "GET",
    path: `/crm/v3/objects/companies/${encodeURIComponent(companyId)}?properties=${PROPIEDADES_DE_EMPRESA.join(",")}`,
  });
  return data ? aEmpresa(data) : null;
}
