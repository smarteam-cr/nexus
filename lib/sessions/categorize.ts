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
 *   3·0. Gente CONFIRMADA por el equipo (solo si hay alguien confirmado en la reunión; ver abajo)
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
 *
 * ⚠ Una empresa con varias unidades (2026-11-07, CEMACO: Costa Rica y Ecuador). Lo mismo, con tres reglas más:
 *  · Una unidad con dominio propio (Ecuador: sukasa.com, comohogar.com) NO vive en el dominio de la principal: su
 *    dominio la decide solo, y el de la principal deja de ser de las dos (`viveEnElDominioDeLaPrincipal`).
 *  · Cuando el título (pasos 2 y 6) cae en una unidad, se reparte igual que por dominio: «Alineación CEMACO» nombra a
 *    la empresa, no a una unidad, y queda por decidir.
 *  · En una empresa con MARCA (una palabra que está en el nombre de todas sus unidades: «Cemaco»), la sigla de una
 *    unidad solo vale en un título junto a la marca: «Cemaco CR |» sí, «Ride CR |» no. Sin marca (el TEC), sola.
 * DECISIONS «Una empresa con varias unidades».
 *
 * ⚠ La gente CONFIRMADA (2026-11-25, «Unidades e interlocutores»). Una persona del equipo dice con qué ficha trabaja cada
 * persona del cliente (`PersonaDeLaEmpresa.confirmadaAt`; llega como `interlocutoresConfirmados`). Si alguien de afuera
 * en la reunión está confirmado, decide el paso 3·0 (`decisionDeLaGenteConfirmada`), antes del dominio:
 *  · Las candidatas son las fichas de la gente confirmada y las del dominio de cada persona, cada una con su empresa
 *    (nunca la casa). Si el título nombra a una ficha que no es candidata, el paso se hace a un lado.
 *  · Primero el título, entre las candidatas. Después cada persona: la confirmada en UNA ficha vale por esa ficha, por
 *    encima de su dominio y de lo aprendido de los títulos; la confirmada en dos o más («del grupo») no decide; las demás,
 *    por su dominio o por lo aprendido. Todas de la misma ficha: esa. Si no, POR DECIDIR.
 *  · Sin nadie confirmado en la reunión, el paso no existe y la cascada es la de siempre. A mano sigue ganando (paso 1).
 * DECISIONS «Unidades e interlocutores».
 *
 * ⚠ La empresa ARRIBA de sus unidades (2026-11-26). La empresa es una ficha de tipo `EMPRESA` (lib/clients/empresa.ts):
 * guarda el dominio y la empresa de HubSpot que comparten sus unidades, y NUNCA es dueña de una reunión. Es la cabeza
 * del grupo (lo que hacía la principal): su dominio y su empresa de HubSpot llevan al reparto entre sus unidades, que no
 * cambia. No entra al match por título ni a las palabras ambiguas. Lo de HubSpot de la empresa se reparte con la misma
 * regla (`unidadDeLoDeHubspot`). DECISIONS «La empresa arriba de sus unidades».
 */

import type { Client, SessionCategory } from "@prisma/client";
import { esEmpresa } from "@/lib/clients/empresa";
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
    /** `EMPRESA`: la empresa arriba de sus unidades, que nunca es dueña (ver arriba). Todo cargador lo pide. */
    kind?: string | null;
    /** Solo para saber si una empresa SOLO AGRUPA (`empresaQueSoloAgrupa`): sin él (undefined), se toma que no. */
    hubspotCompanyId?: string | null;
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
  /**
   * La gente que una persona del equipo CONFIRMÓ: correo (en minúsculas) → las fichas con las que trabaja
   * (`PersonaDeLaEmpresa.confirmadaAt`, lo carga resolve-client.ts › `cargarInterlocutoresConfirmados`). Una ficha: la
   * persona decide por ella. Dos o más: es «del grupo» y no decide. Nunca sale de lo aprendido: lo escribe una persona.
   * Opcional: sin él (o vacío), la cascada es la de siempre.
   */
  interlocutoresConfirmados?: ReadonlyMap<string, readonly string[]>;
  /**
   * Ficha → la fecha de su PRIMER proyecto (que no es el contenedor «Información del cliente» ni de prueba, en cualquier
   * estado; resolve-client.ts › `cargarPrimerProyecto`). Lo usa la regla del GRUPO (`duenaDelProyectoDelGrupo`): entre
   * fichas unidas por gente confirmada en las dos, lo que la cascada no puede decidir va a la del proyecto más antiguo.
   * Opcional: sin él, esa regla no corre.
   */
  primerProyecto?: ReadonlyMap<string, Date>;
}

/** Qué paso de la cascada decidió (`categorizeSession` con `traza`): para los simulacros, que dicen POR QUÉ. */
export type PasoDeLaCascada =
  | "a-mano"
  | "interna-por-titulo"
  | "interna"
  | "gente-confirmada"
  | "dominio"
  | "categoria"
  | "hubspot"
  | "empresa-de-hubspot-sin-ficha"
  | "titulo"
  | "sin-dueno";

/**
 * Lo que la cascada anota mientras decide, si se le pasa (no cambia lo que devuelve): el paso y, si decidió entre
 * fichas (las unidades de una empresa o la gente confirmada), cómo. La escribe la MISMA cascada en cada punto donde
 * devuelve: no es otra copia de su orden.
 */
export interface TrazaDeLaCascada {
  paso?: PasoDeLaCascada;
  entre?: PorDeLaDecision;
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

import { clientePorTitulo, tokensDelCliente, type ClienteParaMatch, type ResultadoDeMatch } from "./match-por-titulo";

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
 *
 * Las UNIDADES de una misma empresa (`comparteDominioConId`) tampoco cuentan como empresas distintas entre sí:
 * «Cemaco · Costa Rica» y «Cemaco · Ecuador» comparten «cemaco» porque son la misma empresa. Si contaran, «cemaco»
 * quedaría ignorado en todo título y «Alineación CEMACO» se iría a las internas en vez de quedar por decidir entre las
 * dos. Entre las unidades lo desempata `decidirEntreEntidades`, que no usa la palabra que comparten.
 */
/**
 * Lo que necesita el cálculo de las palabras ambiguas. `id` y `comparteDominioConId` son OBLIGATORIOS (revisión del
 * 8 nov): con ellos, las unidades de una empresa no se cuentan como empresas distintas. Opcionales, el aviso de
 * Cobranza calculaba otra cosa que el resolver y dejaba pasar sin aviso una ficha que vuelve ambigua la marca.
 */
export type ClienteParaAmbiguas = Pick<Client, "name" | "company"> & {
  id: string;
  comparteDominioConId: string | null | undefined;
  /** La empresa arriba de sus unidades no cuenta: su nombre no nombra a nadie (2026-11-26). */
  kind?: string | null;
};

export function computeAmbiguousNameTokens(
  todas: readonly ClienteParaAmbiguas[],
): Set<string> {
  const clients = todas.filter((c) => !esEmpresa(c));
  const empresaDe = clients.map((c) => c.comparteDominioConId ?? c.id);
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
        if (empresaDe[idxs[a]] === empresaDe[idxs[b]]) continue;
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
  clients: CategorizeContext["clients"],
  ambiguous: Set<string>,
  internalDomains: Set<string>,
): ResultadoDeMatch {
  return clientePorTitulo(title, sinEmpresas(clientesQueValenEnElTitulo(title, clients)), {
    modo: "mejor-fraccion",
    skip: (w) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w),
    normalize,
    esClienteDePrueba: isTestClient,
    esLaCasa: esLaCasa(internalDomains),
  });
}

/* La CASA se deriva de los dominios internos (la SessionCategory kind="internal"), no de un
   nombre hardcodeado: «Cliente & Smarteam» es el formato estándar de los títulos del equipo, y
   Smarteam es un Client más en la base — nombraba su identidad entera y empataba con todos. */
