/**
 * lib/auditoria-portal/inventario.ts — QUÉ SE CONFIGURÓ EN EL PORTAL, Y QUIÉN.
 *
 * La foto del ciclo de vida dice cuántos registros hay; para una reimplementación hace falta lo
 * otro: qué workflows hay y qué hacen, qué propiedades se crearon y quién, cómo están armados los
 * pipelines y quién usa el portal. Todo sale por API con el lector de la auditoría
 * (`lecturas.ts`): lo que no se puede leer queda anotado y nunca se rellena.
 *
 * Medido el 2026-10-03 sobre el portal de Smarteam, lo que la API SÍ da y lo que NO:
 *  · Workflows (API v4, beta): todos los objetos, con disparador, acciones y fechas. NO dice quién
 *    lo creó ni cuántos registros inscribió — eso queda en «Comprobar a mano».
 *  · Propiedades: quién la creó (`createdUserId`, 174 de 198 propias de contactos) y cuándo.
 *  · Usuarios: nombre, rol y si es Super Admin. NO el último ingreso ni si está desactivado.
 *
 * Privacidad: de cada persona se guarda el nombre y el DOMINIO del correo (sirve para reconocer
 * lo que armó el partner anterior), nunca el correo entero. De los workflows se guarda qué hacen,
 * nunca el código de una acción propia (puede traer llaves).
 */
import type { LectorDeHubspot } from "./lecturas";

// ── Workflows ─────────────────────────────────────────────────────────────────

export type ObjetoDelPortal = "contactos" | "empresas" | "negocios" | "tickets" | "leads" | "otro";

const OBJETO_POR_TIPO: Record<string, ObjetoDelPortal> = {
  "0-1": "contactos",
  "0-2": "empresas",
  "0-3": "negocios",
  "0-5": "tickets",
  "0-136": "leads",
};

export const ETIQUETA_DEL_OBJETO: Record<ObjetoDelPortal, string> = {
  contactos: "Contactos",
  empresas: "Empresas",
  negocios: "Negocios",
  tickets: "Tickets",
  leads: "Leads",
  otro: "Otro objeto",
};

/**
 * Qué hace cada tipo de acción, en palabras (referencia de HubSpot «Workflow actions and enrollment
 * types», 2026-10). Las esperas no se nombran: no dicen qué hace el workflow.
 */
const ACCION: Record<string, string> = {
  "0-3": "Crea una tarea",
  "0-4": "Envía un correo",
  "0-5": "Cambia propiedades",
  "0-8": "Avisa por correo interno",
  "0-9": "Avisa en la app",
  "0-11": "Rota el propietario",
  "0-14": "Crea un registro",
  "0-15": "Pasa a otro workflow",
  "0-18": "Salesforce",
  "0-19": "Salesforce",
  "0-23": "Envía correo interno de marketing",
  "0-25085031": "Envía WhatsApp",
  "0-30": "Audiencias de anuncios",
  "0-31": "Cambia el estado de marketing",
  "0-40900952": "Envía SMS",
  "0-43347357": "Cambia suscripciones",
  "0-44475148": "Asigna la conversación",
  "0-46510720": "Inscribe en una secuencia",
  "0-4702372": "Saca de una secuencia",
  "0-61139476": "Cambia etiquetas de asociación",
  "0-61139484": "Cambia etiquetas de asociación",
  "0-73444249": "Cambia etiquetas de asociación",
  "0-63189541": "Crea asociaciones",
  "0-63809083": "Suma a una lista",
  "0-63863438": "Saca de una lista",
  "0-169425243": "Crea una nota",
  "0-18224765": "Borra el contacto",
  "0-177946906": "Enriquece el registro",
  "0-172351286": "Usa IA de HubSpot",
  "0-195318603": "Usa IA de HubSpot",
  "0-201091202": "Usa IA de HubSpot",
  "0-207702619": "Usa IA de HubSpot",
  "0-216647524": "Usa IA de HubSpot",
  "0-218870680": "Usa IA de HubSpot",
  "0-199186210": "Envía una encuesta",
  "0-219160146": "Señales de intención",
  "0-219161394": "Señales de intención",
  "0-219292676": "Agente de prospección",
  "0-217709844": "Agente de prospección",
  "0-225935194": "Valida teléfonos",
  "0-25": "Copia una propiedad",
  "0-230189361": "Envía WhatsApp",
  "1-29735591": "Envía WhatsApp (app)",
  "1-9488285": "Escribe en Google Sheets",
  "1-179507819": "Avisa por Slack",
  "1-100451": "Crea una tarea en Asana",
  "1-2825058": "Crea una tarjeta en Trello",
};
const ESPERAS = new Set(["0-1", "0-29", "0-35"]);

