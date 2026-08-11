/**
 * lib/timeline/phase-identity.ts
 *
 * ¿ESTA FASE PROPUESTA ES, EN REALIDAD, ESTA FASE EXISTENTE HUÉRFANA CON OTRO NOMBRE?
 * Pura, sin Prisma. La usa `reconcileAgentProposal` para el caso en que el nombre exacto
 * normalizado no matchea Y la posición tampoco — ahí es donde el modo aditivo genera
 * duplicados reales si nadie avisa (confirmado en Wherex, 2026-08: "Integraciones" y
 * "Desarrollo / Integración" coexistiendo como dos fases, mismo trabajo real).
 *
 * NO fusiona nada acá: devuelve la MEJOR huérfana candidata para que reconcileAgentProposal la
 * cuelgue como `mergeCandidateId` — un AVISO que el CSE confirma con el botón "Fusionar" en el
 * canvas. Mismo principio que lib/clients/gemelas.ts: un aviso de más cuesta un segundo de
 * lectura; una fase duplicada no vista queda para siempre. Fusionar en silencio sería PEOR que
 * el duplicado: pisaría una fase real con datos de otra.
 *
 * Mismo idioma que lib/timeline/particularidad-identity.ts (token-overlap) combinado con el
 * umbral de lib/clients/gemelas.ts (prefijo con piso de longitud) — no hay Levenshtein en todo
 * el repo, y es lo que hace falta acá: "Integraciones" vs "Desarrollo / Integración" tokenizan
 * a `[integraciones]` vs `[desarrollo, integracion]` — CERO tokens iguales (singular/plural),
 * necesita comparar por prefijo, no por igualdad exacta.
 *
 * Trade-off deliberado del umbral: los tokens de menos de MIN_TOKEN_LEN quedan afuera del
 * puntaje. Es lo que evita que "Sales Hub" y "Service Hub" (comparten "Hub", 3 chars) se
 * marquen como la misma fase — y, como efecto colateral aceptado, también evita que acrónimos
 * cortos ("SAP", "CRM") disparen un match por sí solos. No se puede tener las dos cosas con un
 * solo umbral de longitud; el caso que hay que evitar decide cuál sacrificar.
 */

const MIN_TOKEN_LEN = 5;

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TOKEN_LEN);
}

/** ¿Dos tokens son "la misma palabra" con redacción distinta? Igual, o uno prefijo largo del
 *  otro (cubre singular/plural: "integracion"/"integraciones"). */
function tokensMatch(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function overlapScore(a: string[], b: string[]): number {
  let score = 0;
  for (const ta of a) if (b.some((tb) => tokensMatch(ta, tb))) score++;
  return score;
}

/** ¿"a" y "b" describen probablemente el mismo trabajo? Un solo token parecido alcanza — con
 *  el piso de longitud ya aplicado, un token real compartido es señal, no ruido. */
export function phaseNamesLikelySameWork(a: string, b: string): boolean {
  return overlapScore(tokens(a), tokens(b)) >= 1;
}

export interface OrphanPhase {
  id: string;
  name: string;
}

/**
 * La mejor huérfana para `proposedName`, o null si ninguna llega al umbral. Determinístico:
 * ante empate de puntaje, gana la primera en el orden de `orphans` (el orden real de fases).
 */
export function findBestOrphanMatch(
  proposedName: string,
  orphans: readonly OrphanPhase[],
): OrphanPhase | null {
  const pTokens = tokens(proposedName);
  if (pTokens.length === 0) return null;
  let best: OrphanPhase | null = null;
  let bestScore = 0;
  for (const o of orphans) {
    const score = overlapScore(pTokens, tokens(o.name));
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return bestScore >= 1 ? best : null;
}