const esLaCasa = (internalDomains: ReadonlySet<string>) => (c: { name: string; company: string | null }) =>
  effectiveDomainsForClient(c as Pick<Client, "name" | "company" | "emailDomains">).some((d) => internalDomains.has(d));

/**
 * ¿Esta ficha es la casa (Smarteam)? La MISMA regla que usa la cascada: un dominio de la ficha es interno. La usan la
 * pestaña de interlocutores y su escritor para no confirmar gente en la casa (2026-11-25): una sola definición.
 */
export const esLaCasaEn = (internalDomains: ReadonlySet<string>) => (c: Pick<Client, "name" | "company" | "emailDomains">) =>
  esLaCasa(internalDomains)(c);

/**
 * El dueño por el título (pasos 2 y 6). Si cae en una unidad de una empresa, o empatan solo unidades de la misma
 * empresa, la reunión se reparte entre sus unidades como cuando llega por el dominio: el título nombró a la empresa, y
 * de cuál unidad es lo decide `decidirEntreEntidades` (o queda por decidir). Null: el título no nombra a nadie.
 */
function duenoPorElTitulo(
  session: CategorizableSession,
  externalDomains: Set<string>,
  ctx: CategorizeContext,
  ambiguous: Set<string>,
  traza?: TrazaDeLaCascada,
): SessionGroup | null {
  const r = findClientByTitleMatch(session.title, ctx.clients, ambiguous, ctx.internalDomains);
  if (r.cliente) return duenoDeLaFicha(r.cliente, session, externalDomains, ctx, traza);
  if (r.motivo === "empate") {
    const casa = esLaCasa(ctx.internalDomains);
    const grupos = new Set(r.candidatos.filter((c) => !casa(c)).map((c) => entidadesDelDominio(c.id, ctx)));
    const [grupo] = grupos;
    if (grupos.size === 1 && grupo) return repartirEntreEntidades(grupo[0]!.id, session, externalDomains, ctx, traza);
    /* El título nombra a dos fichas de un mismo GRUPO (las une gente confirmada en las dos): la dueña del proyecto
       («Kick off - Teamnet y Sas», interna, va a Teamnet; Elías, 26 nov). */
    const duena = duenaDelProyectoDelGrupo(
      r.candidatos.filter((c) => !casa(c)).map((c) => c.id),
      ctx,
    );
    if (duena) {
      if (traza) traza.entre = "duena-del-proyecto";
      return { kind: "client", id: duena.id, label: duena.name, company: duena.company };
    }
  }
  return null;
}

/** La empresa de una ficha: la principal de sus unidades, o ella misma. */
const empresaDe = (c: { id: string; comparteDominioConId?: string | null }) => c.comparteDominioConId ?? c.id;

/** La lista sin las fichas de tipo Empresa: la empresa no se nombra por título ni es candidata (2026-11-26). */
const sinEmpresasPorLista = new WeakMap<readonly object[], readonly object[]>();
function sinEmpresas<C extends { kind?: string | null }>(clients: readonly C[]): readonly C[] {
  const hecho = sinEmpresasPorLista.get(clients);
  if (hecho) return hecho as readonly C[];
  const out = clients.some(esEmpresa) ? clients.filter((c) => !esEmpresa(c)) : clients;
  sinEmpresasPorLista.set(clients, out);
  return out;
}

/**
 * El dueño cuando una regla da ESTA ficha: si es de un grupo, el reparto entre sus unidades; si no, ella. Una empresa
 * sin unidades no se queda con nada: por decidir (nunca es dueña).
 */
function duenoDeLaFicha(
  c: { id: string; name: string; company: string | null },
  session: CategorizableSession,
  externalDomains: Set<string>,
  ctx: CategorizeContext,
  traza?: TrazaDeLaCascada,
): SessionGroup {
  const repartida = repartirEntreEntidades(c.id, session, externalDomains, ctx, traza);
  if (repartida) return repartida;
  const ficha = ctx.clients.find((x) => x.id === c.id);
  if (esEmpresa(ficha)) return { kind: "orphan", label: `Por decidir: ${c.name}`, domain: [...externalDomains][0] };
  return { kind: "client", id: c.id, label: c.name, company: c.company };
}

/**
 * LOS GRUPOS DE LA GENTE CONFIRMADA: dos fichas son del mismo grupo si una persona del equipo confirmó a alguien en las
 * dos («del grupo»: Laura, Marco y Mariana, en Teamnet y Stratosphere), y el grupo cierra por transitividad. Ficha → la
 * primera ficha de su grupo (la clave). PURO; memorizado por las fichas y el mapa de confirmadas (cada hipótesis de un
 * simulacro es otro mapa; un cambio de fichas en memoria, otra lista). Arma grupo SOLO quien (revisión del 26 nov):
 *  · tiene su dominio registrado en una de sus fichas o en su empresa (Laura, de teamnet.com.mx, sí; un consultor de una
 *    agencia o de gmail confirmado en dos clientes, no: si no, uniría a dos clientes que no tienen nada que ver);
 *  · está en fichas de DOS empresas o más (las unidades de una empresa tienen su propia regla, `decidirEntreEntidades`:
 *    sin pista, por decidir);
 *  · no es de un dominio de categoría ni de la casa.
 */
const gruposPorConfirmadas = new WeakMap<readonly ClienteDelCtx[], WeakMap<object, Map<string, string>>>();
export function gruposDeLaGenteConfirmada(ctx: CategorizeContext): ReadonlyMap<string, string> {
  const confirmadas = ctx.interlocutoresConfirmados;
  if (!confirmadas?.size) return new Map();
  const porLista = gruposPorConfirmadas.get(ctx.clients) ?? new WeakMap<object, Map<string, string>>();
  gruposPorConfirmadas.set(ctx.clients, porLista);
  const hecho = porLista.get(confirmadas);
  if (hecho) return hecho;
  const casa = esLaCasa(ctx.internalDomains);
  const deCategoria = dominiosDeCategoria(ctx.categories);
  const porId = new Map(ctx.clients.map((c) => [c.id, c]));
  const empresas = gruposDeEntidades(ctx.clients);
  const padre = new Map<string, string>();
  const raiz = (id: string): string => {
    let x = id;
    while (padre.get(x) !== x) x = padre.get(x)!;
    padre.set(id, x);
    return x;
  };
  for (const [correo, fichas] of confirmadas) {
    const dominio = correo.split("@")[1] ?? "";
    if (!dominio || deCategoria.has(dominio)) continue;
    const suyas = fichas.filter((id) => porId.has(id) && !casa(porId.get(id)!));
    if (new Set(suyas.map((id) => empresaDe(porId.get(id)!))).size < 2) continue;
    const esDeUna = suyas.some((id) => {
      const ficha = porId.get(id)!;
      const cabeza = ficha.comparteDominioConId ? porId.get(ficha.comparteDominioConId) : undefined;
      return [...(empresas.get(id) ?? [ficha]), ...(cabeza ? [cabeza] : [])].some((c) => effectiveDomainsForClient(c).includes(dominio));
    });
    if (!esDeUna) continue;
    for (const id of suyas) if (!padre.has(id)) padre.set(id, id);
    for (const id of suyas.slice(1)) {
      const a = raiz(suyas[0]!);
      const b = raiz(id);
      if (a !== b) padre.set(b, a);
    }
  }
  const out = new Map<string, string>();
  for (const id of padre.keys()) out.set(id, raiz(id));
  porLista.set(confirmadas, out);
  return out;
}