export interface WorkflowLeido {
  id: string;
  nombre: string;
  objeto: ObjetoDelPortal;
  encendido: boolean;
  creadoEn: string | null;
  cambiadoEn: string | null;
  /** Cuántas versiones guardó HubSpot (`revisionId`): cuánto se editó. Falta en las fotos viejas. */
  versiones?: number | null;
  /** `null` = no se pudo leer el detalle (solo se sabe lo de la lista). */
  detalle: {
    disparador: "evento" | "criterios" | "manual" | "otro";
    acciones: number;
    ramas: number;
    /** Qué hace, sin repetir y en el orden en que aparece (sin las esperas). */
    queHace: string[];
    /** Propiedades que escribe (cambiar, copiar o rotar), por su nombre interno. */
    escribe: string[];
    cambiaEtapa: boolean;
    conCodigo: boolean;
    conWebhook: boolean;
    // Lo de abajo se lee desde el 2026-10-04: las fotos anteriores no lo traen (por eso opcional).
    /** Qué lo dispara: propiedades de los filtros, etapas de pipeline (ids), formularios, eventos y listas. */
    disparadoPor?: { propiedades: string[]; etapas: string[]; formularios: number; eventos: number; listas: number };
    /** Vuelve a inscribir un registro que ya pasó por él. */
    reinscribe?: boolean;
    /** Ids de los workflows a los que pasa el registro («Pasa a otro workflow»). */
    pasaA?: string[];
    /** Ids de usuario a los que avisa (correo interno o aviso en la app). */
    avisaA?: string[];
    /** Ids de usuario entre los que rota el propietario. */
    rotaEntre?: string[];
    /** Ids de etapa de pipeline que pone (al cambiar la etapa o al crear el registro). */
    poneEtapas?: string[];
    /** Etapas del ciclo de vida que pone (valor interno: `customer`, `lead`…). */
    poneCicloDeVida?: string[];
    /** Objetos que crea. */
    creaObjetos?: ObjetoDelPortal[];
    /** Tiene una meta (el registro sale cuando la cumple). */
    conMeta?: boolean;
    /** Dominios a los que llama por webhook (solo el dominio: la dirección completa puede traer llaves). */
    webhookDominios?: string[];
  } | null;
}

type Filtro = { property?: unknown; operation?: { values?: unknown[] } };
type Rama = { filters?: Filtro[]; filterBranches?: Rama[]; eventTypeId?: unknown };
type AccionCruda = {
  type?: string;
  actionTypeId?: string;
  fields?: Record<string, unknown>;
  webhookUrl?: unknown;
  url?: unknown;
};

interface FlujoCrudo {
  id?: string | number;
  name?: string;
  objectTypeId?: string;
  isEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  revisionId?: string | number;
  enrollmentCriteria?: {
    type?: string;
    shouldReEnroll?: boolean;
    listFilterBranch?: Rama | null;
    reEnrollmentTriggersFilterBranches?: Rama[] | null;
    eventFilterBranches?: Rama[] | null;
    listMembershipFilterBranches?: Rama[] | null;
  } | null;
  goalFilterBranch?: unknown;
  actions?: AccionCruda[];
}

const DISPARADOR: Record<string, "evento" | "criterios" | "manual"> = {
  EVENT_BASED: "evento",
  LIST_BASED: "criterios",
  MANUAL: "manual",
};

/** Las propiedades que guardan la etapa de un pipeline (negocios y tickets). */
export const PROPIEDADES_DE_ETAPA: ReadonlySet<string> = new Set(["dealstage", "hs_pipeline_stage"]);

