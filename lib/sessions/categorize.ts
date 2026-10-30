/**
 * lib/sessions/categorize.ts
 *
 * Función pura que clasifica una sesión (Google Meet / Fireflies) en uno de
 * varios "grupos" para mostrarla en la sidebar:
 *
 *   - client          → Client de Nexus (matching por dominio o título)
 *   - hubspotCompany  → Empresa del portal HubSpot Smarteam que no es Client
 *   - category        → Categoría administrable (interna, partners, etc.)
 *   - orphan          → Sin clasificar (dominio externo no identificado o sin externos)
 *
 * La cascada de matching es DETERMINISTA y prioriza así:
 *   1. Manual override (manualClientId) — el consultor asignó manualmente
 *   2. Sesión 100% interna → primera categoría con kind="internal"
 *   3. Email-domain match con Client.emailDomains
 *   4. Email-domain match con SessionCategory.domains (excluyendo internal — ya cubiertas)
 *   5. Dominio externo → empresa HubSpot → Client ligado (Client.hubspotCompanyId).
 *      Si la company NO está ligada: bucket "hubspotCompany" SOLO en display
 *      (groupUnlinkedHubspotCompany); en materialización/ownership cae al título (aditivo).
 *   6. Title-word match con Client.name/company (fallback débil, ≥4 chars, sin stopwords)
 *   7. Orphan
 *
 * ⚠ Entidades que comparten dominio (el TEC: AE y TAE, 2026-10-29). Cuando el paso 3 o el 5 da una
 * ficha de un grupo que comparte dominio (`Client.comparteDominioConId`), la reunión se reparte
 * entre la dueña y sus entidades: primero por el nombre de la reunión, después por la gente de
 * cada una, y sin pista queda POR DECIDIR (orphan → `resolvedClientId` null), nunca en la ficha
 * más vieja. Ver `decidirEntreEntidades` y DECISIONS «Dos fichas que comparten dominio».
 */

import type { Client, SessionCategory } from "@prisma/client";
import type { HubspotCompanyLite } from "@/lib/hubspot/companies";
import { esDominioDeCalendario } from "./dominio-propio";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SessionGroup =
  | { kind: "client"; id: string; label: string; company?: string | null }
  | { kind: "hubspotCompany"; id: string; label: string; domain: string }
  | { kind: "category"; id: string; label: string; categoryKind: string; color?: string | null }
  | { kind: "orphan"; label: string; domain?: string };

export interface CategorizeContext {
  /**
   * ⚠ En el orden de `ORDEN_DE_CLIENTES_PARA_ATRIBUIR` (abajo): el primero gana.
   * `comparteDominioConId`: la ficha dueña del dominio, si esta es una entidad que lo comparte (ver arriba).
   */
  clients: (Pick<Client, "id" | "name" | "company" | "emailDomains"> & {
    siglas?: string[] | null;
    comparteDominioConId?: string | null;
  })[];
  categories: Pick<SessionCategory, "id" | "name" | "slug" | "domains" | "kind" | "color">[];
  hubspotCompaniesByDomain: Map<string, HubspotCompanyLite>;
  /** Dominios marcados como "internos" en categorías kind=internal (set para lookup O(1)) */
  internalDomains: Set<string>;
  /**
   * Map HubSpot companyId → Client de Nexus ligado (vía Client.hubspotCompanyId).
   * Habilita el paso 5 dominio→empresa-HubSpot→Client (señal fuerte, antes del
   * título). Opcional: si falta, el paso 5 degrada a "hubspotCompany"/título.
   */
  clientsByHubspotCompanyId?: Map<string, Pick<Client, "id" | "name" | "company">>;
  /**
   * Si true, una company de HubSpot NO ligada a un Client se agrupa como "hubspotCompany"
   * (display de /sessions). Si false/undefined (materialización/ownership), NO corta: cae
   * al título — aditivo, para no perder clientes con dominio real no registrado en el Client.
   */
  groupUnlinkedHubspotCompany?: boolean;
  /**
   * Tokens que aparecen en el nombre de 2+ clientes (ej. "grupo") → se ignoran en el
   * title-match para que no sean catch-all. Computar con `computeAmbiguousNameTokens`.
   * Opcional: si falta, no se filtra ninguno (comportamiento previo).
   */
  ambiguousNameTokens?: Set<string>;
  /**
   * La gente de cada entidad que comparte dominio: correo (en minúsculas) → la ficha. Sale de
   * `aprenderPersonasDeEntidades` y solo trae a quien estuvo en reuniones de UNA sola entidad.
   * Opcional: sin él, una reunión cuyo nombre no dice la entidad queda por decidir.
   */
  personasDeEntidades?: Map<string, string>;
}