/**
 * LA REGLA DEL GRUPO (Elías, 26 nov: «las reuniones conjuntas de Teamnet y Stratosphere se quedan en Teamnet»): si todas
 * las fichas entre las que la cascada no pudo decidir son de UN mismo grupo de la gente confirmada
 * (`gruposDeLaGenteConfirmada`) y de dos empresas o más, la reunión es de la ficha del grupo con el proyecto MÁS ANTIGUO
 * (`primerProyecto`): la dueña del proyecto. Null (sigue por decidir) si ninguna tiene proyectos, si dos empatan en la
 * fecha, o si hay una ficha de afuera del grupo.
 * *Por qué el más antiguo y no «la única con proyectos»* (revisión del 26 nov): con «la única», el primer proyecto de
 * Stratosphere devolvía a por decidir, sin aviso, las conjuntas que el equipo ya usa en los documentos de Teamnet. El
 * proyecto más antiguo del grupo no cambia cuando otra ficha suma uno. Lo que de verdad es de la otra, se asigna a mano.
 * *Por qué solo en un grupo que armó una persona:* entre dos clientes cualquiera, un título que nombra a los dos lo sigue
 * asignando alguien.
 */
function duenaDelProyectoDelGrupo(ids: readonly string[], ctx: CategorizeContext): ClienteDelCtx | null {
  const primer = ctx.primerProyecto;
  if (!primer?.size) return null;
  /* Una empresa nunca es la dueña, aunque tenga un proyecto esperando unidad (2026-11-26). */
  const empresas = new Set(ctx.clients.filter(esEmpresa).map((c) => c.id));
  const unicas = [...new Set(ids)].filter((id) => !empresas.has(id));
  if (unicas.length < 2) return null;
  const porId = new Map(ctx.clients.map((c) => [c.id, c]));
  if (unicas.some((id) => !porId.has(id))) return null;
  /* Todas unidades de UNA empresa que solo agrupa (Grupo Teamnet; Elías, 27 nov: «Sí, que valga»): el grupo ya lo armó
     una persona al crear la empresa, sin gente confirmada en las dos. */
  const empresa = porId.get(unicas[0]!)!.comparteDominioConId;
  const enLaQueAgrupa =
    !!empresa && unicas.every((id) => porId.get(id)!.comparteDominioConId === empresa) && empresaQueSoloAgrupa(porId.get(empresa));
  if (!enLaQueAgrupa) {
    const grupos = gruposDeLaGenteConfirmada(ctx);
    const clave = grupos.get(unicas[0]!);
    if (!clave || unicas.some((id) => grupos.get(id) !== clave)) return null;
    if (new Set(unicas.map((id) => empresaDe(porId.get(id)!))).size < 2) return null;
  }
  const conFecha = unicas.filter((id) => primer.has(id)).sort((a, b) => primer.get(a)!.getTime() - primer.get(b)!.getTime());
  if (!conFecha.length) return null;
  if (conFecha.length > 1 && primer.get(conFecha[0]!)!.getTime() === primer.get(conFecha[1]!)!.getTime()) return null;
  return porId.get(conFecha[0]!) ?? null;
}

/**
 * ¿Una empresa que SOLO AGRUPA? De tipo Empresa, sin dominio propio y sin empresa de HubSpot: no hay nada compartido que
 * decida de cuál unidad es una reunión (Grupo Teamnet, con Teamnet y Stratosphere, cada una con lo suyo). Dentro de ella
 * vale la regla del grupo (Elías, 27 nov). El TEC (dominios del instituto) y Cemaco («Cemaco Internacional» de HubSpot)
 * no solo agrupan: lo dudoso queda por decidir. Si el cargador no trajo `hubspotCompanyId` (undefined), no: sin la regla,
 * lo dudoso queda por decidir, que es lo seguro.
 */
function empresaQueSoloAgrupa(c: ClienteDelCtx | undefined): boolean {
  return !!c && esEmpresa(c) && c.hubspotCompanyId === null && effectiveDomainsForClient(c).length === 0;
}

/**
 * Las fichas cuyas reuniones puede mover la regla del grupo si la confirmación de esta gente pasa de `antes` a `despues`
 * (revisión del 26 nov: el aviso de la pestaña miraba solo las fichas de la persona, no el grupo entero). Si la persona
 * queda o estaba en dos fichas o más y su confirmación cambia, todas las fichas de los grupos a los que toca, antes y
 * después. Vacío si ningún grupo cambia. PURO.
 */
export function fichasQueMiraElGrupo(
  correos: readonly string[],
  antes: ReadonlyMap<string, readonly string[]>,
  despues: ReadonlyMap<string, readonly string[]>,
  ctx: CategorizeContext,
): string[] {
  const semillas = new Set<string>();
  for (const bruto of correos) {
    const correo = bruto.trim().toLowerCase();
    const a = [...(antes.get(correo) ?? [])].sort();
    const d = [...(despues.get(correo) ?? [])].sort();
    if (a.join("|") === d.join("|") || Math.max(a.length, d.length) < 2) continue;
    for (const id of [...a, ...d]) semillas.add(id);
  }
  if (!semillas.size) return [];
  const out = new Set(semillas);
  for (const mapa of [antes, despues]) {
    const grupos = gruposDeLaGenteConfirmada({ ...ctx, interlocutoresConfirmados: mapa });
    const claves = new Set([...semillas].map((id) => grupos.get(id)).filter((x): x is string => !!x));
    for (const [id, clave] of grupos) if (claves.has(clave)) out.add(id);
  }
  return [...out];
}

// ── Entidades que comparten dominio ──────────────────────────────────────────

type ClienteDelCtx = CategorizeContext["clients"][number];
/** Lo mínimo que hace falta para saber de qué empresa es una ficha (también lo usan Tareas y «Mi día»). */
type ConEmpresa = ClienteParaMatch;

/** Las palabras de los dominios propios de una ficha («sukasa» de sukasa.com; «cemaco» de cemaco.co.cr): sin el final. */
function palabrasDelDominioPropio(c: ConEmpresa): Set<string> {
  const out = new Set<string>();
  for (const d of c.emailDomains ?? []) {
    const partes = normalize(d).split(".");
    for (const p of partes.slice(0, -1)) if (p.length >= 4 && !TITLE_MATCH_STOPWORDS.has(p)) out.add(p);
  }
  return out;
}

/** Por cada ficha de un grupo: la dueña y sus entidades, en el orden de la lista. Se arma una vez por lista de clientes. */
const gruposPorLista = new WeakMap<readonly ConEmpresa[], Map<string, ConEmpresa[]>>();

function gruposDeEntidades<C extends ConEmpresa>(clients: readonly C[]): Map<string, C[]> {
  const hecho = gruposPorLista.get(clients);
  if (hecho) return hecho as Map<string, C[]>;
  const porId = new Map(clients.map((c) => [c.id, c]));
  const entidadesDe = new Map<string, Set<string>>();
  for (const c of clients) {
    const duena = c.comparteDominioConId ? porId.get(c.comparteDominioConId) : undefined;
    /* Sin cadenas: una dueña que a su vez es entidad de otra no arma grupo (sería una regla que nadie decidió). Una
       empresa no cuelga de nadie. */
    if (!duena || duena.id === c.id || duena.comparteDominioConId || esEmpresa(c)) continue;
    entidadesDe.set(duena.id, (entidadesDe.get(duena.id) ?? new Set()).add(c.id));
  }
  const out = new Map<string, C[]>();
  for (const [duenaId, entidades] of entidadesDe) {
    /* Una dueña de tipo Empresa (2026-11-26) no es parte de su grupo: es solo la llave. El grupo son sus unidades, todas
       iguales, y la empresa da su grupo (por su dominio o su empresa de HubSpot) sin poder ser elegida. */
    const cabezaEsEmpresa = esEmpresa(porId.get(duenaId));
    const grupo = clients.filter((c) => (c.id === duenaId && !cabezaEsEmpresa) || entidades.has(c.id));
    for (const c of grupo) out.set(c.id, grupo);
    if (cabezaEsEmpresa) out.set(duenaId, grupo);
  }
  gruposPorLista.set(clients, out);
  return out;
}

/** La dueña y sus entidades si `clientId` es parte de un grupo que comparte dominio; null si no. */
export function entidadesDelDominio(clientId: string, ctx: Pick<CategorizeContext, "clients">): ClienteDelCtx[] | null {
  return gruposDeEntidades(ctx.clients).get(clientId) ?? null;
}