/** Busca solo en las claves propias: lo que llega de HubSpot no puede caer en el prototipo («constructor»). */
function propio<V>(mapa: Record<string, V>, clave: string): V | undefined {
  return Object.hasOwn(mapa, clave) ? mapa[clave] : undefined;
}

const texto = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const sumar = (lista: string[], v: string) => {
  if (v && !lista.includes(v)) lista.push(v);
};

/** Los filtros de una rama y de sus ramas hijas (hasta 4 niveles: más hondo no lo arma HubSpot). */
function filtrosDe(rama: Rama | null | undefined, salida: Filtro[] = [], prof = 0): Filtro[] {
  if (!rama || prof > 4) return salida;
  for (const f of rama.filters ?? []) salida.push(f);
  for (const r of rama.filterBranches ?? []) filtrosDe(r, salida, prof + 1);
  return salida;
}

function dominio(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Lo que dice un workflow, en palabras. PURO. */
export function resumirWorkflow(f: FlujoCrudo, conDetalle: boolean): WorkflowLeido {
  const revision = Number(f.revisionId);
  const base = {
    id: String(f.id ?? ""),
    nombre: String(f.name ?? "(sin nombre)"),
    objeto: propio(OBJETO_POR_TIPO, String(f.objectTypeId ?? "")) ?? "otro",
    encendido: f.isEnabled === true,
    creadoEn: f.createdAt ?? null,
    cambiadoEn: f.updatedAt ?? null,
    versiones: f.revisionId != null && Number.isFinite(revision) ? revision : null,
  };
  if (!conDetalle || !Array.isArray(f.actions)) return { ...base, detalle: null };

  const queHace: string[] = [];
  const escribe: string[] = [];
  const pasaA: string[] = [];
  const avisaA: string[] = [];
  const rotaEntre: string[] = [];
  const poneEtapas: string[] = [];
  const poneCicloDeVida: string[] = [];
  const creaObjetos: ObjetoDelPortal[] = [];
  const webhookDominios: string[] = [];
  let ramas = 0;
  let conCodigo = false;
  let conWebhook = false;
  const valorFijo = (v: unknown) => texto((v as { staticValue?: unknown } | null)?.staticValue);
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(texto) : []);
  for (const a of f.actions) {
    const tipo = String(a.type ?? "");
    if (tipo.endsWith("_BRANCH")) ramas++;
    if (tipo === "CUSTOM_CODE") conCodigo = true;
    if (tipo === "WEBHOOK") {
      conWebhook = true;
      sumar(webhookDominios, dominio(a.webhookUrl ?? a.url ?? a.fields?.webhookUrl ?? a.fields?.url));
    }
    const id = String(a.actionTypeId ?? "");
    if (!id || ESPERAS.has(id)) continue;
    const etiqueta = propio(ACCION, id) ?? (id.startsWith("1-") ? "Usa una app externa" : "Otra acción");
    if (!queHace.includes(etiqueta)) queHace.push(etiqueta);
    const campos = a.fields ?? {};
    if (id === "0-5") {
      const prop = texto(campos.property_name);
      sumar(escribe, prop);
      if (PROPIEDADES_DE_ETAPA.has(prop)) sumar(poneEtapas, valorFijo(campos.value));
      if (prop === "lifecyclestage") sumar(poneCicloDeVida, valorFijo(campos.value));
    }
    if (id === "0-25") sumar(escribe, texto(campos.target_property));
    if (id === "0-11") {
      sumar(escribe, texto(campos.target_property) || "hubspot_owner_id");
      for (const u of ids(campos.user_ids)) sumar(rotaEntre, u);
    }
    if (id === "0-8" || id === "0-9") for (const u of ids(campos.user_ids)) sumar(avisaA, u);
    if (id === "0-15") sumar(pasaA, texto(campos.flow_id));
    if (id === "0-14") {
      const objeto = propio(OBJETO_POR_TIPO, texto(campos.object_type_id));
      if (objeto && !creaObjetos.includes(objeto)) creaObjetos.push(objeto);
      const props = Array.isArray(campos.properties) ? (campos.properties as Array<{ targetProperty?: unknown; value?: unknown }>) : [];
      for (const p of props) if (PROPIEDADES_DE_ETAPA.has(texto(p.targetProperty))) sumar(poneEtapas, valorFijo(p.value));
    }
  }
  if (conCodigo && !queHace.includes("Corre código propio")) queHace.push("Corre código propio");
  if (conWebhook && !queHace.includes("Llama a un webhook")) queHace.push("Llama a un webhook");

  // Qué lo dispara: los filtros de inscripción y de reinscripción (propiedades del registro), los
  // eventos (un formulario es un evento con el filtro hs_form_id) y la pertenencia a listas.
  const ec = f.enrollmentCriteria ?? {};
  const filtros = [...filtrosDe(ec.listFilterBranch), ...(ec.reEnrollmentTriggersFilterBranches ?? []).flatMap((r) => filtrosDe(r))];
  const propiedades: string[] = [];
  const etapas: string[] = [];
  for (const fi of filtros) {
    const prop = texto(fi.property);
    sumar(propiedades, prop);
    if (PROPIEDADES_DE_ETAPA.has(prop)) for (const v of fi.operation?.values ?? []) sumar(etapas, texto(v));
  }
  const eventos = ec.eventFilterBranches ?? [];
  const formularios = eventos.filter((r) => filtrosDe(r).some((fi) => texto(fi.property) === "hs_form_id")).length;

  return {
    ...base,
    detalle: {
      disparador: propio(DISPARADOR, String(ec.type ?? "")) ?? "otro",
      acciones: f.actions.length,
      ramas,
      queHace,
      escribe,
      cambiaEtapa: escribe.includes("lifecyclestage"),
      conCodigo,
      conWebhook,
      disparadoPor: { propiedades, etapas, formularios, eventos: eventos.length, listas: (ec.listMembershipFilterBranches ?? []).length },
      reinscribe: ec.shouldReEnroll === true,
      pasaA,
      avisaA,
      rotaEntre,
      poneEtapas,
      poneCicloDeVida,
      creaObjetos,
      conMeta: !!f.goalFilterBranch,
      webhookDominios,
    },
  };
}