export interface CategorizableSession {
  participants: string[];
  manualClientId: string | null;
  title: string;
}

/**
 * El ORDEN en que la cascada recorre los clientes, y es load-bearing: el paso por dominio se queda
 * con el PRIMERO que lo tenga. Sin orden, Postgres devuelve las filas como le conviene y dos clientes
 * con el mismo dominio se reparten las reuniones al azar entre corridas — caso medido el
 * 2026-10-02: «Club de Amantes del Vino» quedó duplicado con `lacav.cl` (el alta de «CAV -
 * Optimización comercial» creó un segundo registro). Gana el más antiguo, que es el que tiene la
 * historia; el duplicado se FUSIONA aparte (`scripts/merge-duplicate-clients.ts`) — el orden solo
 * garantiza que la elección no cambie de una corrida a otra.
 * ⚠ Todo lugar que arme un `CategorizeContext` usa este orden (lo vigila `categorize.test.ts`).
 */
export const ORDEN_DE_CLIENTES_PARA_ATRIBUIR = [{ createdAt: "asc" as const }, { id: "asc" as const }];

// ── Helpers ───────────────────────────────────────────────────────────────────

import { clientePorTitulo, tokensDelCliente } from "./match-por-titulo";

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Extrae los dominios de los emails de participantes.
 * Devuelve un Set para lookup O(1).
 *
 * ⚠ Los CALENDARIOS y las SALAS de Google quedan afuera (`esDominioDeCalendario`): Google los
 * mete en la lista de invitados como si fueran personas, y acá abajo cualquier dominio que no sea
 * propio se lee como "una empresa de afuera". Sin este filtro, "[Interno] Daily Stand Up" deja de
 * ser interna porque la organizó un calendario compartido — 158 reuniones nuestras medidas así el
 * 2026-08-15.
 */
export function extractParticipantDomains(participants: string[]): Set<string> {
  return new Set(
    participants
      .map((email) => email?.split("@")[1]?.toLowerCase())
      .filter((d): d is string => !!d && !esDominioDeCalendario(d))
  );
}

/**
 * Construye el Set de dominios internos desde las SessionCategory kind="internal".
 */
export function buildInternalDomainsSet(
  categories: Pick<SessionCategory, "domains" | "kind">[]
): Set<string> {
  const set = new Set<string>();
  for (const cat of categories) {
    if (cat.kind !== "internal") continue;
    for (const d of cat.domains) {
      set.add(d.toLowerCase());
    }
  }
  return set;
}

/**
 * Si `company` parece un dominio (con o sin protocolo), lo extrae normalizado.
 * Devuelve null si `company` es nombre legible (no dominio).
 *
 * Ejemplos:
 *   "wherex.com"           → "wherex.com"
 *   "https://wherex.com/"  → "wherex.com"
 *   "www.teamnet.com.mx"   → "teamnet.com.mx"
 *   "AMC - Atlas Mining"   → null
 */
function extractDomainFromCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  const raw = company.trim().toLowerCase();
  if (!raw) return null;
  // URL completa
  if (/^https?:\/\//.test(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  // Dominio plano: contiene punto y solo chars válidos
  const cleaned = raw.replace(/^www\./, "");
  if (/^[\w-]+(\.[\w-]+)+$/.test(cleaned)) return cleaned;
  return null;
}

