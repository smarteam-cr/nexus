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
import { agruparLlegadas, esDePrueba, leerNotaDelTest, type LlegadaAgrupada, type NotaDeLlegada } from "./llegadas";
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

/** Una dirección del resultado del test y quién lo hizo: del contacto o de la nota que dejó el test. */
export interface EnlaceDelTest {
  contacto: string;
  url: string;
}

/** Las direcciones del test que guardan los contactos (`url_ultimo_diag_*`). */
export function enlacesDeLosContactos(contactos: readonly ContactoDeHubspot[]): EnlaceDelTest[] {
  return contactos.flatMap((c) => Object.values(c.urlsDelTest).map((url) => ({ contacto: c.nombre, url })));
}

/** Los resultados del test: el más reciente de cada área. */
export function testsDeLosEnlaces(enlaces: readonly EnlaceDelTest[]): { contacto: string; resultado: ResultadoDelTest }[] {
  const porArea = new Map<string, { contacto: string; resultado: ResultadoDelTest }>();
  for (const e of enlaces) {
    const r = leerResultadoDelTest(e.url);
    if (!r) continue;
    const previo = porArea.get(r.areaId);
    if (!previo || (r.fecha ?? "") > (previo.resultado.fecha ?? "")) porArea.set(r.areaId, { contacto: e.contacto, resultado: r });
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
  /**
   * Las direcciones del resultado que traen las notas del test. Los tests de junio y julio de 2026
   * dejaron la nota pero no la dirección en el contacto: sin esto, la preparación los daba por no hechos.
   */
  enlacesDelTest?: EnlaceDelTest[];
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

/** La dirección del resultado que trae una nota del test, con quién lo hizo. */
function enlaceDeLaNota(e: V1): EnlaceDelTest | null {
  const body = e.metadata?.body;
  if (e.engagement?.type !== "NOTE" || typeof body !== "string") return null;
  const nota = leerNotaDelTest(body);
  if (!nota?.resultado) return null;
  return { contacto: nota.contacto ?? "quien hizo el test", url: nota.resultado.url };
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
  const enlacesDelTest: EnlaceDelTest[] = [];
  for (const e of lotes.flat()) {
    const enlace = enlaceDeLaNota(e);
    if (enlace && !enlacesDelTest.some((x) => x.url === enlace.url)) enlacesDelTest.push(enlace);
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
  return { material: material.slice(0, 40), agenda, correosSinPermiso, enlacesDelTest };
}

// ── «Llegaron por el test» ────────────────────────────────────────────────────

export interface LlegadaPorElTest extends LlegadaAgrupada {
  empresa: string;
  dominio: string | null;
  /** Agendó una reunión con la herramienta de reuniones de HubSpot después del test (la revisión). */
  agendo: boolean;
  /** La próxima actividad agendada con ese contacto, si es futura. */
  proxima: string | null;
}

export interface LlegadasPorElTest {
  llegadas: LlegadaPorElTest[];
  /** Notas del test de alguien sin empresa en HubSpot: sin empresa no hay exploración que abrir. */
  sinEmpresa: number;
}

/** Fecha de HubSpot (ISO o milisegundos) → milisegundos, o null. */
function enMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

/** Páginas de 100 notas: medido el 2026-10-01 hay ~240 que dicen «Diagnóstico» desde junio. */
const PAGINAS_DE_NOTAS = 8;

type FilaDeNota = { id: string; properties: { hs_note_body?: string | null; hs_timestamp?: string | null } };

/** Hacia dónde apunta cada nota (empresas o contactos), en lotes de 100. */
async function asociacionesDeNotas(ids: readonly string[], hacia: "companies" | "contacts"): Promise<Map<string, string[]>> {
  const salida = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const data = await pedirAHubspot<{ results?: { from: { id: string | number }; to?: { toObjectId: string | number }[] }[] }>({
      method: "POST",
      path: `/crm/v4/associations/notes/${hacia}/batch/read`,
      body: { inputs: ids.slice(i, i + 100).map((id) => ({ id })) },
    });
    for (const r of data?.results ?? []) salida.set(String(r.from.id), (r.to ?? []).map((t) => String(t.toObjectId)));
  }
  return salida;
}

/**
 * Quiénes hicieron el test desde `desde`, una fila por empresa, leídos de las NOTAS que deja el test
 * (lib/exploraciones/llegadas.ts). Sin las pruebas internas. null si HubSpot no responde.
 */
export async function llegadasPorElTest(desde: Date, ahora = new Date()): Promise<LlegadasPorElTest | null> {
  const notas: FilaDeNota[] = [];
  let after: string | undefined;
  for (let pagina = 0; pagina < PAGINAS_DE_NOTAS; pagina++) {
    const data = await pedirAHubspot<{ results?: FilaDeNota[]; paging?: { next?: { after?: string } } }>({
      method: "POST",
      path: "/crm/v3/objects/notes/search",
      body: {
        query: "Diagnóstico",
        filterGroups: [{ filters: [{ propertyName: "hs_timestamp", operator: "GTE", value: String(desde.getTime()) }] }],
        properties: ["hs_note_body", "hs_timestamp"],
        sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
        limit: 100,
        ...(after ? { after } : {}),
      },
    });
    if (!data) {
      if (pagina === 0) return null;
      break;
    }
    notas.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) break;
  }

  const delTest = notas.flatMap((n) => {
    const nota = leerNotaDelTest(n.properties.hs_note_body ?? "");
    return nota ? [{ id: n.id, ts: enMs(n.properties.hs_timestamp) ?? 0, nota }] : [];
  });
  if (delTest.length === 0) return { llegadas: [], sinEmpresa: 0 };

  const ids = delTest.map((n) => n.id);
  const [empresasDe, contactosDe] = await Promise.all([asociacionesDeNotas(ids, "companies"), asociacionesDeNotas(ids, "contacts")]);

  // Los contactos: su empresa (si la nota no cuelga de una) y si agendó la revisión.
  const idsDeContactos = [...new Set(delTest.map((n) => contactosDe.get(n.id)?.[0]).filter((x): x is string => !!x))];
  const contactos = new Map<string, Record<string, string | null | undefined>>();
  for (let i = 0; i < idsDeContactos.length; i += 100) {
    const data = await pedirAHubspot<{ results?: FilaDeContacto[] }>({
      method: "POST",
      path: "/crm/v3/objects/contacts/batch/read",
      body: {
        properties: ["associatedcompanyid", "engagements_last_meeting_booked", "notes_next_activity_date"],
        inputs: idsDeContactos.slice(i, i + 100).map((id) => ({ id })),
      },
    });
    for (const f of data?.results ?? []) contactos.set(f.id, f.properties);
  }

  let sinEmpresa = 0;
  const conEmpresa: NotaDeLlegada[] = [];
  for (const n of delTest) {
    if (esDePrueba({ contacto: n.nota.contacto, email: n.nota.email, dominio: n.nota.dominio })) continue;
    const contactoId = contactosDe.get(n.id)?.[0] ?? null;
    const companyId = empresasDe.get(n.id)?.[0] ?? (contactoId ? contactos.get(contactoId)?.associatedcompanyid : null) ?? null;
    if (!companyId) {
      sinEmpresa++;
      continue;
    }
    conEmpresa.push({ ts: n.ts, companyId, contactoId, nota: n.nota });
  }

  const agrupadas = agruparLlegadas(conEmpresa);
  const fichas = new Map<string, { nombre: string; dominio: string | null }>();
  const idsDeEmpresas = agrupadas.map((l) => l.companyId);
  for (let i = 0; i < idsDeEmpresas.length; i += 100) {
    const data = await pedirAHubspot<{ results?: FilaDeEmpresa[] }>({
      method: "POST",
      path: "/crm/v3/objects/companies/batch/read",
      body: { properties: ["name", "domain"], inputs: idsDeEmpresas.slice(i, i + 100).map((id) => ({ id })) },
    });
    for (const e of data?.results ?? []) {
      fichas.set(e.id, { nombre: e.properties.name?.trim() || e.properties.domain || "", dominio: e.properties.domain || null });
    }
  }

  const llegadas: LlegadaPorElTest[] = [];
  for (const l of agrupadas) {
    const ficha = fichas.get(l.companyId);
    // Sin ficha: la empresa se borró en HubSpot (como las pruebas que se limpiaron a mano).
    if (!ficha?.nombre) continue;
    if (esDePrueba({ empresa: ficha.nombre, dominio: ficha.dominio })) continue;
    const p = l.contactoId ? contactos.get(l.contactoId) : undefined;
    const agendada = enMs(p?.engagements_last_meeting_booked);
    const proxima = enMs(p?.notes_next_activity_date);
    llegadas.push({
      ...l,
      empresa: ficha.nombre,
      dominio: ficha.dominio,
      // Un día de holgura: el test guarda su fecha al empezar y la reunión se agenda al terminar.
      agendo: agendada !== null && agendada >= Date.parse(l.fecha) - 24 * 60 * 60 * 1000,
      proxima: proxima !== null && proxima >= ahora.getTime() ? new Date(proxima).toISOString() : null,
    });
  }
  return { llegadas, sinEmpresa };
}
