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

/**
 * Ficha de un TRATO. Mismo patrón que la empresa: `/contacts/<portal>/deal/<id>`, en
 * singular. `null` si falta cualquiera de las dos piezas.
 *
 * Existe para que el panel de inconsistencias del reporte anual sea comprobable: una
 * lista que dice "esta venta no tiene cobranza" y no deja abrir la venta obliga a
 * buscarla a mano en HubSpot, y a la tercera nadie la revisa.
 */
export function hubspotDealUrl(
  portalId: string | null | undefined,
  dealId: string | null | undefined,
): string | null {
  if (!portalId || !dealId) return null;
  return `${APP}/contacts/${portalId}/deal/${dealId}`;
}

/**
 * Ficha de un TICKET — mismo patrón que empresa y trato: `/contacts/<portal>/ticket/<id>`,
 * en singular. `null` si falta cualquiera de las dos piezas.
 *
 * Lo pide el tablero de SICOP: las licitaciones públicas viven como tickets del pipeline
 * "Gobiernos", y una lista que no deja abrir la licitación obliga a buscarla a mano en
 * HubSpot — a la tercera vez, nadie la abre.
 */
export function hubspotTicketUrl(
  portalId: string | null | undefined,
  ticketId: string | null | undefined,
): string | null {
  if (!portalId || !ticketId) return null;
  return `${APP}/contacts/${portalId}/ticket/${ticketId}`;
}

/** Listado de empresas del portal — el fallback cuando se sabe el portal pero no la empresa. */
export function hubspotCompanyListUrl(portalId: string | null | undefined): string | null {
  if (!portalId) return null;
  return `${APP}/contacts/${portalId}/companies/list`;
}