/**
 * ¿Esta unidad vive en el dominio de su principal? Solo si comparte dominio y NO tiene uno propio (2026-11-07): AE (sin
 * dominio) vive en el del TEC; Ecuador (sukasa.com, comohogar.com) vive en el suyo, y el de Costa Rica no la incluye.
 */
export function viveEnElDominioDeLaPrincipal(c: Pick<ClienteDelCtx, "comparteDominioConId" | "emailDomains" | "company">): boolean {
  return !!c.comparteDominioConId && effectiveDomainsForClient(c).length === 0;
}

/** Las palabras del nombre (≥4 letras, sin stopwords) que están en TODAS las unidades del grupo: «cemaco». */
const marcaPorGrupo = new WeakMap<readonly ConEmpresa[], Set<string>>();
function marcaDelGrupo(grupo: readonly ConEmpresa[]): Set<string> {
  const hecha = marcaPorGrupo.get(grupo);
  if (hecha) return hecha;
  /* Cortando en todo signo, como la marca en el título: «Cemaco-Costa Rica» o «Cemaco/CR» no apagan la regla. */
  const [primera, ...resto] = grupo.map(
    (c) => new Set(normalize(c.name).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !TITLE_MATCH_STOPWORDS.has(w))),
  );
  const marca = new Set([...(primera ?? [])].filter((t) => resto.every((r) => r.has(t))));
  marcaPorGrupo.set(grupo, marca);
  return marca;
}

/** Las palabras que no distinguen a una unidad de otra DENTRO de su empresa: las del nombre de dos o más («cemaco»). */
const compartidasPorGrupo = new WeakMap<readonly ConEmpresa[], Set<string>>();
function palabrasCompartidasDelGrupo(grupo: readonly ConEmpresa[]): Set<string> {
  const hechas = compartidasPorGrupo.get(grupo);
  if (hechas) return hechas;
  const vistas = new Map<string, number>();
  for (const c of grupo) {
    const suyas = new Set(tokensDelCliente(c, (w) => TITLE_MATCH_STOPWORDS.has(w), normalize).todos);
    /* El dominio PROPIO de una unidad también es una palabra suya (27 nov): sukasa.com es de Cemaco · Ecuador, así que
       «Sukasa» en el título no nombra solo a la unidad Sukasa y decide el dominio. Elías: las reuniones «SUKASA…» son de
       Ecuador. Lo que no es dominio propio (el de la empresa, el que se comparte) no suma. */
    if (!esEmpresa(c)) for (const t of palabrasDelDominioPropio(c)) suyas.add(t);
    for (const t of suyas) vistas.set(t, (vistas.get(t) ?? 0) + 1);
  }
  const out = new Set([...vistas].filter(([, n]) => n >= 2).map(([t]) => t));
  compartidasPorGrupo.set(grupo, out);
  return out;
}

/**
 * Las palabras del nombre de `clientId` que no lo distinguen de otra unidad de su empresa (vacío si no es de una).
 * Las usa el reconocimiento de clientes en un texto (lib/sessions/clientes-por-texto.ts) para no nombrar una unidad
 * por la marca: es la misma regla que este archivo, en un solo lugar (invariante 2).
 */
export function palabrasQueNoDistinguenEnSuEmpresa(clientId: string, clients: readonly ConEmpresa[]): ReadonlySet<string> {
  const grupo = gruposDeEntidades(clients).get(clientId);
  return grupo ? palabrasCompartidasDelGrupo(grupo) : EMPTY_TOKEN_SET;
}

/** La empresa (la dueña y sus unidades) de `clientId`, o null. Para el reconocimiento de clientes en un texto. */
export function unidadesDeLaEmpresa<C extends ConEmpresa>(clientId: string, clients: readonly C[]): C[] | null {
  return gruposDeEntidades(clients).get(clientId) ?? null;
}

/**
 * Los clientes para un match de título, con las siglas de cada unidad SOLO si valen en este título: en una empresa con
 * marca, junto a la marca («Cemaco CR |»). Medido el 2026-11-07: «CR» suelto está en 27 títulos de otros («Ride CR»,
 * «Claro CR», «Pago de Nómina en CR y NIC»); como sigla de toda la cascada se los habría llevado, y entre las unidades
 * le ganaría al dominio («Ride CR | Landing» con gente de Ecuador). Sin marca (el TEC: «TEC · AE» y «TEC · TAE» no
 * tienen palabras de 4 letras), la sigla vale sola, como se decidió el 29 oct. Sin grupos devuelve la misma lista.
 * La usa la decisión entre las unidades de UNA empresa (`unidadQueNombraElTitulo`). Para buscar entre todos los
 * clientes, `clientesQueValenEnElTitulo`.
 */
export function siglasQueValenEnElTitulo<C extends ConEmpresa>(title: string, clients: readonly C[]): readonly C[] {
  return filtrarPorLaMarca(title, clients, false);
}

/**
 * Los clientes para un match de título entre TODOS (la cascada, pasos 2 y 6, y el reconocimiento de clientes en un
 * texto: Tareas, «Mi día»). En una empresa con marca, una unidad solo participa si el título dice la marca: sin
 * «Cemaco», ni sus siglas ni las palabras de su nombre la nombran. *Por qué* (revisión del 8 nov): «Cemaco · Ecuador»
 * hacía que «Planificación expansión Ecuador», una interna, o «Distribuidora Ecuador», un prospecto, terminaran en la
 * ficha de Cemaco. Es la fuga de «para» con otra cara: una palabra de país, de rubro o de lugar no es el nombre de la
 * empresa. «Costa» y «Rica» se salvaban solo porque «Honda Costa Rica» las vuelve ambiguas. Adentro de la empresa
 * (cuando el dominio ya dijo que es Cemaco), «Ecuador» sí distingue: eso lo decide `decidirEntreEntidades`.
 */
export function clientesQueValenEnElTitulo<C extends ConEmpresa>(title: string, clients: readonly C[]): readonly C[] {
  return filtrarPorLaMarca(title, clients, true);
}

/**
 * Las palabras del título para buscar la marca: cortadas en todo signo, también «:» y «/» («CEMACO: CR handoff»,
 * «Cemaco/CR»). El corte del match por título no los corta, y cambiarlo movería el resto de la cascada.
 */
