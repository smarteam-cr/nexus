/**
 * lib/exploraciones/hubspot.ts — lo que la exploración lee del HubSpot de SMARTEAM. SERVIDOR.
 *
 * Solo lee: la exploración nunca escribe en HubSpot. Todo pasa por el token del sistema con el
 * reintento ante un 401 que usan los demás lectores (el token se refresca y se vuelve a pedir una
 * vez). Lo que no responde se devuelve vacío: sin HubSpot, el lienzo se puede llenar a mano.
 */
import "server-only";
import { esNotaDeLaFicha } from "@/lib/clients/ficha";
import { forceRefreshSystemToken, getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerResultadoDelTest, PROPIEDADES_DEL_TEST, type ResultadoDelTest } from "./test-de-marketing";

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
  /** La última actividad de ventas (nota, llamada, reunión, correo), ISO. */
  ultimaActividad: string | null;
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
  "notes_last_updated",
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
  ultimaActividad: f.properties.notes_last_updated || null,
});

/** Cuántas empresas trae cada página de la lista. */
export const EMPRESAS_POR_PAGINA = 25;

/**
 * Las empresas del HubSpot de Smarteam, de a una página: buscadas por nombre o dominio, o, sin
 * búsqueda, las que tuvieron actividad de ventas más reciente (son miles: nunca se cargan todas).
 * Devuelve VARIAS para que el vendedor elija: tomar la primera, como hacía el buscador de
 * propuestas, abre la exploración de otra empresa sin que nadie lo note. `siguiente` es el cursor
 * de la página que sigue (null si no hay más).
 */
export async function buscarEmpresas(
  q: string,
  after: string | null = null,
): Promise<{ empresas: EmpresaDeHubspot[]; siguiente: string | null } | null> {
  const termino = q.trim();
  const body: Record<string, unknown> = {
    properties: PROPIEDADES_DE_EMPRESA,
    limit: EMPRESAS_POR_PAGINA,
    ...(after ? { after } : {}),
  };
  if (termino.length >= 2) {
    /* `query` busca en las propiedades de texto por defecto de la empresa (nombre, dominio, sitio,
       teléfono) y acepta varias palabras: «grupo inve» encuentra «Grupo INVE S.A.». Un filtro
       CONTAINS_TOKEN solo calza un token suelto. */
    body.query = termino;
    body.sorts = [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }];
  } else {
    /* Sin búsqueda: por la fecha de la última actividad de ventas (nota, llamada, reunión, correo),
       solo las que tienen alguna. `hs_lastmodifieddate` lo mueve cualquier automatización. */
    body.filterGroups = [{ filters: [{ propertyName: "notes_last_updated", operator: "HAS_PROPERTY" }] }];
    body.sorts = [{ propertyName: "notes_last_updated", direction: "DESCENDING" }];
  }
  const data = await pedirAHubspot<{ results?: FilaDeEmpresa[]; paging?: { next?: { after?: string } } }>({
    method: "POST",
    path: "/crm/v3/objects/companies/search",
    body,
  });
  if (!data) return null;
  return { empresas: (data.results ?? []).map(aEmpresa), siguiente: data.paging?.next?.after ?? null };
}

/** Una empresa por su id. null si no existe o HubSpot no respondió. */
export async function leerEmpresa(companyId: string): Promise<EmpresaDeHubspot | null> {
  const data = await pedirAHubspot<FilaDeEmpresa>({
    method: "GET",
    path: `/crm/v3/objects/companies/${encodeURIComponent(companyId)}?properties=${PROPIEDADES_DE_EMPRESA.join(",")}`,
  });
  return data ? aEmpresa(data) : null;
}

// ── Los contactos y el test ───────────────────────────────────────────────────

export interface ContactoDeHubspot {
  id: string;
  nombre: string;
  email: string | null;
  cargo: string | null;
  etapa: string | null;
  /** `Completado`, `Iniciado`, `Abandonado`: lo escribe el test de marketing. */
  estadoDelTest: string | null;
  /** La dirección del resultado del test, por área de la escala de hoy (`1`, `2`, `3`). */
  urlsDelTest: Record<string, string>;
  /** La empresa principal del contacto en HubSpot (`associatedcompanyid`). */
  empresaId: string | null;
}

const PROPIEDADES_DE_CONTACTO = [
  "firstname",
  "lastname",
  "email",
  "jobtitle",
  "puesto_actual",
  "lifecyclestage",
  "diag_estado",
  "diag_area",
  "diag_fecha_inicio",
  ...Object.values(PROPIEDADES_DEL_TEST),
  "associatedcompanyid",
  "lastmodifieddate",
];

type FilaDeContacto = { id: string; properties: Record<string, string | null | undefined> };

