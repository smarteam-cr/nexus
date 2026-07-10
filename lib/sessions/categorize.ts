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
 */

import type { Client, SessionCategory } from "@prisma/client";
import type { HubspotCompanyLite } from "@/lib/hubspot/companies";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SessionGroup =
  | { kind: "client"; id: string; label: string; company?: string | null }
  | { kind: "hubspotCompany"; id: string; label: string; domain: string }
  | { kind: "category"; id: string; label: string; categoryKind: string; color?: string | null }
  | { kind: "orphan"; label: string; domain?: string };

export interface CategorizeContext {
  clients: Pick<Client, "id" | "name" | "company" | "emailDomains">[];
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
}

export interface CategorizableSession {
  participants: string[];
  manualClientId: string | null;
  title: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Extrae los dominios de los emails de participantes.
 * Devuelve un Set para lookup O(1).
 */
export function extractParticipantDomains(participants: string[]): Set<string> {
  return new Set(
    participants
      .map((email) => email?.split("@")[1]?.toLowerCase())
      .filter((d): d is string => !!d)
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
const TITLE_MATCH_STOPWORDS = new Set<string>([
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

function isTestClient(name: string): boolean {
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
 * Title-matching: busca un cliente cuyo nombre o company aparezca como token
 * (palabra >= 4 chars, sin stopwords genéricas) en el título de la sesión. Match
 * débil (último recurso del cascade); primero que matchee gana. Excluye clientes
 * de prueba. NOTA: es solo fallback — dominio (paso 3) y HubSpot→Client (paso 5)
 * mandan antes.
 */
function findClientByTitleMatch(
  title: string,
  clients: Pick<Client, "id" | "name" | "company">[],
  ambiguous: Set<string>,
): Pick<Client, "id" | "name" | "company"> | null {
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w);
  const titleWords = new Set(
    normalize(title)
      .split(/[\s|&,.()\[\]!?*\-_]+/)
      .filter((w) => w.length >= 4 && !skip(w))
  );
  if (titleWords.size === 0) return null;

  return (
    clients.find((c) => {
      if (isTestClient(c.name)) return false;
      const nameParts = normalize(c.name)
        .split(/\s+/)
        .filter((p) => p.length >= 4 && !skip(p));
      const compParts = c.company
        ? normalize(c.company)
            .split(/[\s.\-_]+/)
            .filter((p) => p.length >= 4 && !skip(p))
        : [];
      return (
        nameParts.some((p) => titleWords.has(p)) ||
        compParts.some((p) => titleWords.has(p))
      );
    }) ?? null
  );
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
    const titleMatchedClient = findClientByTitleMatch(session.title, clients, ambiguous);
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
      return { kind: "client", id: c.id, label: c.name, company: c.company };
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
      return { kind: "client", id: linkedClient.id, label: linkedClient.name, company: linkedClient.company };
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
  const titleMatched = findClientByTitleMatch(session.title, clients, ambiguous);
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