function palabrasParaLaMarca(title: string): Set<string> {
  return new Set(normalize(title).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

function filtrarPorLaMarca<C extends ConEmpresa>(title: string, clients: readonly C[], sinMarcaNoParticipa: boolean): readonly C[] {
  const grupos = gruposDeEntidades(clients);
  if (grupos.size === 0) return clients;
  let palabras: Set<string> | null = null;
  let cambio = false;
  const out: C[] = [];
  for (const c of clients) {
    const grupo = grupos.get(c.id);
    if (!grupo || (!sinMarcaNoParticipa && !c.siglas?.length)) {
      out.push(c);
      continue;
    }
    const marca = marcaDelGrupo(grupo);
    if (marca.size === 0) {
      out.push(c);
      continue;
    }
    palabras ??= palabrasParaLaMarca(title);
    if ([...marca].some((m) => palabras!.has(m))) {
      out.push(c);
      continue;
    }
    cambio = true;
    if (!sinMarcaNoParticipa) out.push({ ...c, siglas: [] });
  }
  return cambio ? out : clients;
}

/**
 * ¿Qué unidad de la empresa nombra el título? Sus siglas (con la regla de la marca) o las palabras de su nombre que la
 * distinguen de las otras unidades. PURO. Es el paso 1 de `decidirEntreEntidades`; el reconocimiento de clientes en un
 * texto lo usa igual.
 */
export function unidadQueNombraElTitulo<C extends ConEmpresa>(
  title: string,
  grupo: readonly C[],
  ambiguous: ReadonlySet<string> = EMPTY_TOKEN_SET,
): { clientId: string | null; candidatos: number } {
  const compartidas = palabrasCompartidasDelGrupo(grupo);
  const r = clientePorTitulo(title, siglasQueValenEnElTitulo(title, grupo), {
    modo: "mejor-fraccion",
    skip: (w) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w) || compartidas.has(w),
    normalize,
    esClienteDePrueba: isTestClient,
  });
  return { clientId: r.cliente?.id ?? null, candidatos: r.candidatos.length };
}

/**
 * Qué unidad puede ser la de cada dominio de las fichas: el de una principal, ella y las unidades SUYAS que viven en él
 * (`viveEnElDominioDeLaPrincipal`); el propio de una unidad, solo esa. Las fichas pueden ser de varias empresas (el paso
 * de la gente confirmada): cada unidad vive solo en el dominio de SU principal. Con una sola empresa da lo de siempre.
 */
function unidadesPorDominio(fichas: readonly ClienteDelCtx[], todas: readonly ClienteDelCtx[] = fichas): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const sumar = (d: string, ids: readonly string[]) => out.set(d, new Set([...(out.get(d) ?? []), ...ids]));
  let porId: Map<string, ClienteDelCtx> | null = null;
  for (const c of fichas) {
    const propios = effectiveDomainsForClient(c);
    const viven = fichas.filter((u) => u.comparteDominioConId === c.id && viveEnElDominioDeLaPrincipal(u)).map((u) => u.id);
    /* La empresa nunca es una de las fichas del dominio: su dominio es de las unidades que viven en él (2026-11-26). */
    const duenas = esEmpresa(c) ? viven : c.comparteDominioConId ? [c.id] : [c.id, ...viven];
    for (const d of propios) sumar(d, duenas);
    /* Una unidad que vive en el dominio de su EMPRESA, cuando la empresa no está entre las fichas (es solo la llave del
       grupo): el dominio de la empresa es suyo y de las otras unidades que viven en él. */
    if (c.comparteDominioConId && viveEnElDominioDeLaPrincipal(c)) {
      porId ??= new Map(todas.map((x) => [x.id, x]));
      const empresa = porId.get(c.comparteDominioConId);
      if (empresa && esEmpresa(empresa) && !fichas.includes(empresa)) for (const d of effectiveDomainsForClient(empresa)) sumar(d, [c.id]);
    }
  }
  return out;
}

/** Cómo se decidió entre fichas: lo de `decidirEntreEntidades`, o la regla del grupo (`duenaDelProyectoDelGrupo`). */
export type PorDeLaDecision = DecisionEntreEntidades["por"] | "duena-del-proyecto";

export type DecisionEntreEntidades =
  | { clientId: string; por: "nombre" | "confirmada" | "gente" | "dominio" }
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
 *  1. El NOMBRE de la reunión (`unidadQueNombraElTitulo`): si nombra a UNA sola entidad (sus `siglas`, con la regla de
 *     la marca, o su nombre, con el mismo matcher del paso 6 acotado al grupo), es de esa. Si nombra a dos, por
 *     decidir: la gente no desempata un título que dice las dos cosas. La palabra que comparten las unidades
 *     («cemaco») no nombra a ninguna.
 *  2. La GENTE y el DOMINIO, persona por persona:
 *     · la CONFIRMADA por el equipo (`interlocutoresConfirmados`) en UNA de estas fichas cuenta para esa, por encima de
 *       su dominio y de lo aprendido; la confirmada en dos o más («del grupo») no cuenta para ninguna;
 *     · las demás, para la unidad de su dominio, si el dominio es de una sola (el propio de Ecuador; el de Costa Rica, si
 *       ninguna unidad vive en él), o para la que dice `personasDeEntidades`.
 *     Si todas las que se conocen son de la misma unidad, es de esa.
 *  3. Si no, por decidir.
 * La gente de Smarteam no cuenta: lleva las dos (en el TEC, Heiver).
 */
export function decidirEntreEntidades(
  session: CategorizableSession,
  entidades: readonly ClienteDelCtx[],
  ctx: Pick<CategorizeContext, "internalDomains" | "ambiguousNameTokens" | "personasDeEntidades" | "interlocutoresConfirmados"> &
    Partial<Pick<CategorizeContext, "categories" | "clients">>,
): DecisionEntreEntidades {
  /* Una empresa nunca es candidata (2026-11-26); `ctx.clients` deja leer el dominio de la empresa de las unidades. */
  return decidirEntre(session, sinEmpresas(entidades), ctx, unidadesPorDominio(entidades, ctx.clients ?? entidades));
}

/** `decidirEntreEntidades` con el mapa dominio → fichas armado afuera (el paso de la gente confirmada le suma HubSpot). */
function decidirEntre(
  session: CategorizableSession,
  entidades: readonly ClienteDelCtx[],
  ctx: Pick<CategorizeContext, "internalDomains" | "ambiguousNameTokens" | "personasDeEntidades" | "interlocutoresConfirmados"> &
    Partial<Pick<CategorizeContext, "categories">>,
  porDominio: ReadonlyMap<string, ReadonlySet<string>>,
): DecisionEntreEntidades {
  const t = unidadQueNombraElTitulo(session.title, entidades, ctx.ambiguousNameTokens ?? EMPTY_TOKEN_SET);
  if (t.clientId) return { clientId: t.clientId, por: "nombre" };
  if (t.candidatos > 1) return { clientId: null, por: "dos-nombres" };

  const personas = ctx.personasDeEntidades;
  const confirmadas = ctx.interlocutoresConfirmados;
  /* La gente de un dominio de categoría (HubSpot, partners) no decide aunque esté confirmada (revisión del 25 nov). */
  const deCategoria = dominiosDeCategoria(ctx.categories);
  const ids = new Set(entidades.map((e) => e.id));
  const de = new Set<string>();
  /* Quien solo se sabe que es de VARIAS fichas (su dominio es el de una principal con unidades que viven en él) no elige
     ficha, pero sí empresa: si la que eligen los demás no es ninguna de las suyas, la reunión no es de esa (revisión del
     25 nov: «Revisión semanal» con gente del TEC y una persona confirmada en Credix se iba a Credix). */
  const deVarias: ReadonlySet<string>[] = [];
  let porLaGente = false;
  let porConfirmadas = false;
  for (const correo of correosDeAfuera(session.participants, ctx.internalDomains)) {
    const dominio = correo.split("@")[1]!;
    const suyas = deCategoria.has(dominio) ? undefined : confirmadas?.get(correo)?.filter((id) => ids.has(id));
    if (suyas?.length) {
      /* Lo dijo una persona del equipo: vale más que su dominio y que lo aprendido. En dos o más, es del grupo y no decide. */
      if (suyas.length === 1) {
        de.add(suyas[0]!);
        porConfirmadas = true;
      } else {
        /* Del grupo: no elige, pero veta una ficha que no es de las suyas (revisión del 25 nov: Cindy «del grupo» en AE y TAE
           con alguien de Credix mandaba la reunión del TEC a Credix). */
        deVarias.push(new Set(suyas));
      }
      continue;
    }
    const delDominio = porDominio.get(dominio);
    if (delDominio?.size === 1) {
      de.add([...delDominio][0]!);
      continue;
    }
    const id = personas?.get(correo);
    if (id && ids.has(id)) {
      de.add(id);
      porLaGente = true;
      continue;
    }
    if (delDominio && delDominio.size > 1) deVarias.push(delDominio);
  }
  if (de.size === 1) {
    const elegida = [...de][0]!;
    if (deVarias.some((varias) => !varias.has(elegida))) return { clientId: null, por: "gente-de-varias" };
    return { clientId: elegida, por: porConfirmadas ? "confirmada" : porLaGente ? "gente" : "dominio" };
  }
  if (de.size > 1) return { clientId: null, por: "gente-de-varias" };
  return { clientId: null, por: "sin-pista" };
}

