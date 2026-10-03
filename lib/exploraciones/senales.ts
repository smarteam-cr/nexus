/**
 * lib/exploraciones/senales.ts — el detonante con los HECHOS de HubSpot. PURO.
 *
 * Pedido de Elías (2026-10-02): en Preparación, antes de escribirle o llamarle, ver por qué hablar
 * ahora: el origen, el canal, lo último que hizo. Esto sale de las propiedades del contacto y de la
 * empresa tal cual (nunca del agente): de dónde llegó, el último formulario, sus visitas, si agendó.
 * El «por qué ahora» que interpreta todo eso sí lo escribe el agente, en su casilla.
 */

/** Lo que dejó el contacto en HubSpot: su teléfono y su paso por el sitio y los formularios. */
export interface RastroDelContacto {
  telefono: string | null;
  /** `hs_analytics_source`: de dónde llegó la primera vez. */
  fuente: string | null;
  /** `hs_analytics_source_data_1`: el detalle (la campaña, el buscador, la red). */
  fuenteDetalle: string | null;
  /** `hs_latest_source`: de dónde vino la última vez. */
  ultimaFuente: string | null;
  ultimaConversion: string | null;
  fechaUltimaConversion: string | null;
  primeraConversion: string | null;
  visitas: number | null;
  ultimaVisita: string | null;
  /** La última reunión que agendó con la herramienta de reuniones de HubSpot. */
  agendo: string | null;
}

/** Las propiedades de HubSpot de las que sale el rastro. */
export const PROPIEDADES_DEL_RASTRO = [
  "phone",
  "mobilephone",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_latest_source",
  "recent_conversion_event_name",
  "recent_conversion_date",
  "first_conversion_event_name",
  "hs_analytics_num_page_views",
  "hs_analytics_last_visit_timestamp",
  "engagements_last_meeting_booked",
] as const;

const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export function rastroDe(p: Record<string, string | null | undefined>): RastroDelContacto {
  const visitas = Number(p.hs_analytics_num_page_views);
  return {
    telefono: texto(p.mobilephone) ?? texto(p.phone),
    fuente: texto(p.hs_analytics_source),
    fuenteDetalle: texto(p.hs_analytics_source_data_1),
    ultimaFuente: texto(p.hs_latest_source),
    ultimaConversion: texto(p.recent_conversion_event_name),
    fechaUltimaConversion: texto(p.recent_conversion_date),
    primeraConversion: texto(p.first_conversion_event_name),
    visitas: Number.isFinite(visitas) && visitas > 0 ? visitas : null,
    ultimaVisita: texto(p.hs_analytics_last_visit_timestamp),
    agendo: texto(p.engagements_last_meeting_booked),
  };
}

/** Las fuentes de HubSpot (`hs_analytics_source`), en palabras del equipo. */
export const ETIQUETA_DE_LA_FUENTE_DE_HUBSPOT: Record<string, string> = {
  ORGANIC_SEARCH: "Búsqueda en Google",
  PAID_SEARCH: "Anuncio en buscadores",
  EMAIL_MARKETING: "Correo de marketing",
  SOCIAL_MEDIA: "Redes sociales",
  PAID_SOCIAL: "Anuncio en redes",
  REFERRALS: "Desde otro sitio",
  OTHER_CAMPAIGNS: "Otra campaña",
  DIRECT_TRAFFIC: "Entró directo al sitio",
  OFFLINE: "Cargado a mano o por integración",
  AI_REFERRALS: "Desde un asistente de IA",
};

export function etiquetaDeLaFuente(fuente: string | null): string | null {
  if (!fuente) return null;
  return ETIQUETA_DE_LA_FUENTE_DE_HUBSPOT[fuente] ?? fuente.toLowerCase().replace(/_/g, " ");
}

export interface ContactoConRastro {
  id: string;
  nombre: string;
  cargo: string | null;
  email: string | null;
  /** Hizo el test de marketing (lo terminó o lo empezó). */
  hizoElTest: boolean;
  rastro: RastroDelContacto;
}

/**
 * Con quién se habla: quien hizo el test; si nadie, el que convirtió más reciente; si tampoco, el
 * primero. Es una sugerencia para ordenar la pantalla, no un dato que se guarde.
 */
export function contactoPrincipal(contactos: readonly ContactoConRastro[]): ContactoConRastro | null {
  if (contactos.length === 0) return null;
  const delTest = contactos.find((c) => c.hizoElTest);
  if (delTest) return delTest;
  const conConversion = contactos
    .filter((c) => c.rastro.fechaUltimaConversion)
    .sort((a, b) => Date.parse(b.rastro.fechaUltimaConversion ?? "") - Date.parse(a.rastro.fechaUltimaConversion ?? ""));
  return conConversion[0] ?? contactos[0];
}

export interface Senal {
  /** Qué es: «Origen», «Último formulario», «Visitas al sitio», «Agendó». */
  que: string;
  valor: string;
  /** ISO, si la señal tiene fecha. */
  fecha?: string;
}

/** Los hechos del detonante, en el orden en que se leen: de dónde llegó, qué hizo y qué tan reciente. */
export function senalesDe(c: ContactoConRastro | null, opts: { test?: { area: string; fecha: string | null } | null } = {}): Senal[] {
  const salida: Senal[] = [];
  if (opts.test) salida.push({ que: "Hizo el diagnóstico de rendimiento", valor: opts.test.area, ...(opts.test.fecha ? { fecha: opts.test.fecha } : {}) });
  if (!c) return salida;
  const r = c.rastro;
  const origen = etiquetaDeLaFuente(r.fuente);
  if (origen) salida.push({ que: "Llegó por", valor: r.fuenteDetalle ? `${origen} · ${r.fuenteDetalle}` : origen });
  const ultima = etiquetaDeLaFuente(r.ultimaFuente);
  if (ultima && r.ultimaFuente !== r.fuente) salida.push({ que: "La última vez vino por", valor: ultima });
  if (r.ultimaConversion) salida.push({ que: "Último formulario", valor: r.ultimaConversion, ...(r.fechaUltimaConversion ? { fecha: r.fechaUltimaConversion } : {}) });
  if (r.primeraConversion && r.primeraConversion !== r.ultimaConversion) salida.push({ que: "Primer formulario", valor: r.primeraConversion });
  if (r.visitas) salida.push({ que: "Páginas vistas en el sitio", valor: String(r.visitas), ...(r.ultimaVisita ? { fecha: r.ultimaVisita } : {}) });
  if (r.agendo) salida.push({ que: "Agendó una reunión", valor: "con la herramienta de reuniones de HubSpot", fecha: r.agendo });
  return salida;
}