// ── Personas ──────────────────────────────────────────────────────────────────

export interface PersonaDelPortal {
  /** Id de usuario de HubSpot (el que aparece como creador de una propiedad). */
  usuarioId: string;
  nombre: string;
  /** El dominio del correo, nunca el correo entero. */
  dominio: string | null;
  activo: boolean;
  superAdmin: boolean;
}

export function dominioDe(email: unknown): string | null {
  if (typeof email !== "string" || !email.includes("@")) return null;
  return email.split("@").pop()!.trim().toLowerCase() || null;
}

const nombreDe = (p: { firstName?: string; lastName?: string }, respaldo: string) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || respaldo;

// ── Propiedades ───────────────────────────────────────────────────────────────

export type ObjetoConPropiedades = "contactos" | "empresas" | "negocios" | "tickets";

export interface PropiedadPropia {
  nombre: string;
  etiqueta: string;
  objeto: ObjetoConPropiedades;
  tipo: string;
  grupo: string;
  calculada: boolean;
  creadaEn: string | null;
  /** Quién la creó, si HubSpot lo registra. */
  creadorId: string | null;
}

export interface PropiedadesDelObjeto {
  objeto: ObjetoConPropiedades;
  total: number;
  propias: number;
}

// ── El inventario completo ────────────────────────────────────────────────────

export interface EtapaLeida {
  id: string;
  nombre: string;
  /** Probabilidad de cierre que el portal le pone (solo negocios), de 0 a 100. */
  probabilidad: number | null;
  /** Cierra el registro (ganado, perdido, ticket cerrado). */
  cerrada: boolean;
  /** Registros en esta etapa. `null` = no se contó (o no se pudo). */
  registros: number | null;
}

export interface PipelineLeido {
  objeto: "negocios" | "tickets";
  id: string;
  nombre: string;
  etapas: EtapaLeida[];
  /** `null` = no se pudo contar. */
  registros: number | null;
  /** Registros en etapas abiertas. Falta en las fotos de antes del 2026-10-04. */
  abiertos?: number | null;
  /** Abiertos sin ninguna actividad registrada (nota, llamada, correo, reunión) en 90 días. */
  sinActividad?: number | null;
  /** Abiertos sin ningún cambio en 90 días (una automatización que los toca los saca de acá). */
  sinCambios?: number | null;
  creadoEn?: string | null;
  cambiadoEn?: string | null;
}

