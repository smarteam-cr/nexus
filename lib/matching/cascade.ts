/**
 * lib/matching/cascade.ts
 *
 * Matcher unificado con cascada para asociar sesiones Fireflies a clientes.
 *
 * Señales (OR):
 *   - Título: TODOS los tokens del nombre del cliente aparecen en el título
 *   - Cascada (se detiene al primer match):
 *     1. Dominio: email de participante externo @dominio del cliente
 *     2. Contactos empresa: email de participante ∈ contactos HubSpot de la empresa
 *     3. Contactos deal: email de participante ∈ contactos HubSpot de los deals
 */

import { normalize, extractTitleTerms, tokenizeTitle, extractEmail } from "@/lib/utils/matching";
import type { RawTranscript } from "@/lib/utils/matching";
import type { EnrichedClientData } from "./enrichment";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface EnrichedClientMatcher {
  clientId: string;
  name: string;
  titleTerms: string[];
  enriched: EnrichedClientData;
}

// ── Matcher para un solo cliente ──────────────────────────────────────────────

export function sessionMatchesClient(
  // Solo usa título + participantes — el Pick permite pasar filas de
  // FirefliesSession directamente sin casts (los callers no tienen id/date/duration).
  session: Pick<RawTranscript, "title" | "participants">,
  matcher: EnrichedClientMatcher,
  teamEmails?: Set<string>
): boolean {
  // Título: TODOS los tokens deben estar presentes
  const titleTokens = tokenizeTitle(session.title ?? "");
  const byTitle =
    matcher.titleTerms.length > 0 &&
    matcher.titleTerms.every((term) => titleTokens.has(term));

  if (byTitle) return true;

  // Participantes externos (excluir equipo interno si se proporciona)
  const participants = teamEmails
    ? session.participants.filter(
        (p) => !teamEmails.has(normalize(extractEmail(p)))
      )
    : session.participants;

  // Cascada nivel 1: Dominio
  if (matcher.enriched.domains.size > 0) {
    for (const p of participants) {
      const email = extractEmail(p);
      const atIdx = email.lastIndexOf("@");
      if (atIdx === -1) continue;
      const emailDomain = email.slice(atIdx + 1);
      if (matcher.enriched.domains.has(emailDomain)) return true;
    }
  }

  // Cascada nivel 2: Contactos de empresa
  if (matcher.enriched.companyContactEmails.size > 0) {
    for (const p of participants) {
      if (matcher.enriched.companyContactEmails.has(extractEmail(p))) return true;
    }
  }

  // Cascada nivel 3: Contactos de deals
  if (matcher.enriched.dealContactEmails.size > 0) {
    for (const p of participants) {
      if (matcher.enriched.dealContactEmails.has(extractEmail(p))) return true;
    }
  }

  return false;
}

// ── Matcher multi-cliente (para sync y check-new) ─────────────────────────────

export function sessionMatchesAnyClient(
  session: RawTranscript,
  matchers: EnrichedClientMatcher[]
): boolean {
  for (const m of matchers) {
    if (sessionMatchesClient(session, m)) return true;
  }
  return false;
}
