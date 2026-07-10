/**
 * components/canvas/kickoff-landing-adapter.ts
 *
 * Adaptador COMPARTIDO entre el editor interno (KickoffWorkspace) y la página
 * externa del cliente (app/external/kickoff): construye la `LandingConfig` y el
 * `data` por sección para el motor `LandingView`, IDÉNTICO en ambas superficies
 * (el CSE ve exactamente lo que ve el cliente).
 *
 * Puro (sin React runtime): lo importa un componente cliente (workspace) y un
 * server component (página externa). Reusa el config del kickoff (kickoff.ts).
 */
import type { LandingConfig, SectionDef } from "@/components/landing/types";
import { landingConfigForKickoff } from "@/components/landing/configs/kickoff";
import { normalizeCompara } from "@/components/canvas/kickoff-sections/types";

/** Bookends de posición fija: el hero abre y el CTA cierra. Todo lo del medio se arrastra. */
const KICKOFF_HERO = "bienvenida";
export const KICKOFF_PINNED_TAIL = ["cierre"] as const;

/**
 * Secciones `ctxDriven` sin bloque: su contenido sale de `ctx.kickoff` (ProjectTimeline y
 * flowcharts), no de un CanvasBlock. Hoy tienen CanvasSection propia — creada por el canon,
 * el reconcile y el backfill — solo para llevar un `order` arrastrable.
 *
 * FALLBACK: los 133 kickoffs publicados tienen un `publishedSnapshot` CONGELADO que se tomó
 * antes de que esas secciones existieran. Cuando la key no viene en las filas, se inyecta al
 * final del contenido — exactamente donde se pintaba cuando estaba pinneada.
 */
export const KICKOFF_CTX_SECTIONS = ["cronograma", "procesos"] as const;

/** Las `KICKOFF_CTX_SECTIONS` que faltan en `keys` (→ hay que inyectarlas como fila sintética). */
export function missingCtxSections(keys: string[]): string[] {
  return (KICKOFF_CTX_SECTIONS as readonly string[]).filter((k) => !keys.includes(k));
}

/**
 * Clave con la que una sección entra en `Project.hiddenKickoffKeys`.
 *
 * Las normales usan su ID de CanvasSection. Cronograma y procesos usan su KEY, aunque hoy
 * TENGAN CanvasSection: los 133 kickoffs ya guardaron las strings "cronograma"/"procesos",
 * y el chokepoint externo gatea el timeline y los flowcharts por esa key (no por id). Migrar
 * a id rompería la visibilidad de todos ellos sin ganar nada.
 */
export function kickoffHiddenKey(key: string, sectionId?: string | null): string {
  if ((KICKOFF_CTX_SECTIONS as readonly string[]).includes(key)) return key;
  return sectionId ?? key;
}

/** Fila de sección tal como llega del hook (vivo) o del snapshot (externo). */
export interface KickoffSectionRow {
  key: string;
  titleOverride?: string | null;
  eyebrowOverride?: string | null;
  blocks: Array<{ blockType: string; content?: string | null; data?: unknown }>;
}

/**
 * Config del kickoff: hero primero, `cierre` último, y en el medio las secciones de
 * CONTENIDO en el orden vivo (o el del snapshot) — incluidas cronograma y procesos.
 * Las ctx-driven que el snapshot viejo no trae se agregan al final del contenido.
 */
export function buildKickoffConfig(orderedKeys: string[]): LandingConfig {
  const allDefs = landingConfigForKickoff().sections;
  // Orden efectivo = el vivo + las ctx-driven ausentes al final (reproduce el layout viejo).
  const effective = [...orderedKeys, ...missingCtxSections(orderedKeys)];
  const idx = new Map(effective.map((k, i) => [k, i]));
  const hero = allDefs.filter((d) => d.key === KICKOFF_HERO);
  const tail = (KICKOFF_PINNED_TAIL as readonly string[])
    .map((k) => allDefs.find((d) => d.key === k))
    .filter((d): d is SectionDef => !!d);
  const content = allDefs
    .filter((d) => d.key !== KICKOFF_HERO && !(KICKOFF_PINNED_TAIL as readonly string[]).includes(d.key) && idx.has(d.key))
    .sort((a, b) => (idx.get(a.key) ?? 0) - (idx.get(b.key) ?? 0));
  return { type: "kickoff", sections: [...hero, ...content, ...tail] };
}