/** Las etapas de una foto de antes del 2026-10-04 eran solo nombres: se leen con lo que se sabe. */
export function normalizarPipeline(p: PipelineLeido): PipelineLeido {
  const etapas = (p.etapas as unknown[]).map((e): EtapaLeida => {
    if (typeof e === "string") return { id: "", nombre: e, probabilidad: null, cerrada: false, registros: null };
    const o = (e ?? {}) as Partial<EtapaLeida>;
    return { id: String(o.id ?? ""), nombre: String(o.nombre ?? ""), probabilidad: o.probabilidad ?? null, cerrada: o.cerrada === true, registros: o.registros ?? null };
  });
  return { ...p, etapas };
}

/** Los días que se miran hacia atrás para «sin actividad» y «sin cambios». */
export const DIAS_SIN_MOVIMIENTO = 90;

export interface InventarioDelPortal {
  /** `null` = no se pudo leer la lista. */
  workflows: WorkflowLeido[] | null;
  propiedades: { porObjeto: PropiedadesDelObjeto[]; propias: PropiedadPropia[] } | null;
  pipelines: PipelineLeido[] | null;
  personas: PersonaDelPortal[] | null;
  /** `null` = no se pudieron leer los equipos (suele faltar el permiso). */
  equipos: { nombre: string; miembros: number }[] | null;
  objetosPersonalizados: string[] | null;
}

const OBJETOS_API: Record<ObjetoConPropiedades, string> = {
  contactos: "contacts",
  empresas: "companies",
  negocios: "deals",
  tickets: "tickets",
};

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function leerWorkflows(lector: LectorDeHubspot): Promise<WorkflowLeido[] | null> {
  const lista: FlujoCrudo[] = [];
  let despues: string | null = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const ruta: string = `/automation/v4/flows?limit=100${despues ? `&after=${encodeURIComponent(despues)}` : ""}`;
    const r = await lector.leer<{ results?: FlujoCrudo[]; paging?: { next?: { after?: string } } }>(
      "workflows",
      pagina === 0 ? "La lista de workflows del portal" : `La lista de workflows (página ${pagina + 1})`,
      ruta,
    );
    if (!r) return pagina === 0 ? null : lista.map((f) => resumirWorkflow(f, false));
    lista.push(...(r.results ?? []));
    despues = r.paging?.next?.after ?? null;
    if (!despues) break;
  }

  // El detalle (disparador y acciones) por lotes. Si un lote falla, esos workflows quedan con lo de
  // la lista y el lote anotado: nunca se inventa qué hace un workflow.
  const detalles = new Map<string, FlujoCrudo>();
  const LOTE = 25;
  for (let i = 0; i < lista.length; i += LOTE) {
    const ids = lista.slice(i, i + LOTE).map((f) => String(f.id ?? ""));
    const r = await lector.leerPorLote<{ results?: FlujoCrudo[] }>(
      "workflows",
      `El detalle de los workflows ${i + 1} a ${i + ids.length}`,
      "/automation/v4/flows/batch/read",
      { inputs: ids.map((flowId) => ({ flowId, type: "FLOW_ID" })) },
    );
    for (const f of r?.results ?? []) detalles.set(String(f.id ?? ""), f);
    await esperar(200);
  }
  return lista.map((f) => {
    const d = detalles.get(String(f.id ?? ""));
    return resumirWorkflow(d ? { ...f, ...d } : f, !!d);
  });
}