/** Los dominios de las categorías que no son internas (HubSpot, partners: el paso 4). */
const dominiosDeCategoriaPorLista = new WeakMap<readonly CategorizeContext["categories"][number][], Set<string>>();
function dominiosDeCategoria(categories: CategorizeContext["categories"] | undefined): ReadonlySet<string> {
  if (!categories) return EMPTY_TOKEN_SET;
  const hecho = dominiosDeCategoriaPorLista.get(categories);
  if (hecho) return hecho;
  const out = new Set(categories.filter((c) => c.kind !== "internal").flatMap((c) => c.domains.map((d) => d.toLowerCase())));
  dominiosDeCategoriaPorLista.set(categories, out);
  return out;
}

/** Por cada lista de clientes: dominio → la primera ficha (en el orden de atribuir) que lo tiene, como el paso 3. */
const fichaPorDominioDeLaLista = new WeakMap<readonly ClienteDelCtx[], Map<string, ClienteDelCtx>>();
function fichaDelDominioRegistrado(dominio: string, clients: readonly ClienteDelCtx[]): ClienteDelCtx | undefined {
  let mapa = fichaPorDominioDeLaLista.get(clients);
  if (!mapa) {
    mapa = new Map();
    for (const c of clients) for (const d of effectiveDomainsForClient(c)) if (!mapa.has(d)) mapa.set(d, c);
    fichaPorDominioDeLaLista.set(clients, mapa);
  }
  return mapa.get(dominio);
}

/**
 * PURO: las filas confirmadas de `PersonaDeLaEmpresa` → `interlocutoresConfirmados` (correo en minúsculas → fichas, cada
 * una una vez, en el orden de atribuir: por antigüedad de la ficha). Así el resultado no depende de cómo devuelva las
 * filas la base.
 */
export function interlocutoresDesdeFilas(filas: readonly { correo: string; clientId: string; desde: Date }[]): Map<string, string[]> {
  const orden = [...filas].sort((a, b) => a.desde.getTime() - b.desde.getTime() || a.clientId.localeCompare(b.clientId));
  const out = new Map<string, string[]>();
  for (const f of orden) {
    const correo = f.correo.trim().toLowerCase();
    const fichas = out.get(correo) ?? [];
    if (!fichas.includes(f.clientId)) fichas.push(f.clientId);
    out.set(correo, fichas);
  }
  return out;
}

/**
 * La ficha que el dominio de una persona da HOY, como lo leerían los pasos 3 y 5: la primera que lo tiene registrado o, si
 * ninguna, la ligada a su empresa de HubSpot. Nunca la casa. PURO.
 */
function fichaQueDaElDominio(dominio: string, ctx: CategorizeContext): { ficha: ClienteDelCtx; porHubspot: boolean } | null {
  const casa = esLaCasa(ctx.internalDomains);
  const registrada = fichaDelDominioRegistrado(dominio, ctx.clients);
  if (registrada) return casa(registrada) ? null : { ficha: registrada, porHubspot: false };
  const empresa = ctx.hubspotCompaniesByDomain.get(dominio);
  const ligadaId = empresa ? ctx.clientsByHubspotCompanyId?.get(empresa.id)?.id : undefined;
  const ligada = ligadaId ? ctx.clients.find((c) => c.id === ligadaId) : undefined;
  return ligada && !casa(ligada) ? { ficha: ligada, porHubspot: true } : null;
}

/**
 * Las fichas que el dominio de este correo da hoy, con la regla del resolver (`unidadesPorDominio`): el dominio de una
 * principal da la principal y las unidades que viven en él; el propio de una unidad, solo esa unidad. Es a quién le
 * puede quitar reuniones FUTURAS cambiar la confirmación de esta persona: la pestaña de interlocutores pide acceso a ellas
 * (revisión del 25 nov; con la empresa entera, la CSE de Ecuador no podía confirmar a su propia gente porque se le pedía
 * Costa Rica). Vacío si el dominio no da ninguna ficha. PURO.
 */
export function fichasQueDaElDominio(correo: string, ctx: CategorizeContext): string[] {
  const dominio = correo.trim().toLowerCase().split("@")[1];
  if (!dominio || ctx.internalDomains.has(dominio) || esDominioDeCalendario(dominio)) return [];
  const r = fichaQueDaElDominio(dominio, ctx);
  if (!r) return [];
  const grupo = gruposDeEntidades(ctx.clients).get(r.ficha.id);
  if (!grupo) return [r.ficha.id];
  const porDominio = unidadesPorDominio(grupo, ctx.clients).get(dominio);
  if (porDominio) return [...porDominio];
  /* Ligada por HubSpot (el dominio no está registrado): la ficha y, si es una principal, las unidades que viven en ella.
     Una empresa nunca está entre las fichas: no pierde ni gana reuniones (2026-11-26). */
  const viven = grupo.filter((u) => u.comparteDominioConId === r.ficha.id && viveEnElDominioDeLaPrincipal(u)).map((u) => u.id);
  return r.ficha.comparteDominioConId ? [r.ficha.id] : esEmpresa(r.ficha) ? viven : [r.ficha.id, ...viven];
}

/**
 * Paso 3·0 · LA GENTE CONFIRMADA (`decisionDeLaGenteConfirmada`). Null si nadie de afuera en la reunión está confirmado (la cascada sigue como siempre),
 * o si el título nombra a una ficha que no es candidata (la cascada de siempre la resuelve por el título, como antes).
 * Si no, este paso decide: una ficha, o POR DECIDIR (orphan → `resolvedClientId` null, a la vista en /sessions). Las
 * candidatas: las fichas de la gente confirmada y la del dominio de cada persona (registrado, paso 3, o de su empresa de
 * HubSpot ligada, paso 5), cada una con su empresa entera (la principal y sus unidades), nunca la casa. Entre ellas,
 * `decidirEntre`: el título primero, después persona por persona (la confirmada en una ficha manda sobre su dominio; la
 * «del grupo» no decide).
 * *Por qué el título primero:* una persona del grupo no decide sola por su dominio; «con el título decide el título»
 * (pedido del 25 nov). Y es la regla de siempre entre unidades: la gente no desempata un título.
 * *Por qué por decidir y no la ficha más vieja:* si la gente apunta a dos fichas, elegir una sería adivinar en silencio.
 */
