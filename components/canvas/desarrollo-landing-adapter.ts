/**
 * components/canvas/desarrollo-landing-adapter.ts
 *
 * Adaptador COMPARTIDO entre el editor interno (DesarrolloWorkspace) y la página
 * externa (app/external/desarrollo): construye la `LandingConfig` y el `data` por
 * sección para el motor `LandingView`, IDÉNTICO en ambas superficies.
 *
 * Mucho más simple que el del kickoff: sin secciones ctxDriven (no hay cronograma/
 * procesos) ni de-dup de comparación. Solo: hero primero, cierre último, contenido
 * en el orden vivo en el medio.
 */
import type { LandingConfig, SectionDef } from "@/components/landing/types";
import { landingConfigForDesarrollo } from "@/components/landing/configs/desarrollo";

const DESARROLLO_HERO = "requerimiento";
export const DESARROLLO_PINNED_TAIL = ["cierre"] as const;

/** Fila de sección tal como llega del hook (vivo) o del snapshot (externo). */
export interface DesarrolloSectionRow {
  key: string;
  titleOverride?: string | null;
  eyebrowOverride?: string | null;
  blocks: Array<{ blockType: string; content?: string | null; data?: unknown }>;
}

/** Config: hero primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildDesarrolloConfig(orderedKeys: string[]): LandingConfig {
  const allDefs = landingConfigForDesarrollo().sections;
  const idx = new Map(orderedKeys.map((k, i) => [k, i]));
  const hero = allDefs.filter((d) => d.key === DESARROLLO_HERO);
  const tail = (DESARROLLO_PINNED_TAIL as readonly string[])
    .map((k) => allDefs.find((d) => d.key === k))
    .filter((d): d is SectionDef => !!d);
  const content = allDefs
    .filter(
      (d) =>
        d.key !== DESARROLLO_HERO &&
        !(DESARROLLO_PINNED_TAIL as readonly string[]).includes(d.key) &&
        idx.has(d.key),
    )
    .sort((a, b) => (idx.get(a.key) ?? 0) - (idx.get(b.key) ?? 0));
  return { type: "desarrollo", sections: [...hero, ...content, ...tail] };
}

/** `data` de una sección para el motor: bloque CARD → su `data`; si no hay CARD →
 *  `{__legacyMd}` con el markdown de los bloques TEXT (fallback read-only). */
export function desarrolloSectionData(row: DesarrolloSectionRow): unknown {
  const cardBlock = row.blocks.find((b) => b.blockType === "CARD");
  let data: unknown;
  if (cardBlock) {
    data = cardBlock.data ?? {};
  } else {
    const md = row.blocks.map((b) => b.content).filter(Boolean).join("\n\n");
    data = { __legacyMd: md || null };
  }
  // El hero guardó (en algún flujo viejo) su título en los overrides de sección.
  if (row.key === DESARROLLO_HERO) {
    const dd = (data ?? {}) as Record<string, unknown>;
    data = {
      ...dd,
      headline: dd.headline ?? row.titleOverride ?? undefined,
      eyebrow: dd.eyebrow ?? row.eyebrowOverride ?? undefined,
    };
  }
  return data;
}

/** Filas → `data` por sección, para las DOS superficies (editor + externa). */
export function buildDesarrolloSections(rows: DesarrolloSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: desarrolloSectionData(r) }));
}