async function leerPropiedades(lector: LectorDeHubspot): Promise<InventarioDelPortal["propiedades"]> {
  const porObjeto: PropiedadesDelObjeto[] = [];
  const propias: PropiedadPropia[] = [];
  let algunaLeida = false;
  for (const objeto of Object.keys(OBJETOS_API) as ObjetoConPropiedades[]) {
    const r = await lector.leer<{
      results?: Array<{
        name?: string;
        label?: string;
        type?: string;
        fieldType?: string;
        groupName?: string;
        hubspotDefined?: boolean;
        calculated?: boolean;
        createdAt?: string;
        createdUserId?: string | number;
      }>;
    }>("propiedades", `Las propiedades de ${objeto}`, `/crm/v3/properties/${OBJETOS_API[objeto]}`);
    if (!r) continue;
    algunaLeida = true;
    const todas = r.results ?? [];
    const delPortal = todas.filter((p) => !p.hubspotDefined);
    porObjeto.push({ objeto, total: todas.length, propias: delPortal.length });
    for (const p of delPortal) {
      propias.push({
        nombre: String(p.name ?? ""),
        etiqueta: String(p.label ?? p.name ?? ""),
        objeto,
        tipo: String(p.fieldType ?? p.type ?? ""),
        grupo: String(p.groupName ?? ""),
        calculada: p.calculated === true,
        creadaEn: p.createdAt ?? null,
        creadorId: p.createdUserId != null && String(p.createdUserId) !== "" ? String(p.createdUserId) : null,
      });
    }
  }
  return algunaLeida ? { porObjeto, propias } : null;
}

type EtapaCruda = { id?: string; label?: string; displayOrder?: number; archived?: boolean; metadata?: { probability?: string | number; isClosed?: string | boolean; ticketState?: string } };

/** Una etapa como la da la API → la de la auditoría. PURO. */
export function leerEtapa(s: EtapaCruda): EtapaLeida {
  const p = Number(s.metadata?.probability);
  return {
    id: String(s.id ?? ""),
    nombre: String(s.label ?? s.id ?? ""),
    probabilidad: s.metadata?.probability != null && Number.isFinite(p) ? Math.round(p * 100) : null,
    cerrada: String(s.metadata?.isClosed) === "true" || s.metadata?.ticketState === "CLOSED",
    registros: null,
  };
}

async function leerPipelines(lector: LectorDeHubspot, hoy: Date): Promise<PipelineLeido[] | null> {
  const salida: PipelineLeido[] = [];
  let algunaLeida = false;
  const hace90 = String(hoy.getTime() - DIAS_SIN_MOVIMIENTO * 24 * 60 * 60 * 1000);
  for (const [objeto, api] of [["negocios", "deals"], ["tickets", "tickets"]] as const) {
    const r = await lector.leer<{
      results?: Array<{ id?: string; label?: string; createdAt?: string; updatedAt?: string; stages?: EtapaCruda[] }>;
    }>("pipelines", `Los pipelines de ${objeto}`, `/crm/v3/pipelines/${api}`);
    if (!r) continue;
    algunaLeida = true;
    const propPipeline = api === "deals" ? "pipeline" : "hs_pipeline";
    const propEtapa = api === "deals" ? "dealstage" : "hs_pipeline_stage";
    for (const p of r.results ?? []) {
      const id = String(p.id ?? "");
      const nombre = String(p.label ?? id);
      const etapas = [...(p.stages ?? [])]
        .filter((s) => s.archived !== true)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map(leerEtapa);
      const registros = await lector.contar("pipelines", `Los ${objeto} del pipeline «${nombre}»`, {
        objeto: api,
        filterGroups: [{ filters: [{ propertyName: propPipeline, operator: "EQ", value: id }] }],
      });
      // Por etapa, solo si el pipeline tiene registros (con cero, todas son cero: no hace falta preguntar).
      let abiertos: number | null = registros === 0 ? 0 : null;
      let sinActividad: number | null = registros === 0 ? 0 : null;
      let sinCambios: number | null = registros === 0 ? 0 : null;
      if (registros) {
        for (const e of etapas) {
          await esperar(120);
          e.registros = await lector.contar("pipelines", `Los ${objeto} en «${e.nombre}» (${nombre})`, {
            objeto: api,
            filterGroups: [{ filters: [{ propertyName: propEtapa, operator: "EQ", value: e.id }] }],
          });
        }
        const abiertas = etapas.filter((e) => !e.cerrada);
        abiertos = abiertas.every((e) => e.registros !== null) ? abiertas.reduce((s, e) => s + (e.registros ?? 0), 0) : null;
        if (abiertas.length && abiertos) {
          const enAbiertas = { propertyName: propEtapa, operator: "IN", values: abiertas.map((e) => e.id) };
          await esperar(120);
          // Sin actividad = la última nota, llamada, correo o reunión es de hace más de 90 días, o no hay.
          sinActividad = await lector.contar("pipelines", `Los ${objeto} abiertos sin actividad en 90 días (${nombre})`, {
            objeto: api,
            filterGroups: [
              { filters: [enAbiertas, { propertyName: "notes_last_updated", operator: "LT", value: hace90 }] },
              { filters: [enAbiertas, { propertyName: "notes_last_updated", operator: "NOT_HAS_PROPERTY" }] },
            ],
          });
          await esperar(120);
          sinCambios = await lector.contar("pipelines", `Los ${objeto} abiertos sin cambios en 90 días (${nombre})`, {
            objeto: api,
            filterGroups: [{ filters: [enAbiertas, { propertyName: "hs_lastmodifieddate", operator: "LT", value: hace90 }] }],
          });
        } else if (abiertos === 0) {
          sinActividad = 0;
          sinCambios = 0;
        }
      }
      salida.push({ objeto, id, nombre, etapas, registros, abiertos, sinActividad, sinCambios, creadoEn: p.createdAt ?? null, cambiadoEn: p.updatedAt ?? null });
      await esperar(150);
    }
  }
  return algunaLeida ? salida : null;
}