const aContacto = (f: FilaDeContacto): ContactoDeHubspot => {
  const p = f.properties;
  const urlsDelTest: Record<string, string> = {};
  for (const [area, prop] of Object.entries(PROPIEDADES_DEL_TEST)) {
    const u = p[prop];
    if (u) urlsDelTest[area] = u;
  }
  return {
    id: f.id,
    nombre: [p.firstname, p.lastname].filter(Boolean).join(" ").trim() || p.email || "(sin nombre)",
    email: p.email || null,
    cargo: p.jobtitle || p.puesto_actual || null,
    etapa: p.lifecyclestage || null,
    estadoDelTest: p.diag_estado || null,
    urlsDelTest,
    empresaId: p.associatedcompanyid || null,
  };
};

/** Los contactos asociados a la empresa (hasta 50), con lo que el test dejó en cada uno. */
export async function leerContactos(companyId: string): Promise<ContactoDeHubspot[]> {
  const asoc = await pedirAHubspot<{ results?: { toObjectId: number | string }[] }>({
    method: "GET",
    path: `/crm/v4/objects/companies/${encodeURIComponent(companyId)}/associations/contacts?limit=100`,
  });
  const ids = (asoc?.results ?? []).map((r) => String(r.toObjectId)).slice(0, 50);
  if (ids.length === 0) return [];
  const data = await pedirAHubspot<{ results?: FilaDeContacto[] }>({
    method: "POST",
    path: "/crm/v3/objects/contacts/batch/read",
    body: { properties: PROPIEDADES_DE_CONTACTO, inputs: ids.map((id) => ({ id })) },
  });
  return (data?.results ?? []).map(aContacto);
}

/** Los resultados del test de los contactos: el más reciente de cada área. */
export function testsDeLosContactos(contactos: readonly ContactoDeHubspot[]): { contacto: string; resultado: ResultadoDelTest }[] {
  const porArea = new Map<string, { contacto: string; resultado: ResultadoDelTest }>();
  for (const c of contactos) {
    for (const url of Object.values(c.urlsDelTest)) {
      const r = leerResultadoDelTest(url);
      if (!r) continue;
      const previo = porArea.get(r.areaId);
      if (!previo || (r.fecha ?? "") > (previo.resultado.fecha ?? "")) porArea.set(r.areaId, { contacto: c.nombre, resultado: r });
    }
  }
  return [...porArea.values()].sort((a, b) => a.resultado.areaId.localeCompare(b.resultado.areaId));
}

// ── La actividad: notas, llamadas, reuniones y correos ───────────────────────

export interface ActividadDeHubspot {
  /** Id estable del engagement (v1). */
  id: string;
  tipo: "NOTE" | "CALL" | "MEETING" | "EMAIL";
  /** Cuándo fue (ms); 0 si HubSpot no lo dice. Se escribe con lib/exploraciones/fechas.ts. */
  ts: number;
  titulo: string;
  texto: string;
  /** El resultado de una reunión que ya pasó, si HubSpot lo dice: se hizo, se canceló, se reagendó. */
  resultado?: ResultadoDeReunion;
}

export type ResultadoDeReunion = "hecha" | "cancelada" | "reagendada" | "no_se_presento";

/** El resultado de la reunión en HubSpot (`meetingOutcome`), en palabras de la exploración. */
export function resultadoDeReunion(outcome: unknown): ResultadoDeReunion | undefined {
  switch (typeof outcome === "string" ? outcome.toUpperCase() : "") {
    case "COMPLETED":
      return "hecha";
    case "CANCELED":
    case "CANCELLED":
      return "cancelada";
    case "RESCHEDULED":
      return "reagendada";
    case "NO_SHOW":
      return "no_se_presento";
    default:
      return undefined;
  }
}

/** Una reunión que no ocurrió como estaba agendada: ni es agenda ni es algo que el cliente dijo. */
export const reunionQueNoOcurrio = (r: ResultadoDeReunion | undefined) => r === "cancelada" || r === "reagendada" || r === "no_se_presento";

export interface ActividadDeLaEmpresa {
  /** Lo que ya pasó, más reciente primero. */
  material: ActividadDeHubspot[];
  /** Reuniones agendadas (todavía no ocurrieron): para la pantalla, NUNCA para el modelo. */
  agenda: { id: string; titulo: string; inicio: string }[];
  /** Correos que HubSpot no deja leer sin el permiso de correos: se cuentan para avisar. */
  correosSinPermiso: number;
}

type V1 = {
  engagement?: { id?: number | string; type?: string; timestamp?: number };
  associations?: { companyIds?: (number | string)[] };
  metadata?: Record<string, unknown>;
};

/**
 * ¿Una actividad leída por un CONTACTO es de esta empresa? Si cuelga de otras empresas y no de ésta
 * (el contacto cambió de trabajo, es de una agencia, de un grupo), no: se colaría lo de otra empresa
 * en esta exploración. Sin empresas asociadas, sí: es del contacto (la nota del test, por ejemplo).
 */
