/**
 * lib/clients/ficha-desde-hubspot-server.ts — trae de HubSpot los retos y el dolor principal de la empresa y, si
 * alguien los cambió allá, los deja como propuesta en Información del cliente (2026-10-09, entrega 6). SERVIDOR.
 *
 * Corre al abrir la ficha, como mucho cada `CADA_MS` por cliente (un solo proceso: RUNBOOK, invariante #1). Nunca
 * tira: sin HubSpot, la ficha se ve igual.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fusionarPropuesta, leerFicha, type ClaveDeFicha } from "./ficha";
import { cambiosDesdeHubspot, propiedadesQueVuelven } from "./ficha-desde-hubspot";

const CADA_MS = 10 * 60 * 1000;
const ultimaMirada = new Map<string, number>();

/** Los campos que quedaron con una propuesta nueva (vacío = nada nuevo). */
export async function traerCambiosDeHubspot(clientId: string): Promise<ClaveDeFicha[]> {
  const ahora = Date.now();
  if (ahora - (ultimaMirada.get(clientId) ?? 0) < CADA_MS) return [];
  ultimaMirada.set(clientId, ahora);
  try {
    const c = await prisma.client.findUnique({
      where: { id: clientId },
      select: { hubspotCompanyId: true, hubspotAccount: { select: { id: true } } },
    });
    // Un cliente con HubSpot PROPIO resuelve su empresa en SU portal: la ficha vive solo en Nexus.
    if (!c?.hubspotCompanyId || c.hubspotAccount) return [];
    const hs = await getSystemHubspotClient();
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${encodeURIComponent(c.hubspotCompanyId)}?properties=${propiedadesQueVuelven().join(",")}`,
    });
    if (!res.ok) return [];
    const empresa = (await res.json()) as { properties?: Record<string, string | null> };
    const enHubspot = empresa.properties ?? {};
    return await prisma.$transaction(async (tx) => {
      // Releer: el CSE pudo haber confirmado mientras se preguntaba a HubSpot.
      const fila = await tx.client.findUnique({ where: { id: clientId }, select: { ficha: true } });
      const ficha = leerFicha(fila?.ficha);
      const cambios = cambiosDesdeHubspot(ficha, enHubspot);
      if (cambios.length === 0) return [];
      const r = fusionarPropuesta(
        ficha,
        cambios.map((x) => ({ clave: x.clave, valor: x.valor, fuentes: ["Lo que dice HubSpot (lo cambiaron allá)"] })),
        "HubSpot",
      );
      const hubspotVisto = { ...(ficha.hubspotVisto ?? {}), ...Object.fromEntries(cambios.map((x) => [x.clave, x.html])) };
      await tx.client.update({ where: { id: clientId }, data: { ficha: { ...r.ficha, hubspotVisto } as object } });
      return r.cambiados;
    });
  } catch (e) {
    console.error("[ficha] no se pudo leer la ficha de vuelta desde HubSpot", e);
    return [];
  }
}