/**
 * Devuelve los dominios efectivos de un cliente combinando `emailDomains`
 * (explícitos en DB) con el dominio inferido de `company` (si parece dominio).
 *
 * Esto permite reconocer clientes como "Wherex" (con `company: "wherex.com"`)
 * sin necesidad de poblar manualmente `emailDomains` para cada cliente.
 *
 * Exportada: el ingest de Cobranza (lib/cobranza/ingest.ts) la usa para armar su
 * índice dominio→cliente al deduplicar empresas importadas (patrón partner-sync).
 */
export function effectiveDomainsForClient(
  c: Pick<Client, "emailDomains" | "company">
): string[] {
  const explicit = (c.emailDomains ?? []).map((d) => d.toLowerCase());
  const fromCompany = extractDomainFromCompany(c.company);
  if (fromCompany && !explicit.includes(fromCompany)) {
    return [...explicit, fromCompany];
  }
  return explicit;
}

/** Map vacío reutilizable (evita alocar uno por llamada cuando el ctx no trae HubSpot). */
const EMPTY_CLIENT_MAP: Map<string, Pick<Client, "id" | "name" | "company">> = new Map();

/**
 * Conectores/proceso genéricos que NO son el nombre distintivo de ninguna empresa.
 * Se quitan al matchear por título (del título Y del nombre del cliente) para evitar
 * el catch-all: "para" matcheaba "Empresa para pruebas" y DISTELSA ("…Materiales para…").
 *
 * REGLA DE ORO: NUNCA agregar un token que sea parte del nombre distintivo de un
 * cliente real (ej. "smarteam", "distribuidora", "materiales", "hubspot"). Eso deja a
 * ese cliente sin resolución por título (medido: stopwordear "smarteam" tira 2342 a 0).
 * Tokens normalizados (sin acentos, lowercase) porque `normalize()` corre antes.
 */
export const TITLE_MATCH_STOPWORDS = new Set<string>([
  "para", "prueba", "pruebas", "sesion", "sesiones", "reunion", "reuniones",
  "demo", "interna", "interno", "equipo", "proyecto", "proyectos", "cierre",
  "seguimiento", "revision", "contexto", "recursos", "requerimientos", "alineacion",
  "practica", "semanal", "llamada", "meeting", "onboarding", "capacitacion",
  "soporte", "kickoff", "handoff", "taller", "avances", "status", "sync",
  "weekly", "review", "general", "nuevo", "nueva", "final", "parte",
]);

/**
 * Clientes de PRUEBA: su nombre es 100% palabras genéricas, así que matchearían
 * cualquier título. Se excluyen del match por título (el match por dominio sí los
 * reconoce). Si se crean más clientes de test, agregar el patrón acá.
 */
const TEST_CLIENT_NAME_PATTERNS: RegExp[] = [/empresa para pruebas/i, /\btest\b/i];

export function isTestClient(name: string): boolean {
  return TEST_CLIENT_NAME_PATTERNS.some((re) => re.test(name));
}

/** Set vacío reutilizable de tokens (evita alocar uno por llamada). */
const EMPTY_TOKEN_SET: Set<string> = new Set();

/**
 * Tokens (>=4 chars, no stopword) que NO discriminan: aparecen en el nombre de 2+ EMPRESAS
 * DISTINTAS (ej. "grupo" en "Grupo Servica" / "Grupo Inve"). Se ignoran en el title-match para
 * que "GRUPO PRINTER" no matchee "Grupo Servica" por "grupo"; cada cliente real sigue
 * resolviendo por su token distintivo (servica/inve) o por dominio.
 *
 * "Empresas distintas" = token-sets donde NINGUNO es subconjunto del otro. Dos registros
 * DUPLICADOS de la misma empresa (un set ⊆ el otro, ej. "Ministerio de Economía" ⊆
 * "Ministerio de Economía (MINEC)", o dos "Construtecho") NO cuentan como ambiguos — si no,
 * romperían su propia resolución por título. Se computa una vez por contexto (no por sesión).
 */