/** Key de la sección propia de comparación (la que reemplazó al `compara` embebido en la prosa). */
export const COMPARA_KEY = "hoy_vs_sistema";

/** Quita la key legacy `compara` de la data de una sección de prosa (transformación de render). */
export function stripProseCompara(data: unknown): unknown {
  if (!data || typeof data !== "object" || !("compara" in data)) return data;
  const { compara: _drop, ...rest } = data as Record<string, unknown>;
  void _drop;
  return rest;
}

/**
 * `data` de una sección para el motor: bloque CARD → su `data` tipada; si no hay
 * CARD → `{__legacyMd}` con el markdown de los bloques TEXT viejos (fallback read-only).
 * Para el hero, inyecta titleOverride/eyebrowOverride como headline/eyebrow (los
 * kickoffs viejos guardaban el título del hero en los overrides de sección).
 *
 * `dropProseCompara`: ver `buildKickoffSections`.
 */
export function kickoffSectionData(row: KickoffSectionRow, dropProseCompara = false): unknown {
  const cardBlock = row.blocks.find((b) => b.blockType === "CARD");
  let data: unknown;
  if (cardBlock) {
    data = cardBlock.data ?? {};
  } else {
    const md = row.blocks.map((b) => b.content).filter(Boolean).join("\n\n");
    data = { __legacyMd: md || null };
  }
  if (row.key === "bienvenida") {
    const dd = (data ?? {}) as Record<string, unknown>;
    data = {
      ...dd,
      headline: dd.headline ?? row.titleOverride ?? undefined,
      eyebrow: dd.eyebrow ?? row.eyebrowOverride ?? undefined,
    };
  }
  if (dropProseCompara && row.key !== COMPARA_KEY) data = stripProseCompara(data);
  return data;
}

/**
 * `true` si la sección propia de comparación tiene contenido real (no solo existe).
 * IMPORTANTE: pasarle SIEMPRE el set COMPLETO de secciones. Si se calcula sobre un set ya
 * filtrado (p.ej. sin las que el CSE ocultó), una `hoy_vs_sistema` oculta pero con contenido
 * no se ve → `false` → la comparación reaparece desde la prosa, justo lo que se quiso ocultar.
 */
export function comparaSectionHasContent(rows: KickoffSectionRow[]): boolean {
  const row = rows.find((r) => r.key === COMPARA_KEY);
  if (!row) return false;
  const c = normalizeCompara(kickoffSectionData(row));
  return c.hoy.length > 0 || c.conSistema.length > 0;
}

/**
 * Filas → `data` por sección, para las DOS superficies (editor del CSE y página del
 * cliente). Único chokepoint: cualquier superficie nueva (PDF…) hereda las mismas reglas.
 *
 * DE-DUPLICA LA COMPARACIÓN. Los kickoffs viejos guardaban el bloque "Hoy / Con el
 * sistema" DENTRO de la prosa (`ProseData.compara`); hoy tiene su sección propia
 * (`hoy_vs_sistema`). Como el agente arrastra las keys fuera-de-schema (carry-forward),
 * un kickoff regenerado termina con la comparación en los DOS lados y se pinta dos veces.
 *
 * El gate es por CONTENIDO, no por existencia de la sección — gatear por existencia
 * dejaría SIN comparación a los 133 publicados y a los backfilleados-sin-regenerar
 * (tienen la sección creada pero vacía):
 *   · sección propia CON contenido → se descarta el `compara` de la prosa (queda uno).
 *   · sección propia vacía o ausente → se conserva el `compara` de la prosa.
 * Es transformación de RENDER: no toca la data persistida.
 */
export function buildKickoffSections(rows: KickoffSectionRow[]): Array<{ key: string; data: unknown }> {
  const drop = comparaSectionHasContent(rows);
  return rows.map((r) => ({ key: r.key, data: kickoffSectionData(r, drop) }));
}