async function leerPersonas(lector: LectorDeHubspot): Promise<PersonaDelPortal[] | null> {
  const r = await lector.leer<{ results?: Array<{ id?: string | number; email?: string; firstName?: string; lastName?: string; superAdmin?: boolean }> }>(
    "usuarios",
    "Los usuarios del portal",
    "/settings/v3/users?limit=100",
  );
  if (!r) return null;
  const personas = new Map<string, PersonaDelPortal>();
  for (const u of r.results ?? []) {
    const id = String(u.id ?? "");
    if (!id) continue;
    personas.set(id, {
      usuarioId: id,
      nombre: nombreDe(u, `Usuario ${id}`),
      dominio: dominioDe(u.email),
      activo: true,
      superAdmin: u.superAdmin === true,
    });
  }
  // Los propietarios archivados dicen el nombre de quien ya no tiene usuario: así una propiedad
  // creada por alguien que se fue (el partner anterior, casi siempre) muestra quién fue.
  const archivados = await lector.leer<{ results?: Array<{ userIdIncludingInactive?: number | string; firstName?: string; lastName?: string; email?: string }> }>(
    "usuarios",
    "Los propietarios que ya no están",
    "/crm/v3/owners?limit=500&archived=true",
  );
  for (const o of archivados?.results ?? []) {
    const id = o.userIdIncludingInactive != null ? String(o.userIdIncludingInactive) : "";
    if (!id || personas.has(id)) continue;
    personas.set(id, { usuarioId: id, nombre: nombreDe(o, `Usuario ${id}`), dominio: dominioDe(o.email), activo: false, superAdmin: false });
  }
  return [...personas.values()];
}

async function leerEquipos(lector: LectorDeHubspot): Promise<InventarioDelPortal["equipos"]> {
  const r = await lector.leer<{ results?: Array<{ name?: string; userIds?: unknown[]; secondaryUserIds?: unknown[] }> }>(
    "usuarios",
    "Los equipos del portal",
    "/settings/v3/users/teams",
  );
  if (!r) return null;
  return (r.results ?? []).map((t) => ({ nombre: String(t.name ?? ""), miembros: (t.userIds?.length ?? 0) + (t.secondaryUserIds?.length ?? 0) }));
}

async function leerObjetos(lector: LectorDeHubspot): Promise<string[] | null> {
  const r = await lector.leer<{ results?: Array<{ labels?: { plural?: string }; name?: string }> }>(
    "objetos",
    "Los objetos personalizados",
    "/crm/v3/schemas",
  );
  if (!r) return null;
  return (r.results ?? []).map((s) => String(s.labels?.plural ?? s.name ?? ""));
}