export function computeAmbiguousNameTokens(
  clients: Pick<Client, "name" | "company">[],
): Set<string> {
  const sets = clients.map((c) => {
    const s = new Set<string>();
    for (const p of normalize(c.name).split(/[\s.\-_]+/)) {
      if (p.length >= 4 && !TITLE_MATCH_STOPWORDS.has(p)) s.add(p);
    }
    if (c.company) {
      for (const p of normalize(c.company).split(/[\s.\-_]+/)) {
        if (p.length >= 4 && !TITLE_MATCH_STOPWORDS.has(p)) s.add(p);
      }
    }
    return s;
  });
  const byToken = new Map<string, number[]>();
  sets.forEach((s, i) => {
    for (const t of s) {
      const arr = byToken.get(t);
      if (arr) arr.push(i);
      else byToken.set(t, [i]);
    }
  });
  const isSubset = (a: Set<string>, b: Set<string>): boolean => {
    for (const x of a) if (!b.has(x)) return false;
    return true;
  };
  const ambiguous = new Set<string>();
  for (const [t, idxs] of byToken) {
    if (idxs.length < 2) continue;
    let distinct = false;
    outer: for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const A = sets[idxs[a]];
        const B = sets[idxs[b]];
        if (!isSubset(A, B) && !isSubset(B, A)) {
          distinct = true;
          break outer;
        }
      }
    }
    if (distinct) ambiguous.add(t);
  }
  return ambiguous;
}

/**
 * Title-matching: de quién es una reunión cuando el título es lo único que hay.
 *
 * ── QUÉ CAMBIÓ EL 2026-08-19, Y CÓMO SE DECIDIÓ ─────────────────────────────
 * Hasta hoy le alcanzaba UNA palabra del nombre del cliente y, ante varios candidatos, se
 * quedaba con el primero del array en silencio. Producía adjudicaciones como
 * «SmartAgro | Flyer + Sitio web» → ECOQUINTAS (por «sitio»), o «Demo Interna Spectrum &
 * Smarteam» → Smarteam. De acá sale QUÉ reuniones alimentan los documentos de cada cliente, así
 * que una mal puesta es contenido de un cliente entrando al papel de otro.
 *
 * La regla ahora vive en `lib/sessions/match-por-titulo.ts` (puro y testeado): gana quien nombró
 * la mayor FRACCIÓN de su propio nombre, la casa no le gana a un cliente, y ante un empate real
 * no elige ninguno — la reunión cae al grupo de internas, donde se ve y se asigna a mano.
 *
 * ⚠ NO se subió la vara a «dos palabras»: se midió y costaba 316 atribuciones correctas para
 * arreglar dos. El informe está en `docs/informe-match-por-titulo.txt` y se reproduce con
 * `npx tsx scripts/medir-match-por-titulo.ts`.
 *
 * ⛔ ESTA FUNCIÓN DECIDE EL DUEÑO DE 12.500 REUNIONES. Tocarla re-atribuye el corpus entero: no
 * se cambia sin medir antes y sin correr el re-resolve después (INV2).
 */
function findClientByTitleMatch(
  title: string,
  clients: (Pick<Client, "id" | "name" | "company"> & { siglas?: string[] | null })[],
  ambiguous: Set<string>,
  internalDomains: Set<string>,
): Pick<Client, "id" | "name" | "company"> | null {
  /* La CASA se deriva de los dominios internos (la SessionCategory kind="internal"), no de un
     nombre hardcodeado: «Cliente & Smarteam» es el formato estándar de los títulos del equipo, y
     Smarteam es un Client más en la base — nombraba su identidad entera y empataba con todos. */
  const esLaCasa = (c: { name: string; company: string | null }) =>
    effectiveDomainsForClient(c as Pick<Client, "name" | "company" | "emailDomains">).some((d) =>
      internalDomains.has(d),
    );

  const r = clientePorTitulo(title, clients, {
    modo: "mejor-fraccion",
    skip: (w) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w),
    normalize,
    esClienteDePrueba: isTestClient,
    esLaCasa,
  });
  return (r.cliente as Pick<Client, "id" | "name" | "company"> | null) ?? null;
}

