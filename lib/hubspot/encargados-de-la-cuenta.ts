/**
 * lib/hubspot/encargados-de-la-cuenta.ts — quién lleva una cuenta en HubSpot: «CSE Encargado» y «CSL Encargado»
 * en la empresa, sus contactos y sus proyectos de implementación (2026-10-09, entrega 5 de
 * docs/exito-del-cliente-cartera-plan.md). SERVIDOR.
 *
 * Decisión de Elías (2026-10-07): «CSE Encargado» (`cse_encargado`) es el CSE de la cuenta y «CSL Encargado»
 * (`csl_encargado`) pasa a ser la CSL. Hasta ahora `csl_encargado` guardaba al CSE (103 de 111 proyectos) y
 * `cse_encargado` estaba vacío: el espejo lee primero `cse_encargado` y, si está vacío, `csl_encargado`, así que la
 * migración (scripts/migrar-cse-encargado.ts) no le cambia a nadie las cuentas que ve.
 *
 * Los dos son campos OWNER: guardan el id de usuario de HubSpot, no el correo (`resolverOwnerIdPorEmail`).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import type { getSystemHubspotClient } from "./client";

type HsClient = Awaited<ReturnType<typeof getSystemHubspotClient>>;

import { propiedadesDeEncargados, type Encargados } from "./encargados";
export { PROP_CSE_ENCARGADO, PROP_CSL_ENCARGADO, propiedadesDeEncargados, type Encargados } from "./encargados";

/** La CSL del equipo (el rol en Nexus, no un correo escrito en el código). null si no hay una activa. */
export async function laCsl(): Promise<{ email: string; nombre: string } | null> {
  const filas = await prisma.teamMember.findMany({
    where: { roleEnum: "CSL", deactivatedAt: null },
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true },
  });
  // Las cuentas de prueba también tienen el rol («Test CSE (vista Heiver)»): no son la CSL.
  const m = filas.find((f) => !esCuentaDePrueba(f.name));
  return m ? { email: m.email, nombre: m.name } : null;
}

async function pedir(hs: HsClient, method: "GET" | "PATCH" | "POST", path: string, body?: unknown) {
  const res = await hs.apiRequest({ method, path, ...(body ? { body } : {}) });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status}: ${cuerpo.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Los contactos asociados a una empresa (ids). */
export async function contactosDeLaEmpresa(hs: HsClient, companyId: string): Promise<string[]> {
  const ids: string[] = [];
  let despues: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const data = (await pedir(
      hs,
      "GET",
      `/crm/v4/objects/companies/${encodeURIComponent(companyId)}/associations/contacts?limit=500${despues ? `&after=${encodeURIComponent(despues)}` : ""}`,
    )) as { results?: { toObjectId?: string | number }[]; paging?: { next?: { after?: string } } } | null;
    for (const r of data?.results ?? []) if (r.toObjectId != null) ids.push(String(r.toObjectId));
    despues = data?.paging?.next?.after;
    if (!despues) break;
  }
  return [...new Set(ids)];
}

/**
 * Escribe los encargados en la empresa y en todos sus contactos. No tira: devuelve lo que entró y lo que no, para
 * que quien llama lo diga (los proyectos son lo que decide quién ve la cuenta; esto completa HubSpot).
 */
export async function escribirEncargadosEnLaEmpresa(
  hs: HsClient,
  companyId: string,
  e: Encargados,
): Promise<{ empresa: boolean; contactos: number; contactosFallidos: number; error: string | null }> {
  const properties = propiedadesDeEncargados(e);
  let empresa = false;
  let error: string | null = null;
  try {
    await pedir(hs, "PATCH", `/crm/v3/objects/companies/${encodeURIComponent(companyId)}`, { properties });
    empresa = true;
  } catch (err) {
    error = (err as Error).message;
  }
  let contactos = 0;
  let contactosFallidos = 0;
  try {
    const ids = await contactosDeLaEmpresa(hs, companyId);
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      try {
        await pedir(hs, "POST", "/crm/v3/objects/contacts/batch/update", { inputs: lote.map((id) => ({ id, properties })) });
        contactos += lote.length;
      } catch (err) {
        contactosFallidos += lote.length;
        error ??= (err as Error).message;
      }
    }
  } catch (err) {
    error ??= (err as Error).message;
  }
  return { empresa, contactos, contactosFallidos, error };
}