/** Lee todo el inventario, en serie y con pausas cortas (el cupo de HubSpot es del cliente). */
export async function leerInventario(lector: LectorDeHubspot, hoy = new Date()): Promise<InventarioDelPortal> {
  const workflows = await leerWorkflows(lector);
  const propiedades = await leerPropiedades(lector);
  const pipelines = await leerPipelines(lector, hoy);
  const personas = await leerPersonas(lector);
  const equipos = await leerEquipos(lector);
  const objetosPersonalizados = await leerObjetos(lector);
  return { workflows, propiedades, pipelines, personas, equipos, objetosPersonalizados };
}

// ── Lecturas derivadas (puras): las usan la pantalla y el análisis ────────────

/** Quién creó cada propiedad, cruzado con las personas: activo, ya no está o sin registro. */
export function creadoresDePropiedades(
  propias: PropiedadPropia[],
  personas: PersonaDelPortal[] | null,
): { conCreador: number; sinCreador: number; deQuienesYaNoEstan: number; porPersona: Array<{ nombre: string; dominio: string | null; activo: boolean; propiedades: number }> } {
  const porId = new Map((personas ?? []).map((p) => [p.usuarioId, p]));
  const cuenta = new Map<string, { nombre: string; dominio: string | null; activo: boolean; propiedades: number }>();
  let conCreador = 0;
  let sinCreador = 0;
  let deQuienesYaNoEstan = 0;
  for (const p of propias) {
    if (!p.creadorId) {
      sinCreador++;
      continue;
    }
    conCreador++;
    const persona = porId.get(p.creadorId);
    const activo = persona ? persona.activo : false;
    if (!activo) deQuienesYaNoEstan++;
    const clave = persona ? persona.usuarioId : `?${p.creadorId}`;
    const fila = cuenta.get(clave) ?? {
      nombre: persona?.nombre ?? `Usuario ${p.creadorId} (sin datos)`,
      dominio: persona?.dominio ?? null,
      activo,
      propiedades: 0,
    };
    fila.propiedades++;
    cuenta.set(clave, fila);
  }
  return {
    conCreador,
    sinCreador,
    deQuienesYaNoEstan,
    porPersona: [...cuenta.values()].sort((a, b) => b.propiedades - a.propiedades),
  };
}

/** Un workflow sin cambios hace más de un año (contado desde `hoy`). */
export function sinCambiosHaceUnAnio(w: WorkflowLeido, hoy: Date): boolean {
  if (!w.cambiadoEn) return false;
  const t = new Date(w.cambiadoEn).getTime();
  return Number.isFinite(t) && hoy.getTime() - t > 365 * 24 * 60 * 60 * 1000;
}

/**
 * Propiedades que escriben dos o más workflows ENCENDIDOS: el último que corre decide el valor. La
 * usan la pantalla y el análisis, así cuentan lo mismo.
 */
export function propiedadesEnChoque(workflows: WorkflowLeido[]): { propiedad: string; workflows: string[] }[] {
  const por = new Map<string, string[]>();
  for (const w of workflows) {
    if (!w.encendido || !w.detalle) continue;
    for (const p of new Set(w.detalle.escribe)) por.set(p, [...(por.get(p) ?? []), w.id]);
  }
  return [...por.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([propiedad, ids]) => ({ propiedad, workflows: ids }))
    .sort((a, b) => b.workflows.length - a.workflows.length || a.propiedad.localeCompare(b.propiedad));
}

/** Los dominios de correo con acceso al portal: ahí se ve si la agencia anterior sigue adentro. */
export function dominiosConAcceso(
  personas: PersonaDelPortal[],
): { dominio: string; activos: number; superAdmins: number; inactivos: number }[] {
  const por = new Map<string, { dominio: string; activos: number; superAdmins: number; inactivos: number }>();
  for (const p of personas) {
    const d = p.dominio ?? "sin dominio";
    const fila = por.get(d) ?? { dominio: d, activos: 0, superAdmins: 0, inactivos: 0 };
    if (p.activo) {
      fila.activos++;
      if (p.superAdmin) fila.superAdmins++;
    } else fila.inactivos++;
    por.set(d, fila);
  }
  return [...por.values()].sort((a, b) => b.activos - a.activos || b.inactivos - a.inactivos || a.dominio.localeCompare(b.dominio));
}