function decisionDeLaGenteConfirmada(
  session: CategorizableSession,
  externalDomains: Set<string>,
  ctx: CategorizeContext,
): { grupo: SessionGroup; por: PorDeLaDecision } | null {
  const confirmadasTodas = ctx.interlocutoresConfirmados;
  if (!confirmadasTodas?.size) return null;
  const afuera = correosDeAfuera(session.participants, ctx.internalDomains);
  if (!afuera.some((c) => confirmadasTodas.has(c))) return null;
  /* Alguien de un dominio de una categoría (HubSpot, partners: paso 4) no decide aunque esté confirmado: sus reuniones
     tratan varias cuentas. La pestaña ya no deja confirmarlo; esto cubre a quien se confirmó antes de que su dominio
     fuera una categoría (revisión del 25 nov). */
  const deCategoria = dominiosDeCategoria(ctx.categories);
  const confirmadas: ReadonlyMap<string, readonly string[]> = deCategoria.size
    ? new Map([...confirmadasTodas].filter(([correo]) => !deCategoria.has(correo.split("@")[1] ?? "")))
    : confirmadasTodas;
  if (!afuera.some((c) => confirmadas.has(c))) return null;

  const porId = new Map(ctx.clients.map((c) => [c.id, c]));
  const grupos = gruposDeEntidades(ctx.clients);
  /* La casa (la ficha de Smarteam) nunca es candidata: «X & Smarteam» es el formato de los títulos del equipo. */
  const casa = esLaCasa(ctx.internalDomains);
  const ids = new Set<string>();
  const sumarEmpresa = (id: string) => {
    for (const c of grupos.get(id) ?? [porId.get(id)!]) ids.add(c.id);
  };
  let alguna = false;
  for (const correo of afuera) {
    for (const id of confirmadas.get(correo) ?? []) {
      const c = porId.get(id);
      if (!c || casa(c)) continue; // una ficha que ya no existe, o la casa
      alguna = true;
      sumarEmpresa(id);
    }
  }
  if (!alguna) return null;

  /* El dominio de cada persona, como lo leerían los pasos 3 y 5: lo registrado, o la empresa de HubSpot ligada. */
  const porHubspot = new Map<string, string>();
  for (const d of externalDomains) {
    const r = fichaQueDaElDominio(d, ctx);
    if (!r) continue;
    sumarEmpresa(r.ficha.id);
    if (r.porHubspot) porHubspot.set(d, r.ficha.id);
  }

  /* «Teamnet: Propuesta Web»: el corte del match por título no corta en «:» ni «/» (cambiarlo movería el resto de la
     cascada, ver `palabrasParaLaMarca`). Este paso es nuevo y no tiene nada que mover: aquí sí se cortan. */
  const conElTituloCortado = { ...session, title: session.title.replace(/[:/]/g, " ") };

  /* Si el título nombra a una ficha que NO está entre las candidatas (ni ninguna de su empresa), este paso se hace a un
     lado y sigue la cascada de siempre. *Por qué* (revisión del 25 nov): un consultor confirmado en «Alfa» que va a
     «Bravo | Kickoff» con gente de un dominio sin ficha se llevaba la reunión de Bravo a Alfa, porque Bravo no era
     candidata: la invariante 1 al revés. Con la cascada de siempre, el título (paso 6) la da a Bravo, como antes. */
  const ambiguous = ctx.ambiguousNameTokens ?? EMPTY_TOKEN_SET;
  const t = findClientByTitleMatch(conElTituloCortado.title, ctx.clients, ambiguous, ctx.internalDomains);
  const nombradas = t.cliente ? [t.cliente] : t.motivo === "empate" ? t.candidatos : [];
  if (nombradas.some((c) => !casa(c) && !ids.has(c.id))) return null;
  if (!ctx.clients.some((c) => ids.has(c.id) && !esEmpresa(c))) return null;

  /* La empresa (2026-11-26) nunca es candidata: es la llave de sus unidades. */
  const candidatas = ctx.clients.filter((c) => ids.has(c.id) && !esEmpresa(c));
  const porDominio = unidadesPorDominio(candidatas, ctx.clients);
  for (const [d, id] of porHubspot) {
    if (porDominio.has(d)) continue;
    const c = porId.get(id)!;
    const viven = c.comparteDominioConId ? [] : candidatas.filter((u) => u.comparteDominioConId === c.id && viveEnElDominioDeLaPrincipal(u));
    porDominio.set(d, new Set([...(esEmpresa(c) ? [] : [c.id]), ...viven.map((u) => u.id)]));
  }

  const d = decidirEntre(conElTituloCortado, candidatas, { ...ctx, interlocutoresConfirmados: confirmadas }, porDominio);
  const elegida = d.clientId ? porId.get(d.clientId) : undefined;
  if (elegida) return { grupo: { kind: "client", id: elegida.id, label: elegida.name, company: elegida.company }, por: d.por };
  /* No se pudo decidir (el título nombra a las dos, gente de las dos, o solo gente del grupo): si las candidatas son un
     solo grupo de la gente confirmada, la dueña del proyecto (Elías, 26 nov: «Sprint semanal | Teamnet y Sas» y «Health
     Score Team» se quedan en Teamnet). */
  const duena = duenaDelProyectoDelGrupo(
    candidatas.map((c) => c.id),
    ctx,
  );
  if (duena) return { grupo: { kind: "client", id: duena.id, label: duena.name, company: duena.company }, por: "duena-del-proyecto" };
  return {
    grupo: { kind: "orphan", label: `Por decidir: ${candidatas.map((e) => e.name).join(" o ")}`, domain: [...externalDomains][0] },
    por: d.por,
  };
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
  traza?: TrazaDeLaCascada,
): SessionGroup | null {
  const entidades = entidadesDelDominio(clientId, ctx);
  if (!entidades) return null;
  const d = decidirEntreEntidades(session, entidades, ctx);
  if (traza) traza.entre = d.por;
  const elegida = d.clientId ? entidades.find((e) => e.id === d.clientId) : undefined;
  if (elegida) return { kind: "client", id: elegida.id, label: elegida.name, company: elegida.company };
  /* En una empresa que solo agrupa, lo que no se puede decidir es de la unidad con el proyecto más antiguo (27 nov). */
  const duena = duenaDelProyectoDelGrupo(
    entidades.map((e) => e.id),
    ctx,
  );
  if (duena) {
    if (traza) traza.entre = "duena-del-proyecto";
    return { kind: "client", id: duena.id, label: duena.name, company: duena.company };
  }
  const cabeza = ctx.clients.find((c) => c.id === clientId && esEmpresa(c));
  const delGrupo = new Set([...entidades, ...(cabeza ? [cabeza] : [])].flatMap((e) => effectiveDomainsForClient(e)));
  const dominio = [...externalDomains].find((x) => delGrupo.has(x)) ?? [...externalDomains][0];
  return { kind: "orphan", label: `Por decidir: ${entidades.map((e) => e.name).join(" o ")}`, domain: dominio };
}

// ── Lo de HubSpot de una empresa, a su unidad (2026-11-26) ─────────────────────────────────────────────────────────────

/** Las unidades de una ficha de tipo Empresa (en el orden de la lista), o null si `empresaId` no es una con unidades. */
export function unidadesDeLaEmpresaArriba<C extends ConEmpresa>(empresaId: string, clients: readonly C[]): readonly C[] | null {
  const empresa = clients.find((c) => c.id === empresaId);
  if (!esEmpresa(empresa)) return null;
  const grupo = gruposDeEntidades(clients).get(empresaId);
  return grupo?.length ? grupo : null;
}

/**
 * A qué unidad va UNA fila que llega de la empresa de HubSpot de una empresa con unidades: un contacto, un correo, una
 * nota, una llamada, un ticket o un negocio. Se lee como una reunión, con la regla de siempre entre unidades
 * (`decidirEntreEntidades`): el asunto o el nombre del negocio es el título y sus contactos son la gente (la confirmada
 * primero, después su dominio y lo aprendido de los títulos). Devuelve la unidad, o null: la fila queda en la empresa,
 * donde no la lee ningún agente, hasta que alguien confirme a la persona en Interlocutores. PURO.
 * *Por qué la misma regla que las reuniones:* una sola definición de «de qué unidad es» (invariante 2). Elías, 26 nov: lo
 * que no tiene unidad queda en la empresa; nunca se adivina.
 */
export function unidadDeLoDeHubspot(
  empresaId: string,
  fila: { titulo: string | null; correos: readonly (string | null | undefined)[] },
  ctx: CategorizeContext,
): string | null {
  const unidades = unidadesDeLaEmpresaArriba(empresaId, ctx.clients);
  if (!unidades) return null;
  const session: CategorizableSession = {
    title: fila.titulo ?? "",
    participants: fila.correos.filter((c): c is string => !!c?.trim()).map((c) => c.trim().toLowerCase()),
    manualClientId: null,
  };
  return decidirEntreEntidades(session, unidades, ctx).clientId;
}

/**
 * La unidad de un PROYECTO nuevo de HubSpot de una empresa con unidades: la que nombra lo que abre su nombre, antes del
 * primer «|» («AE | Reimplementación», «TEC TAE | CRM»). Sin «|», o si no nombra a una sola: null, y el proyecto queda en
 * la empresa con el aviso «Elige su unidad» (Elías, 26 nov). PURO.
 */