// ── Entidades que comparten dominio ──────────────────────────────────────────

type ClienteDelCtx = CategorizeContext["clients"][number];

/** Por cada ficha de un grupo: la dueña y sus entidades, en el orden del ctx. Se arma una vez por lista de clientes. */
const gruposPorLista = new WeakMap<readonly ClienteDelCtx[], Map<string, ClienteDelCtx[]>>();

function gruposDeEntidades(clients: readonly ClienteDelCtx[]): Map<string, ClienteDelCtx[]> {
  const hecho = gruposPorLista.get(clients);
  if (hecho) return hecho;
  const porId = new Map(clients.map((c) => [c.id, c]));
  const entidadesDe = new Map<string, Set<string>>();
  for (const c of clients) {
    const duena = c.comparteDominioConId ? porId.get(c.comparteDominioConId) : undefined;
    /* Sin cadenas: una dueña que a su vez es entidad de otra no arma grupo (sería una regla que nadie decidió). */
    if (!duena || duena.id === c.id || duena.comparteDominioConId) continue;
    entidadesDe.set(duena.id, (entidadesDe.get(duena.id) ?? new Set()).add(c.id));
  }
  const out = new Map<string, ClienteDelCtx[]>();
  for (const [duenaId, entidades] of entidadesDe) {
    const grupo = clients.filter((c) => c.id === duenaId || entidades.has(c.id));
    for (const c of grupo) out.set(c.id, grupo);
  }
  gruposPorLista.set(clients, out);
  return out;
}

/** La dueña y sus entidades si `clientId` es parte de un grupo que comparte dominio; null si no. */
export function entidadesDelDominio(clientId: string, ctx: Pick<CategorizeContext, "clients">): ClienteDelCtx[] | null {
  return gruposDeEntidades(ctx.clients).get(clientId) ?? null;
}

export type DecisionEntreEntidades =
  | { clientId: string; por: "nombre" | "gente" }
  | { clientId: null; por: "dos-nombres" | "gente-de-varias" | "sin-pista" };

/** Los correos de la reunión que no son de la casa ni de un calendario, en minúsculas. */
function correosDeAfuera(participants: string[], internalDomains: Set<string>): string[] {
  const out = new Set<string>();
  for (const p of participants) {
    const correo = p?.trim().toLowerCase();
    const d = correo?.split("@")[1];
    if (d && !internalDomains.has(d) && !esDominioDeCalendario(d)) out.add(correo);
  }
  return [...out];
}

/**
 * De cuál de las entidades que comparten dominio es la reunión. PURO.
 *  1. El NOMBRE de la reunión: si nombra a UNA sola entidad (sus `siglas` o su nombre, con el mismo matcher del
 *     paso 6 acotado al grupo), es de esa. Si nombra a dos, por decidir: la gente no desempata un título que dice
 *     las dos cosas.
 *  2. La GENTE: si todas las personas de afuera que se conocen (`personasDeEntidades`) son de la misma entidad,
 *     es de esa. Quien estuvo en reuniones de las dos no se aprende, así que no cuenta.
 *  3. Si no, por decidir.
 * La gente de Smarteam no cuenta: lleva las dos (en el TEC, Heiver).
 */
export function decidirEntreEntidades(
  session: CategorizableSession,
  entidades: readonly ClienteDelCtx[],
  ctx: Pick<CategorizeContext, "internalDomains" | "ambiguousNameTokens" | "personasDeEntidades">,
): DecisionEntreEntidades {
  const ambiguous = ctx.ambiguousNameTokens ?? EMPTY_TOKEN_SET;
  const r = clientePorTitulo(session.title, entidades, {
    modo: "mejor-fraccion",
    skip: (w) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w),
    normalize,
    esClienteDePrueba: isTestClient,
  });
  if (r.cliente) return { clientId: r.cliente.id, por: "nombre" };
  if (r.candidatos.length > 1) return { clientId: null, por: "dos-nombres" };

  const personas = ctx.personasDeEntidades;
  if (personas && personas.size > 0) {
    const ids = new Set(entidades.map((e) => e.id));
    const de = new Set<string>();
    for (const correo of correosDeAfuera(session.participants, ctx.internalDomains)) {
      const id = personas.get(correo);
      if (id && ids.has(id)) de.add(id);
    }
    if (de.size === 1) return { clientId: [...de][0]!, por: "gente" };
    if (de.size > 1) return { clientId: null, por: "gente-de-varias" };
  }
  return { clientId: null, por: "sin-pista" };
}

