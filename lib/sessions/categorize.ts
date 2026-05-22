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
 *   5. Lookup en HubSpot Companies (por dominio externo)
 *   6. Title-word match con Client.name/company (fallback débil, ≥4 chars)
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
 */
function effectiveDomainsForClient(
  c: Pick<Client, "emailDomains" | "company">
): string[] {
  const explicit = (c.emailDomains ?? []).map((d) => d.toLowerCase());
  const fromCompany = extractDomainFromCompany(c.company);
  if (fromCompany && !explicit.includes(fromCompany)) {
    return [...explicit, fromCompany];
  }
  return explicit;
}

/**
 * Title-matching: busca un cliente cuyo nombre o company aparezca como token
 * (palabra >= 4 chars) en el título de la sesión. Match débil, primero que
 * matchee gana.
 */
function findClientByTitleMatch(
  title: string,
  clients: Pick<Client, "id" | "name" | "company">[]
): Pick<Client, "id" | "name" | "company"> | null {
  const titleWords = new Set(
    normalize(title)
      .split(/[\s|&,.()\[\]!?*\-_]+/)
      .filter((w) => w.length >= 4)
  );
  if (titleWords.size === 0) return null;

  return (
    clients.find((c) => {
      const nameParts = normalize(c.name)
        .split(/\s+/)
        .filter((p) => p.length >= 4);
      const compParts = c.company
        ? normalize(c.company)
            .split(/[\s.\-_]+/)
            .filter((p) => p.length >= 4)
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
    const titleMatchedClient = findClientByTitleMatch(session.title, clients);
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

  // ── 5. Lookup HubSpot Companies (por dominio externo) ─────────────────────
  for (const domain of externalDomains) {
    const company = hubspotCompaniesByDomain.get(domain);
    if (company) {
      return {
        kind: "hubspotCompany",
        id: company.id,
        label: company.name || company.domain,
        domain: company.domain,
      };
    }
  }

  // ── 6. Title matching con Client (fallback débil) ─────────────────────────
  const titleMatched = findClientByTitleMatch(session.title, clients);
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