export function esDeLaEmpresa(e: { associations?: { companyIds?: (number | string)[] } }, companyId: string): boolean {
  const ids = (e.associations?.companyIds ?? []).map(String);
  return ids.length === 0 || ids.includes(companyId);
}

/** Cuántas páginas de 100 se leen por empresa o contacto: lo reciente y bastante más. */
const PAGINAS_DE_ACTIVIDAD = 3;

const QUE_SE_LEE = new Set(["NOTE", "CALL", "MEETING", "EMAIL"]);
const TAPADO = /has been redacted|ha sido ocultad|redactado/i;

/** HTML a texto plano: sin etiquetas, con los saltos de párrafo y las entidades comunes. */
export function textoPlano(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function aActividad(e: V1): ActividadDeHubspot | "tapado" | null {
  const tipo = e.engagement?.type ?? "";
  const id = e.engagement?.id != null ? String(e.engagement.id) : "";
  if (!QUE_SE_LEE.has(tipo) || !id) return null;
  const m = e.metadata ?? {};
  const get = (k: string) => (typeof m[k] === "string" ? textoPlano(m[k] as string) : "");
  let titulo = "";
  let texto = "";
  if (tipo === "NOTE") texto = get("body");
  else if (tipo === "CALL") {
    titulo = get("title");
    texto = [get("callSummary"), get("body")].filter(Boolean).join("\n");
  } else if (tipo === "MEETING") {
    titulo = get("title");
    // El notetaker de HubSpot deja su resumen en el cuerpo o en las notas internas de la reunión.
    texto = [get("body"), get("internalMeetingNotes")].filter(Boolean).join("\n");
  } else if (tipo === "EMAIL") {
    titulo = get("subject");
    texto = get("text") || get("html");
    if (TAPADO.test(texto) || TAPADO.test(titulo)) return "tapado";
  }
  // Una reunión sin texto igual sirve: si es futura, es agenda (la que se agenda desde el enlace del
  // test no trae descripción). Si ya pasó y no tiene texto, la descarta leerActividad.
  if (!texto && tipo !== "MEETING") return null;
  if (tipo === "NOTE" && esNotaDeLaFicha(texto)) return null;
  // De una reunión cuenta cuándo EMPIEZA (no cuándo se agendó).
  const inicio = tipo === "MEETING" && typeof m.startTime === "number" ? (m.startTime as number) : null;
  const ts = inicio ?? (typeof e.engagement?.timestamp === "number" ? e.engagement.timestamp : 0);
  const resultado = tipo === "MEETING" ? resultadoDeReunion(m.meetingOutcome) : undefined;
  return {
    id,
    tipo: tipo as ActividadDeHubspot["tipo"],
    ts,
    titulo,
    texto: texto.slice(0, 4000),
    ...(resultado ? { resultado } : {}),
  };
}

async function engagementsDe(objeto: "company" | "contact", id: string): Promise<V1[]> {
  const todos: V1[] = [];
  let offset: number | string | undefined;
  for (let pagina = 0; pagina < PAGINAS_DE_ACTIVIDAD; pagina++) {
    const sigue = offset !== undefined ? `&offset=${encodeURIComponent(String(offset))}` : "";
    const data = await pedirAHubspot<{ results?: V1[]; hasMore?: boolean; offset?: number | string }>({
      method: "GET",
      path: `/engagements/v1/engagements/associated/${objeto}/${encodeURIComponent(id)}/paged?limit=100${sigue}`,
    });
    todos.push(...(data?.results ?? []));
    if (!data?.hasMore || data.offset === undefined) break;
    offset = data.offset;
  }
  return todos;
}

/**
 * La actividad de la empresa Y de sus contactos (la nota del test y las reuniones que agenda el
 * prospecto pueden colgar solo del contacto). Sin repetidos; las reuniones futuras van aparte.
 */
export async function leerActividad(companyId: string, contactos: readonly ContactoDeHubspot[], ahora = new Date()): Promise<ActividadDeLaEmpresa> {
  const [deLaEmpresa, ...deLosContactos] = await Promise.all([
    engagementsDe("company", companyId),
    ...contactos.slice(0, 12).map((c) => engagementsDe("contact", c.id)),
  ]);
  const lotes = [deLaEmpresa, ...deLosContactos.map((lote) => lote.filter((e) => esDeLaEmpresa(e, companyId)))];
  const vistos = new Set<string>();
  const material: ActividadDeHubspot[] = [];
  const agenda: ActividadDeLaEmpresa["agenda"] = [];
  let correosSinPermiso = 0;
  for (const e of lotes.flat()) {
    const a = aActividad(e);
    if (a === "tapado") {
      correosSinPermiso++;
      continue;
    }
    if (!a || vistos.has(a.id)) continue;
    vistos.add(a.id);
    if (a.tipo === "MEETING" && a.ts > ahora.getTime()) {
      // Una reunión futura que se canceló o se reagendó no es agenda: la nueva fecha es otra reunión.
      if (reunionQueNoOcurrio(a.resultado)) continue;
      agenda.push({ id: a.id, titulo: a.titulo || "Reunión", inicio: new Date(a.ts).toISOString() });
      continue;
    }
    if (!a.texto) continue;
    material.push(a);
  }
  material.sort((a, b) => b.ts - a.ts);
  agenda.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return { material: material.slice(0, 40), agenda, correosSinPermiso };
}

// ── «Llegaron por el test» ────────────────────────────────────────────────────

export interface LlegadaPorElTest {
  companyId: string;
  empresa: string;
  dominio: string | null;
  contacto: string;
  areaId: string | null;
  fecha: string | null;
  /** Agendó una reunión con la herramienta de reuniones de HubSpot después del test (la revisión). */
  agendo: boolean;
  /** La próxima actividad agendada con ese contacto, si es futura. */
  proxima: string | null;
}

/** Fecha de HubSpot (ISO o milisegundos) → milisegundos, o null. */
function enMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los contactos que terminaron el test en los últimos `dias` días, agrupados por empresa. Es lo que
 * Marketing le pasa a Ventas: el prospecto hace el test y agenda la revisión del diagnóstico.
 */
export async function llegadasPorElTest(dias = 30, ahora = new Date()): Promise<LlegadaPorElTest[] | null> {
  const desde = ahora.getTime() - dias * 24 * 60 * 60 * 1000;
  /* `lastmodifieddate` acota la búsqueda (HubSpot no deja filtrar por la fecha del test), pero cambia
     con cualquier escritura en el contacto: abajo se filtra otra vez por la fecha del resultado. */
  const filas: FilaDeContacto[] = [];
  let after: string | undefined;
  for (let pagina = 0; pagina < 3; pagina++) {
    const data = await pedirAHubspot<{ results?: FilaDeContacto[]; paging?: { next?: { after?: string } } }>({
      method: "POST",
      path: "/crm/v3/objects/contacts/search",
      body: {
        filterGroups: [
          {
            filters: [
              { propertyName: "diag_estado", operator: "EQ", value: "Completado" },
              { propertyName: "lastmodifieddate", operator: "GTE", value: String(desde) },
            ],
          },
        ],
        properties: [...PROPIEDADES_DE_CONTACTO, "engagements_last_meeting_booked", "notes_next_activity_date"],
        sorts: [{ propertyName: "lastmodifieddate", direction: "DESCENDING" }],
        limit: 100,
        ...(after ? { after } : {}),
      },
    });
    if (!data) {
      if (pagina === 0) return null;
      break;
    }
    filas.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  const porEmpresa = new Map<string, LlegadaPorElTest>();
  for (const f of filas) {
    const companyId = f.properties.associatedcompanyid;
    if (!companyId || porEmpresa.has(companyId)) continue;
    const c = aContacto(f);
    const test = testsDeLosContactos([c])[0]?.resultado ?? null;
    // El test de hace meses no es una llegada, aunque el contacto se haya tocado ayer.
    const fechaDelTest = enMs(test?.fecha);
    if (fechaDelTest !== null && fechaDelTest < desde - 24 * 60 * 60 * 1000) continue;
    const agendada = enMs(f.properties.engagements_last_meeting_booked);
    const delTest = enMs(test?.fecha) ?? desde;
    const proxima = enMs(f.properties.notes_next_activity_date);
    porEmpresa.set(companyId, {
      companyId,
      empresa: "",
      dominio: null,
      contacto: c.nombre,
      areaId: test?.areaId ?? null,
      fecha: test?.fecha ?? null,
      // Un día de holgura: el test guarda su fecha al empezar y la reunión se agenda al terminar.
      agendo: agendada !== null && agendada >= delTest - 24 * 60 * 60 * 1000,
      proxima: proxima !== null && proxima >= ahora.getTime() ? new Date(proxima).toISOString() : null,
    });
  }
  const ids = [...porEmpresa.keys()].slice(0, 40);
  if (ids.length === 0) return [];
  const empresas = await pedirAHubspot<{ results?: FilaDeEmpresa[] }>({
    method: "POST",
    path: "/crm/v3/objects/companies/batch/read",
    body: { properties: ["name", "domain"], inputs: ids.map((id) => ({ id })) },
  });
  for (const e of empresas?.results ?? []) {
    const l = porEmpresa.get(e.id);
    if (!l) continue;
    l.empresa = e.properties.name?.trim() || e.properties.domain || "(sin nombre)";
    l.dominio = e.properties.domain || null;
  }
  return ids.map((id) => porEmpresa.get(id)!).filter((l) => l.empresa);
}