/**
 * Si `clientId` (lo que dio el dominio o HubSpot) es de un grupo que comparte dominio, la reunión se reparte: la
 * entidad que decide `decidirEntreEntidades`, o POR DECIDIR (orphan, que materializa `resolvedClientId` null y queda
 * a la vista en /sessions para asignarla a mano). Null si la ficha no comparte dominio: la cascada sigue como siempre.
 */
function repartirEntreEntidades(
  clientId: string,
  session: CategorizableSession,
  externalDomains: Set<string>,
  ctx: CategorizeContext,
): SessionGroup | null {
  const entidades = entidadesDelDominio(clientId, ctx);
  if (!entidades) return null;
  const d = decidirEntreEntidades(session, entidades, ctx);
  const elegida = d.clientId ? entidades.find((e) => e.id === d.clientId) : undefined;
  if (elegida) return { kind: "client", id: elegida.id, label: elegida.name, company: elegida.company };
  const delGrupo = new Set(entidades.flatMap((e) => effectiveDomainsForClient(e)));
  const dominio = [...externalDomains].find((x) => delGrupo.has(x)) ?? [...externalDomains][0];
  return { kind: "orphan", label: `Por decidir: ${entidades.map((e) => e.name).join(" o ")}`, domain: dominio };
}

/**
 * Lo que un título tiene que traer para poder nombrar a una de estas fichas: sus siglas y las palabras de su nombre.
 * Va en minúsculas, normalizado y tal como se escribe (la consulta de la base no quita acentos).
 */
export function pistasDeTitulo(clients: readonly ClienteDelCtx[], ambiguous: Set<string> = EMPTY_TOKEN_SET): string[] {
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w);
  const out = new Set<string>();
  for (const c of clients) {
    for (const s of c.siglas ?? []) out.add(normalize(s).replace(/\s+/g, ""));
    for (const t of tokensDelCliente(c, skip, normalize).todos) out.add(t);
    for (const p of `${c.name} ${c.company ?? ""}`.toLowerCase().split(/[\s.\-_]+/)) {
      if (p.length >= 4 && !skip(normalize(p))) out.add(p);
    }
  }
  return [...out].filter((p) => p.length >= 2);
}

/**
 * La gente de cada entidad, aprendida de las reuniones que decidió una PERSONA (`manualClientId` en el grupo) o el
 * NOMBRE de la reunión. Nunca de las que decidió la gente: un error no se alimenta a sí mismo. Y nunca de lo ya
 * materializado (`resolvedClientId`): el resultado es el mismo antes y después de re-resolver, así que una corrida de
 * `resolveAllSessions` converge en una pasada. Quien aparece en reuniones de dos entidades no se aprende.
 * PURO: el caller le pasa las reuniones (resolve-client.ts carga las que traen una pista; /sessions ya las tiene todas).
 */
