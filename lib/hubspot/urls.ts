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

import { OBJETO_PROYECTOS } from "./asociaciones-proyecto";

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

/**
 * Ficha de un PROYECTO. Acá la forma cambia, y por eso vale un helper propio: «projects» es un
 * objeto PERSONALIZADO de HubSpot, así que su ficha no vive en `/contacts/<portal>/project/<id>`
 * —ese segmento no existe— sino en `/contacts/<portal>/record/<objectTypeId>/<id>`. El
 * objectTypeId lo declara un solo lugar (`OBJETO_PROYECTOS`), el mismo que usa el creador del
 * record: escribirlo a mano acá sería la segunda copia de un número que, equivocado, abre otro
 * objeto entero.
 *
 * ⚠ El portal es el del SISTEMA (el CRM de Smarteam), donde viven los records de proyecto —
 * nunca el portal propio del cliente, aunque la ficha tenga uno conectado.
 *
 * `null` si falta cualquiera de las dos piezas: sin las dos no hay link.
 */
export function hubspotProjectUrl(
  portalId: string | null | undefined,
  projectRecordId: string | null | undefined,
): string | null {
  if (!portalId || !projectRecordId) return null;
  return `${APP}/contacts/${portalId}/record/${OBJETO_PROYECTOS}/${projectRecordId}`;
}

/* ── Registros para vincular (Tareas internas, docs/tareas-plan.md §4.4) ───────────────────────────────────────── */

/** Lo que se puede vincular a una tarea: lo que la app lee con sus permisos de hoy. Un objeto propio es «2-…». */
export const OBJETOS_QUE_SE_VINCULAN: Readonly<Record<string, string>> = {
  "0-1": "Contacto",
  "0-2": "Empresa",
  "0-3": "Negocio",
  "0-5": "Ticket",
  [OBJETO_PROYECTOS]: "Proyecto",
};

const SINGULAR_A_OBJETO: Readonly<Record<string, string>> = { contact: "0-1", company: "0-2", deal: "0-3", ticket: "0-5" };

export interface EnlaceDeHubspot {
  portal: string;
  /** «0-3», «0-970», «2-12345». */
  objeto: string;
  id: string;
}

/** ¿Es un objeto que Nexus sabe leer para vincular (los estándar de arriba o uno propio)? */
export function seVincula(objeto: string): boolean {
  return objeto in OBJETOS_QUE_SE_VINCULAN || /^2-\d+$/.test(objeto);
}

/**
 * El portal, el objeto y el id de un enlace a un registro de HubSpot, o null si no es uno. Acepta las dos formas que
 * da la app: `/contacts/<portal>/deal/<id>` (las de siempre, en singular) y `/contacts/<portal>/record/<objeto>/<id>`
 * (la nueva, que sirve también para proyectos y objetos propios). Lo que viene después del id (pestañas, `?…`) no
 * importa. Que el portal sea el del sistema lo decide quien llama: acá no hay un default.
 */
export function leerEnlaceDeHubspot(texto: string): EnlaceDeHubspot | null {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^app(-[a-z0-9]+)?\.hubspot\.com$/.test(url.hostname)) return null;
  const partes = url.pathname.split("/").filter(Boolean);
  if (partes[0] !== "contacts" || !/^\d+$/.test(partes[1] ?? "")) return null;
  const portal = partes[1]!;
  if (partes[2] === "record" && /^(0|2)-\d+$/.test(partes[3] ?? "") && /^\d+$/.test(partes[4] ?? "")) {
    return { portal, objeto: partes[3]!, id: partes[4]! };
  }
  const objeto = SINGULAR_A_OBJETO[partes[2] ?? ""];
  if (objeto && /^\d+$/.test(partes[3] ?? "")) return { portal, objeto, id: partes[3]! };
  return null;
}

/** La ficha de cualquier registro: la forma de siempre para los estándar, `/record/` para el resto. */
export function hubspotRecordUrl(portalId: string, objeto: string, id: string): string {
  const singular = Object.entries(SINGULAR_A_OBJETO).find(([, o]) => o === objeto)?.[0];
  return singular ? `${APP}/contacts/${portalId}/${singular}/${id}` : `${APP}/contacts/${portalId}/record/${objeto}/${id}`;
}
