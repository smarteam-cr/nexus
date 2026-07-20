/**
 * components/landing/build-landing.ts
 *
 * Núcleo GENÉRICO de los adaptadores canvas→motor: construye la `LandingConfig`
 * (hero primero, cola pinneada al final, contenido en el orden vivo en el medio)
 * y el `data` por sección (CARD tipada | fallback `{__legacyMd}` + overrides del
 * hero) para cualquier documento que guarde su contenido en CanvasBlock.
 *
 * Nació de-duplicando kickoff-landing-adapter y desarrollo-landing-adapter, que
 * eran el mismo algoritmo dos veces. Los adaptadores por tipo conservan SOLO su
 * particularidad (kickoff: secciones ctx-driven + de-dup de `compara`) y delegan
 * el núcleo acá. Un tipo de documento nuevo sobre CanvasBlock arranca por este
 * archivo — regla en ARCHITECTURE §1-WEB.
 *
 * Puro y server-safe (sin React runtime): lo importan componentes cliente
 * (workspaces) y server components (páginas externas).
 */
import type { LandingConfig, SectionDef } from "./types";

/** Fila de sección tal como llega del hook (vivo) o del snapshot (externo). */
export interface LandingSectionRow {
  key: string;
  titleOverride?: string | null;
  eyebrowOverride?: string | null;
  blocks: Array<{ blockType: string; content?: string | null; data?: unknown }>;
}

/** La forma de un tipo de documento: sus defs completas + qué abre y qué cierra. */
export interface LandingShape {
  /** `LandingConfig.type` ("kickoff", "desarrollo", …). */
  type: string;
  /** TODAS las defs del template (el orden acá no importa; manda `orderedKeys`). */
  allDefs: SectionDef[];
  /** Key del hero — SIEMPRE abre la página, fuera del orden arrastrable. */
  heroKey: string;
  /** Keys pinneadas al cierre, en este orden — fuera del orden arrastrable. */
  pinnedTail: readonly string[];
}

/**
 * Config: hero primero, `pinnedTail` al final, y en el medio las secciones de
 * CONTENIDO presentes en `orderedKeys`, en ese orden (el vivo o el del snapshot).
 * Una key de `orderedKeys` sin def se ignora (typo/sección retirada: mejor
 * omitirla que reventar el render del cliente).
 */
export function buildLandingConfigFromOrder(shape: LandingShape, orderedKeys: string[]): LandingConfig {
  const idx = new Map(orderedKeys.map((k, i) => [k, i]));
  const hero = shape.allDefs.filter((d) => d.key === shape.heroKey);
  const tail = shape.pinnedTail
    .map((k) => shape.allDefs.find((d) => d.key === k))
    .filter((d): d is SectionDef => !!d);
  const content = shape.allDefs
    .filter((d) => d.key !== shape.heroKey && !shape.pinnedTail.includes(d.key) && idx.has(d.key))
    .sort((a, b) => (idx.get(a.key) ?? 0) - (idx.get(b.key) ?? 0));
  return { type: shape.type, sections: [...hero, ...content, ...tail] };
}

/**
 * `data` de una sección para el motor: bloque CARD → su `data` tipada; si no hay
 * CARD → `{__legacyMd}` con el markdown de los bloques TEXT viejos (fallback
 * read-only). Para el hero, inyecta titleOverride/eyebrowOverride como
 * headline/eyebrow (los documentos viejos guardaban el título del hero en los
 * overrides de sección) — sin pisar lo que la data tipada ya trae.
 */
export function landingRowData(row: LandingSectionRow, heroKey: string): unknown {
  const cardBlock = row.blocks.find((b) => b.blockType === "CARD");
  let data: unknown;
  if (cardBlock) {
    data = cardBlock.data ?? {};
  } else {
    const md = row.blocks.map((b) => b.content).filter(Boolean).join("\n\n");
    data = { __legacyMd: md || null };
  }
  if (row.key === heroKey) {
    const dd = (data ?? {}) as Record<string, unknown>;
    data = {
      ...dd,
      headline: dd.headline ?? row.titleOverride ?? undefined,
      eyebrow: dd.eyebrow ?? row.eyebrowOverride ?? undefined,
    };
  }
  return data;
}