export function aprenderPersonasDeEntidades(
  sessions: readonly CategorizableSession[],
  ctx: CategorizeContext,
): Map<string, string> {
  const grupos = gruposDeEntidades(ctx.clients);
  if (grupos.size === 0) return new Map();
  const sinGente: CategorizeContext = { ...ctx, personasDeEntidades: undefined };
  const pistas = pistasDeTitulo(ctx.clients.filter((c) => grupos.has(c.id)), ctx.ambiguousNameTokens);
  const visto = new Map<string, Set<string>>();
  for (const s of sessions) {
    let de: string | null = null;
    if (s.manualClientId) {
      de = grupos.has(s.manualClientId) ? s.manualClientId : null;
    } else {
      /* Sin ninguna pista en el título no hay nombre que decida: se ahorra la cascada entera (es por reunión). */
      const titulo = normalize(s.title);
      if (!pistas.some((p) => titulo.includes(p))) continue;
      const g = categorizeSession(s, sinGente);
      if (g.kind === "client" && grupos.has(g.id) && decidirEntreEntidades(s, grupos.get(g.id)!, sinGente).por === "nombre") {
        de = g.id;
      }
    }
    if (!de) continue;
    for (const correo of correosDeAfuera(s.participants, ctx.internalDomains)) {
      visto.set(correo, (visto.get(correo) ?? new Set<string>()).add(de));
    }
  }
  const out = new Map<string, string>();
  for (const [correo, ids] of visto) if (ids.size === 1) out.set(correo, [...ids][0]!);
  return out;
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Categoriza una sesión según la cascada documentada arriba.
 * NUNCA retorna null — siempre cae a "orphan" en el peor caso.
 */
export function categorizeSession(
  session: CategorizableSession,
  ctx: CategorizeContext
): SessionGroup {
  const { clients, categories, hubspotCompaniesByDomain, internalDomains } = ctx;
  const ambiguous = ctx.ambiguousNameTokens ?? EMPTY_TOKEN_SET;

  // ── 1. Manual override ─────────────────────────────────────────────────────
  if (session.manualClientId) {
    const c = clients.find((cl) => cl.id === session.manualClientId);
    if (c) {
      return { kind: "client", id: c.id, label: c.name, company: c.company };
    }
    // Si manualClientId no resuelve (cliente eliminado), seguimos con la cascada
  }

  // ── Preparación común ──────────────────────────────────────────────────────
  const participantDomains = extractParticipantDomains(session.participants);
  const externalDomains = new Set(
    [...participantDomains].filter((d) => !internalDomains.has(d))
  );

  // ── 2. Sesión 100% interna ─────────────────────────────────────────────────
  // Antes de clasificar como "internal", intentar matchear por título contra
  // clientes: una sesión interna cuyo título contiene el nombre del cliente
  // (ej. "Hand Off | WHEREX") debe ir al bucket de ese cliente, no a Internal.
  if (participantDomains.size > 0 && externalDomains.size === 0) {
    const titleMatchedClient = findClientByTitleMatch(session.title, clients, ambiguous, internalDomains);
    if (titleMatchedClient) {
      return {
        kind: "client",
        id: titleMatchedClient.id,
        label: titleMatchedClient.name,
        company: titleMatchedClient.company,
      };
    }
    // Sin match por título → grupo Internal real
    const internalCat = categories.find((c) => c.kind === "internal");
    if (internalCat) {
      return {
        kind: "category",
        id: internalCat.id,
        label: internalCat.name,
        categoryKind: internalCat.kind,
        color: internalCat.color,
      };
    }
    // Si por algún motivo no hay categoría internal, cae a orphan con etiqueta especial
    return { kind: "orphan", label: "Interna (sin categoría)" };
  }

  // ── 3. Match con Client.emailDomains (por dominio externo) ────────────────
  // Usa `effectiveDomainsForClient` para que clientes con `company` que parece
  // dominio (ej. "wherex.com") sean reconocidos sin necesidad de poblar
  // manualmente `emailDomains` en DB.
  for (const c of clients) {
    const domains = effectiveDomainsForClient(c);
    if (domains.length === 0) continue;
    const hit = domains.some((d) => externalDomains.has(d));
    if (hit) {
      return (
        repartirEntreEntidades(c.id, session, externalDomains, ctx) ??
        { kind: "client", id: c.id, label: c.name, company: c.company }
      );
    }
  }

  // ── 4. Match con SessionCategory.domains (no internal) ────────────────────
  for (const cat of categories) {
    if (cat.kind === "internal") continue; // ya cubierto en paso 2
    const hit = cat.domains.some((d) => externalDomains.has(d.toLowerCase()));
    if (hit) {
      return {
        kind: "category",
        id: cat.id,
        label: cat.name,
        categoryKind: cat.kind,
        color: cat.color,
      };
    }
  }

  // ── 5. Dominio externo → empresa HubSpot → (si está ligada) Client ────────
  // Señal FUERTE: si el dominio es una company de HubSpot LIGADA a un Client de
  // Nexus (Client.hubspotCompanyId), resolver a ESE Client — antes del fallback
  // débil por título. Si la company existe pero no está ligada, queda como
  // hubspotCompany y CORTA (no cae al título). Requiere que el caller pueble
  // hubspotCompaniesByDomain + clientsByHubspotCompanyId (resolveAllSessions y
  // /sessions lo hacen; si no, este paso no matchea y degrada al comportamiento previo).
  const clientsByHs = ctx.clientsByHubspotCompanyId ?? EMPTY_CLIENT_MAP;
  let unlinkedCompany: HubspotCompanyLite | null = null;
  for (const domain of externalDomains) {
    const company = hubspotCompaniesByDomain.get(domain);
    if (!company) continue;
    const linkedClient = clientsByHs.get(company.id);
    if (linkedClient) {
      // Señal FUERTE: la company de HubSpot está ligada a un Client → ese Client.
      return (
        repartirEntreEntidades(linkedClient.id, session, externalDomains, ctx) ??
        { kind: "client", id: linkedClient.id, label: linkedClient.name, company: linkedClient.company }
      );
    }
    unlinkedCompany ??= company; // primera company de HubSpot que NO es Client de Nexus
  }
  // Company de HubSpot que NO es Client de Nexus:
  //  - display (/sessions, groupUnlinkedHubspotCompany=true): se agrupa como "hubspotCompany".
  //  - materialización/ownership (default): NO corta — cae al título (aditivo), para no
  //    perder sesiones legítimas de clientes con dominio real en HubSpot pero no registrado
  //    en el Client (ej. Mr Wings→tecnofood, Honda→facocr). El registro del dominio real
  //    resuelve esto por dominio (paso 3) y permite endurecer a "corte" más adelante.
  if (unlinkedCompany && ctx.groupUnlinkedHubspotCompany) {
    return {
      kind: "hubspotCompany",
      id: unlinkedCompany.id,
      label: unlinkedCompany.name || unlinkedCompany.domain,
      domain: unlinkedCompany.domain,
    };
  }

  // ── 6. Title matching con Client (fallback débil) ─────────────────────────
  const titleMatched = findClientByTitleMatch(session.title, clients, ambiguous, internalDomains);
  if (titleMatched) {
    return {
      kind: "client",
      id: titleMatched.id,
      label: titleMatched.name,
      company: titleMatched.company,
    };
  }

  // ── 7. Orphan ─────────────────────────────────────────────────────────────
  if (externalDomains.size === 0) {
    // No hay participantes externos identificables y tampoco internos puros
    return { kind: "orphan", label: "Sin participantes" };
  }

  // Usar el primer dominio externo como etiqueta del orphan
  const firstDomain = [...externalDomains][0];
  return { kind: "orphan", label: firstDomain, domain: firstDomain };
}

/**
 * Wrapper: categoriza una lista de sesiones de una sola pasada.
 * Devuelve la lista enriquecida con `group` para cada sesión.
 */
export function categorizeSessions<T extends CategorizableSession>(
  sessions: T[],
  ctx: CategorizeContext
): (T & { group: SessionGroup })[] {
  return sessions.map((s) => ({ ...s, group: categorizeSession(s, ctx) }));
}

/**
 * Extrae todos los dominios externos únicos de una lista de sesiones.
 * Útil para pre-calcular el batch que se le pasa a `searchCompaniesByDomains()`.
 */
export function collectExternalDomains(
  sessions: { participants: string[] }[],
  internalDomains: Set<string>
): string[] {
  const set = new Set<string>();
  for (const s of sessions) {
    const domains = extractParticipantDomains(s.participants);
    for (const d of domains) {
      if (!internalDomains.has(d)) set.add(d);
    }
  }
  return [...set];
}
