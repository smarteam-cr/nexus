/**
 * lib/utils/matching.ts
 *
 * Utilidades compartidas de matching de clientes por nombre/dominio.
 * Fuente canónica: lib/fireflies/sync.ts
 */

const LEGAL_SUFFIXES = new Set([
  "sa", "s.a", "s.a.", "sas", "s.a.s", "corp", "inc", "ltd", "ltda",
  "co", "llc", "grupo", "group",
  "de", "del", "la", "el", "los", "las", "and", "y", "the",
  "com", "net", "org", "edu", "gov", "io", "app",
  "cr", "mx", "pa", "pe", "ar", "cl", "ve", "co", "gt", "hn", "ni", "sv",
]);

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function extractTitleTerms(raw: string): string[] {
  return normalize(raw)
    .split(/[\s,.|&+()\-/\\]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !LEGAL_SUFFIXES.has(t));
}

export function extractDomain(company: string): string | null {
  const raw = company.trim();
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
    }
    const cleaned = raw.toLowerCase().replace(/^www\./, "");
    if (/^[\w-]+(\.[\w-]+)+$/.test(cleaned)) return cleaned;
  } catch { /* URL inválida */ }
  return null;
}