export function unidadPorLasSiglas<C extends ConEmpresa>(
  nombreDelProyecto: string,
  empresaId: string,
  clients: readonly C[],
  ambiguous: ReadonlySet<string> = EMPTY_TOKEN_SET,
): string | null {
  const unidades = unidadesDeLaEmpresaArriba(empresaId, clients);
  if (!unidades) return null;
  const corte = nombreDelProyecto.indexOf("|");
  if (corte <= 0) return null;
  return unidadQueNombraElTitulo(nombreDelProyecto.slice(0, corte), unidades, ambiguous).clientId;
}

/**
 * Lo que un título tiene que traer para poder nombrar a una de estas fichas: sus siglas y las palabras de su nombre.
 * Va en minúsculas, normalizado y tal como se escribe (la consulta de la base no quita acentos).
 */
export function pistasDeTitulo(
  clients: readonly ClienteDelCtx[],
  ambiguous: Set<string> = EMPTY_TOKEN_SET,
  /* Todas las fichas, para armar el grupo de cada una: con la empresa arriba (2026-11-26), la cabeza del grupo no está en
     una lista de unidades, y sin ella «cr» y «ec» saldrían como pistas solas. */
  todas: readonly ClienteDelCtx[] = clients,
): string[] {
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || ambiguous.has(w);
  const out = new Set<string>();
  const grupos = gruposDeEntidades(todas);
  for (const c of clients) {
    /* La empresa no se nombra por título: su nombre no es pista. */
    if (esEmpresa(c)) continue;
    /* En una empresa con marca, la sigla vale solo junto a la marca, que ya es pista: como pista sola, «cr» y «ec» traen
       casi toda la tabla («CRM», «proyecto») en cada armado del contexto (revisión del 8 nov). */
    const grupo = grupos.get(c.id);
    const siglaSola = !grupo || marcaDelGrupo(grupo).size === 0;
    if (siglaSola) for (const s of c.siglas ?? []) out.add(normalize(s).replace(/\s+/g, ""));
    for (const t of tokensDelCliente(c, skip, normalize).todos) out.add(t);
    for (const p of `${c.name} ${c.company ?? ""}`.toLowerCase().split(/[\s.\-_]+/)) {
      if (p.length >= 4 && !skip(normalize(p))) out.add(p);
    }
  }
  return [...out].filter((p) => p.length >= 2);
}

/**
 * La gente de cada entidad, aprendida SOLO del NOMBRE de las reuniones. Tres cosas que no enseñan, a propósito:
 *  · lo que decidió la gente: un error no se alimenta a sí mismo;
 *  · lo materializado (`resolvedClientId`): el resultado es el mismo antes y después de re-resolver;
 *  · lo asignado a mano: `reResolveSession` escribe solo esa reunión, y si la asignación enseñara, cambiaría el dueño de
 *    otras reuniones sin que nadie las vuelva a resolver (medido: asignar una por decidir movía 5).
 * Quien estuvo en reuniones de las dos cuenta para la que tiene al menos el doble: una reunión cruzada no borra a una
 * persona que lleva decenas en la otra. Parejo, no cuenta.
 * PURO: el caller le pasa las reuniones (resolve-client.ts carga las que traen una pista; /sessions ya las tiene todas).
 */
export function aprenderPersonasDeEntidades(
  sessions: readonly CategorizableSession[],
  ctx: CategorizeContext,
): Map<string, string> {
  const grupos = gruposDeEntidades(ctx.clients);
  if (grupos.size === 0) return new Map();
  /* Sin la gente aprendida NI la confirmada: lo aprendido sale solo del título, y confirmar a alguien no cambia lo que
     Nexus aprende de los demás (la gente confirmada ya decide por su cuenta, en el paso 3·0). */
  const sinGente: CategorizeContext = { ...ctx, personasDeEntidades: undefined, interlocutoresConfirmados: undefined };
  const pistas = pistasDeTitulo(ctx.clients.filter((c) => grupos.has(c.id) && !esEmpresa(c)), ctx.ambiguousNameTokens, ctx.clients);
  const visto = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    /* Sin ninguna pista en el título no hay nombre que decida: se ahorra la cascada entera (es por reunión). */
    const titulo = normalize(s.title);
    if (!pistas.some((p) => titulo.includes(p))) continue;
    const sinMano = { ...s, manualClientId: null };
    const g = categorizeSession(sinMano, sinGente);
    if (g.kind !== "client" || !grupos.has(g.id) || decidirEntreEntidades(sinMano, grupos.get(g.id)!, sinGente).por !== "nombre") continue;
    for (const correo of correosDeAfuera(s.participants, ctx.internalDomains)) {
      const cuentas = visto.get(correo) ?? new Map<string, number>();
      visto.set(correo, cuentas.set(g.id, (cuentas.get(g.id) ?? 0) + 1));
    }
  }
  const out = new Map<string, string>();
  for (const [correo, cuentas] of visto) {
    const [primera, segunda] = [...cuentas].sort((a, b) => b[1] - a[1]);
    if (primera && (!segunda || primera[1] >= segunda[1] * 2)) out.set(correo, primera[0]);
  }
  return out;
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Categoriza una sesión según la cascada documentada arriba.
 * NUNCA retorna null — siempre cae a "orphan" en el peor caso.
 */
export function categorizeSession(
  session: CategorizableSession,
  ctx: CategorizeContext,
  traza?: TrazaDeLaCascada,
): SessionGroup {
  const { clients, categories, hubspotCompaniesByDomain, internalDomains } = ctx;
  const ambiguous = ctx.ambiguousNameTokens ?? EMPTY_TOKEN_SET;
  const paso = (p: PasoDeLaCascada) => {
    if (traza) traza.paso = p;
  };

  // ── 1. Manual override ─────────────────────────────────────────────────────
  if (session.manualClientId) {
    const c = clients.find((cl) => cl.id === session.manualClientId);
    /* Asignada a mano a una EMPRESA (ninguna pantalla lo ofrece): no es dueña, la cascada sigue y reparte (2026-11-26). */
    if (c && !esEmpresa(c)) {
      paso("a-mano");
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
    paso("interna-por-titulo");
    const porTitulo = duenoPorElTitulo(session, externalDomains, ctx, ambiguous, traza);
    if (porTitulo) return porTitulo;
    // Sin match por título → grupo Internal real
    paso("interna");
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

  // ── 3·0. La gente confirmada (2026-11-25) ──────────────────────────────────
  // Solo si alguien de afuera está confirmado por el equipo en una ficha: decide entre sus fichas y las de los
  // dominios de la reunión (título → gente confirmada → dominio y lo aprendido → por decidir). Sin nadie confirmado,
  // devuelve null y la cascada sigue idéntica. Ver `decisionDeLaGenteConfirmada`.
  const porLaGente = decisionDeLaGenteConfirmada(session, externalDomains, ctx);
  if (porLaGente) {
    paso("gente-confirmada");
    if (traza) traza.entre = porLaGente.por;
    return porLaGente.grupo;
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
      paso("dominio");
      return duenoDeLaFicha(c, session, externalDomains, ctx, traza);
    }
  }

  // ── 4. Match con SessionCategory.domains (no internal) ────────────────────
  for (const cat of categories) {
    if (cat.kind === "internal") continue; // ya cubierto en paso 2
    const hit = cat.domains.some((d) => externalDomains.has(d.toLowerCase()));
    if (hit) {
      paso("categoria");
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
      paso("hubspot");
      return duenoDeLaFicha(linkedClient, session, externalDomains, ctx, traza);
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
    paso("empresa-de-hubspot-sin-ficha");
    return {
      kind: "hubspotCompany",
      id: unlinkedCompany.id,
      label: unlinkedCompany.name || unlinkedCompany.domain,
      domain: unlinkedCompany.domain,
    };
  }

  // ── 6. Title matching con Client (fallback débil) ─────────────────────────
  paso("titulo");
  const porTitulo = duenoPorElTitulo(session, externalDomains, ctx, ambiguous, traza);
  if (porTitulo) return porTitulo;

  // ── 7. Orphan ─────────────────────────────────────────────────────────────
  paso("sin-dueno");
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
