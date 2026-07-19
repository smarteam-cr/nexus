/**
 * lib/external/snapshot-normalize.ts
 *
 * Saneo de los SNAPSHOTS CONGELADOS que lee la superficie externa — puro, sin
 * Prisma, client-safe.
 *
 * POR QUÉ EXISTE: `publishedSnapshot` es un Json congelado en el momento de
 * publicar. El shape del snapshot evolucionó con el producto, y quedaron
 * snapshots viejos donde una sección no trae el array `blocks` (o el timeline
 * no trae `phases`). El código los leía con un cast crudo (`as unknown as`) y
 * accedía `s.blocks.map(...)` → **TypeError en producción, EN LA PÁGINA QUE VEN
 * LOS CLIENTES** (/external/kickoff, ~70 eventos en Sentry durante una semana;
 * el primer crash era `comparaSectionHasContent` → `row.blocks.find`).
 *
 * Dónde se normaliza: en el CHOKEPOINT de lectura (kickoff-view / timeline-view),
 * no en cada consumidor. El adapter de render lo comparte el editor interno, que
 * lo alimenta con filas vivas de Prisma (siempre traen `blocks` por el select) —
 * defensividad ahí sería ruido.
 *
 * Reglas:
 *  - raw no-objeto (null, string corrupto…) → `null` → el caller dispara el
 *    BACKFILL PEREZOSO que ya existe (re-congela desde el vivo): auto-curación.
 *  - arrays ausentes/corruptos → `[]`; ítems basura → descartados.
 *  - Lo válido pasa INTACTO. Esto solo defaultea estructura; jamás convierte un
 *    fallo de acceso en datos — el modelo fail-closed del chokepoint no se toca.
 */

export interface SnapshotBlock {
  id?: string;
  blockType: string;
  content?: string | null;
  data?: unknown;
}

export interface SnapshotSection {
  id: string;
  key: string;
  label: string;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  order: number;
  blocks: SnapshotBlock[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function normalizeBlock(raw: unknown): SnapshotBlock | null {
  if (!isObj(raw) || typeof raw.blockType !== "string") return null;
  return {
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    blockType: raw.blockType,
    content: typeof raw.content === "string" ? raw.content : null,
    data: raw.data,
  };
}

function normalizeSection(raw: unknown): SnapshotSection | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.key !== "string") return null;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.map(normalizeBlock).filter((b): b is SnapshotBlock => b !== null)
    : []; // ← EL FIX: snapshots viejos sin `blocks` dejaban de renderizar la página entera
  return {
    id: raw.id,
    key: raw.key,
    label: typeof raw.label === "string" ? raw.label : raw.key,
    titleOverride: typeof raw.titleOverride === "string" ? raw.titleOverride : null,
    eyebrowOverride: typeof raw.eyebrowOverride === "string" ? raw.eyebrowOverride : null,
    order: typeof raw.order === "number" ? raw.order : 0,
    blocks,
  };
}

/**
 * Snapshot del canvas de KICKOFF. `null` = no hay snapshot usable → el caller
 * corre su backfill perezoso (congela el vivo). Nunca lanza.
 */
export function normalizeKickoffSnapshot(raw: unknown): {
  sections: SnapshotSection[];
  procesos: Array<Record<string, unknown> & { id: string }>;
} | null {
  if (!isObj(raw)) return null;
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map(normalizeSection).filter((s): s is SnapshotSection => s !== null)
    : [];
  const procesos = Array.isArray(raw.procesos)
    ? raw.procesos.filter(
        (p): p is Record<string, unknown> & { id: string } => isObj(p) && typeof p.id === "string",
      )
    : [];
  return { sections, procesos };
}

/**
 * Snapshot del TIMELINE publicado — mismo riesgo hermano: el read vivo guarda
 * `(tl?.phases ?? [])` pero el congelado se devolvía con cast crudo; un snapshot
 * sin `phases` reventaba al consumidor. Devuelve SIEMPRE un shape usable.
 */
export function normalizePublishedTimeline(raw: unknown): {
  exists: boolean;
  anchorStartDate: string | null;
  phases: Array<Record<string, unknown>>;
  particularidades?: Array<Record<string, unknown>>;
} {
  if (!isObj(raw)) return { exists: false, anchorStartDate: null, phases: [] };
  const phases = Array.isArray(raw.phases) ? raw.phases.filter(isObj) : [];
  const out: ReturnType<typeof normalizePublishedTimeline> = {
    exists: raw.exists !== false,
    anchorStartDate: typeof raw.anchorStartDate === "string" ? raw.anchorStartDate : null,
    phases,
  };
  // `particularidades` es opcional en el shape (snapshots pre-feature no la
  // traen y el render trata undefined como []) — solo se emite si es un array.
  if (Array.isArray(raw.particularidades)) {
    out.particularidades = raw.particularidades.filter(isObj);
  }
  return out;
}
