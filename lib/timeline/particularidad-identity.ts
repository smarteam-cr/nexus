/**
 * lib/timeline/particularidad-identity.ts
 *
 * IDENTIDAD DE UN HECHO — funciones puras, sin Prisma. Espeja el patrón que ya usa el watchdog de
 * Éxito del cliente (`lib/cs/watchdog.ts`), que corre repetido sobre el mismo proyecto sin duplicar.
 *
 * El problema que resuelve: el agente de avance re-deriva las particularidades desde los MISMOS
 * transcripts en cada corrida (26 corridas en un proyecto real), con la redacción apenas distinta.
 * Sin una identidad estable, aceptar dos borradores creaba dos filas del mismo hecho — y el
 * corrimiento se contaba dos veces (Wherex mostraba 13 semanas cuando eran 8).
 *
 * La huella la emite el AGENTE ("si el mismo hecho persiste mañana, usá la MISMA huella") y se le
 * devuelve en el contexto de la corrida siguiente para que la reuse. Si no la manda, se deriva del
 * título de forma determinística — peor, pero mejor que nada.
 */

/** Separador del dedupeKey. Ni los cuid ni los kind lo contienen, así que el split es seguro. */
const SEP = ":";

/**
 * Huella determinística derivada del título. Fallback para cuando el agente no manda una (o para
 * particularidades creadas a mano). Normaliza acentos/puntuación para que dos redacciones que solo
 * difieren en tildes o signos caigan en la misma huella.
 */
export function fingerprintFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Sanea la huella que manda el agente (mismo shape que el fallback, tope de largo). */
export function normalizeFingerprint(raw: unknown, fallbackTitle: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return fingerprintFromTitle(fallbackTitle);
  const clean = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return clean || fingerprintFromTitle(fallbackTitle);
}

/**
 * Clave de dedup: `timelineId:kind:huella`. Se scopea al TIMELINE (no al proyecto) porque la
 * particularidad cuelga del timeline, y se incluye el `kind` para que un mismo hecho reportado como
 * ATRASO y como COMPROMISO sean cosas distintas (lo son: uno movió una fecha, el otro la fijó).
 */
export function buildDedupeKey(timelineId: string, kind: string, fingerprint: string): string {
  return [timelineId, kind, fingerprint].join(SEP);
}

/** La huella suelta a partir del dedupeKey (lo que se le muestra al agente para que la reuse). */
export function extractFingerprint(dedupeKey: string | null | undefined): string | null {
  if (!dedupeKey) return null;
  const parts = dedupeKey.split(SEP);
  return parts.length >= 3 ? parts.slice(2).join(SEP) : null;
}

const STOP_DUP = new Set(["para", "que", "con", "los", "las", "del", "una", "por", "sobre", "entre", "como", "sus", "este", "esta"]);

/** Tokens significativos de un título, para comparar dos redacciones del mismo hecho. */
function titleTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !STOP_DUP.has(w)),
  );
}

/** Lo mínimo que necesita el detector de repetidas. */
export interface DuplicateCandidate {
  id: string;
  kind: string;
  title: string;
  weeksImpact?: number | null;
  sourceQuote?: string | null;
  party?: string | null;
  occurredAt?: string | Date | null;
}

/**
 * Agrupa las filas que describen el MISMO hecho con redacción distinta. Heurística de títulos
 * (≥3 tokens compartidos) dentro del mismo `kind` — la misma que usan el apply y el script de saneo.
 *
 * Ésta es la ÚNICA definición de "repetida" del sistema. Antes estaba escrita tres veces (acá, en el
 * apply y en el script), y si divergían el panel decía "2 repetidas" y el modal mostraba 3.
 *
 * Devuelve solo los grupos de 2+; los únicos no son un grupo.
 */
export function findDuplicateGroups<T extends DuplicateCandidate>(parts: T[]): T[][] {
  const grupos: Array<{ kind: string; tokens: Set<string>; items: T[] }> = [];
  for (const p of parts) {
    const t = titleTokens(p.title);
    const g = grupos.find((gr) => gr.kind === p.kind && [...gr.tokens].filter((w) => t.has(w)).length >= 3);
    if (g) {
      for (const w of t) g.tokens.add(w);
      g.items.push(p);
    } else {
      grupos.push({ kind: p.kind, tokens: t, items: [p] });
    }
  }
  return grupos.filter((g) => g.items.length > 1).map((g) => g.items);
}

/**
 * Cuál de las repetidas sobrevive a la fusión: la de más semanas → la que trae cita → la de
 * atribución más específica (AMBOS y vacío son las menos informativas) → la más reciente.
 * Mismo criterio que `scripts/merge-particularidades-duplicadas.ts`, ahora en un solo lugar.
 */
export function pickMergeWinner<T extends DuplicateCandidate>(group: T[]): T {
  const specificity = (party?: string | null) => (!party ? 0 : party === "AMBOS" ? 1 : 2);
  const time = (d?: string | Date | null) => (d ? new Date(d).getTime() : 0);
  return [...group].sort(
    (a, b) =>
      (b.weeksImpact ?? 0) - (a.weeksImpact ?? 0) ||
      Number(!!b.sourceQuote) - Number(!!a.sourceQuote) ||
      specificity(b.party) - specificity(a.party) ||
      time(b.occurredAt) - time(a.occurredAt),
  )[0];
}

/** Lo que el CSE necesita saber de las repetidas: cuántas VE y cuántos HECHOS tiene que resolver. */
export interface DuplicateSummary {
  /** Hechos distintos que están cargados más de una vez. Es lo que hay que resolver. */
  hechos: number;
  /** Filas involucradas (todas, no el excedente). Es lo que el CSE va a VER al abrir el grupo. */
  filas: number;
  /** Los ids de esas filas, con las del mismo hecho ADYACENTES — así el destino las muestra juntas. */
  ids: string[];
}

/**
 * Resumen de repetidas.
 *
 * Devuelve los DOS números a propósito. Antes esto era un `countDuplicateFacts` que contaba el
 * excedente (`length - 1`) mientras el grupo destino mostraba las filas totales (`.flat()`): con 3
 * filas del mismo hecho, el panel decía "2" y el grupo mostraba "3". Un contador que no coincide con
 * el lugar al que te lleva su propio botón es peor que no tener contador.
 */
export function summarizeDuplicates<T extends DuplicateCandidate>(parts: T[]): DuplicateSummary {
  const grupos = findDuplicateGroups(parts);
  const ids = grupos.flatMap((g) => g.map((p) => p.id));
  return { hechos: grupos.length, filas: ids.length, ids };
}
