/**
 * lib/hubspot/urls.ts — las URLs de la app de HubSpot, en un solo lugar.
 *
 * Puro y client-safe (sin Prisma, sin el SDK): lo puede importar tanto un Server Component como
 * una isla cliente. Existe porque la forma de la URL estaba escrita a mano en varios lados y no
 * es adivinable: el segmento es `/contacts/<portal>/company/<id>` —en SINGULAR, aunque el
 * listado sea `/companies/list`—, y equivocarse ahí da un 404 dentro de HubSpot que parece un
 * problema de permisos.
 *
 * ⚠ El PORTAL importa tanto como el id. Un `hubspotCompanyId` solo tiene sentido dentro del
 * portal donde se resolvió: el del sistema (el CRM de Smarteam, donde viven prospectos y
 * propuestas) o el propio del cliente, cuando lo conectó. Cruzarlos abre una empresa ajena o
 * ninguna, así que el portal se pasa siempre explícito — nunca hay un default.
 */

const APP = "https://app.hubspot.com";

/** Ficha de una empresa. `null` si falta cualquiera de las dos piezas: sin las dos no hay link. */
export function hubspotCompanyUrl(
  portalId: string | null | undefined,
  companyId: string | null | undefined,
): string | null {
  if (!portalId || !companyId) return null;
  return `${APP}/contacts/${portalId}/company/${companyId}`;
}

/** Listado de empresas del portal — el fallback cuando se sabe el portal pero no la empresa. */
export function hubspotCompanyListUrl(portalId: string | null | undefined): string | null {
  if (!portalId) return null;
  return `${APP}/contacts/${portalId}/companies/list`;
}
