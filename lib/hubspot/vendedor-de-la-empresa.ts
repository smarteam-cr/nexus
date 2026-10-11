/**
 * lib/hubspot/vendedor-de-la-empresa.ts — quién VENDE una empresa: su dueño en HubSpot, si es alguien
 * del equipo en Nexus. SERVIDOR.
 *
 * Lo piden dos avisos (2026-10-07): el del diagnóstico listo para presentar y el de una solicitud
 * fuera de alcance confirmada. Elías: «el vendedor dueño de esa empresa en HubSpot (es el mismo
 * usuario en Nexus)». Medido ese día en producción: el dueño de la empresa es quien la vende (Andrés
 * Pinzón o Marco Salas); algunas empresas no tienen dueño.
 *
 * ⚠ Es el dueño de la EMPRESA (`hubspot_owner_id` de la company), NO el del proyecto:
 * `Project.hubspotOwnerEmail` es el CSE (sale de `csl_encargado`). Nexus no guarda este dato: se lee
 * de HubSpot en el momento del aviso, que pasa pocas veces. Una empresa fusionada responde con los
 * datos de la que quedó, así que el dueño sigue siendo el correcto.
 *
 * Nunca lanza: si no se puede saber, dice por qué, y quien avisa se lo cuenta al CSE.
 */
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "./client";

export type SinVendedor = "sin-hubspot" | "sin-dueno" | "no-esta-en-nexus" | "no-se-pudo-leer";

export type VendedorDeLaEmpresa =
  | { ok: true; email: string; nombre: string | null }
  | { ok: false; motivo: SinVendedor };

/** La frase para el CSE cuando no se pudo avisar al vendedor. */
export function porQueNoSeAvisoAlVendedor(motivo: SinVendedor): string {
  switch (motivo) {
    case "sin-hubspot":
      return "La empresa no está vinculada a HubSpot: no se avisó a ningún vendedor.";
    case "sin-dueno":
      return "La empresa no tiene dueño en HubSpot: no se avisó a ningún vendedor.";
    case "no-esta-en-nexus":
      return "El dueño de la empresa en HubSpot no está en Nexus: no se le avisó.";
    case "no-se-pudo-leer":
      return "No se pudo leer el dueño de la empresa en HubSpot: no se avisó al vendedor.";
  }
}

export async function vendedorDeLaEmpresa(clientId: string): Promise<VendedorDeLaEmpresa> {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { hubspotCompanyId: true } });
    if (!client?.hubspotCompanyId) return { ok: false, motivo: "sin-hubspot" };
    const hs = await getSystemHubspotClient();
    const r = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${encodeURIComponent(client.hubspotCompanyId)}?properties=hubspot_owner_id`,
    });
    const empresa = (await r.json()) as { properties?: Record<string, string | null> };
    const ownerId = empresa.properties?.hubspot_owner_id?.trim();
    if (!ownerId) return { ok: false, motivo: "sin-dueno" };
    const o = await hs.apiRequest({ method: "GET", path: `/crm/v3/owners/${encodeURIComponent(ownerId)}` });
    const email = ((await o.json()) as { email?: string }).email?.trim().toLowerCase();
    if (!email) return { ok: false, motivo: "no-esta-en-nexus" };
    const miembro = await prisma.teamMember.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deactivatedAt: null },
      select: { email: true, name: true },
    });
    if (!miembro) return { ok: false, motivo: "no-esta-en-nexus" };
    return { ok: true, email: miembro.email, nombre: miembro.name ?? null };
  } catch (e) {
    console.error(`[vendedor] no se pudo leer el dueño de la empresa ${clientId}: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, motivo: "no-se-pudo-leer" };
  }
}
