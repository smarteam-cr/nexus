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
import { esCustomKey } from "@/lib/landing/custom-sections";

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
  /**
   * Cómo se fabrica la def de una sección CREADA EN RUNTIME (`custom:*`), que por definición no
   * está en `allDefs` — la plantilla no la conoce.
   *
   * ⚠ Llega como función y no como un mapa de componentes para que este archivo siga sin importar
   * un solo renderer: lo consumen páginas externas y de impresión, y arrastrar los componentes
   * cliente hasta acá los metería en el bundle de todas ellas. El adaptador, que YA importa su
   * mapa, pasa `(key) => toSectionDef(customDef(key), SUS_COMPONENTES)`.
   *
   * Ausente = las `custom:*` se ignoran, que es el comportamiento previo a 2026-08-21.
   */
  sintetizar?: (key: string) => SectionDef | null;
}

/**
 * Config: hero primero, `pinnedTail` al final, y en el medio las secciones de
 * CONTENIDO presentes en `orderedKeys`, en ese orden (el vivo o el del snapshot).
 * Una key de `orderedKeys` sin def se ignora (typo/sección retirada: mejor
 * omitirla que reventar el render del cliente).
 *
 * ── ⭐ POR QUÉ EL RECORRIDO ES SOBRE `orderedKeys` Y NO SOBRE `allDefs` ───────
 * Antes filtraba las defs de la plantilla por «¿está en el orden?». Eso hace estructuralmente
 * imposible pintar una sección que la plantilla NO conoce — y las creadas en runtime (`custom:*`)
 * son exactamente eso. Recorriendo el orden, una key sin def tiene su chance de sintetizarse.
 *
 * ⛔ Y ES LA MISMA FUNCIÓN QUE USAN EL EDITOR Y EL PDF de los seis documentos de proyecto. Ese es
 * el motivo de arreglarlo acá y no en cada adaptador: el modo de falla de un parche por consumidor
 * está escrito en DECISIONS §Secciones personalizadas — «la sección que no matchea se cae del
 * filter sin error, sin log y sin poner roja la suite», o sea **se ve en el editor y falta en el
 * PDF que ya se mandó**.
 *
 * ⚠ Se dedupe: una key repetida en `orderedKeys` pintaba una vez sola cuando el recorrido era
 * sobre las defs, y tiene que seguir pintando una sola vez.
 */
export function buildLandingConfigFromOrder(shape: LandingShape, orderedKeys: string[]): LandingConfig {
  const porKey = new Map(shape.allDefs.map((d) => [d.key, d]));
  const hero = shape.allDefs.filter((d) => d.key === shape.heroKey);
  const tail = shape.pinnedTail
    .map((k) => porKey.get(k))
    .filter((d): d is SectionDef => !!d);

  const vistas = new Set<string>();
  const content: SectionDef[] = [];
  for (const key of orderedKeys) {
    if (key === shape.heroKey || shape.pinnedTail.includes(key) || vistas.has(key)) continue;
    vistas.add(key);
    /* La def de la plantilla; si no está y la sección se creó en runtime, la sintetizada. Una key
       desconocida que NO es `custom:*` sigue ignorándose: es un typo o una sección retirada. */
    const def = porKey.get(key) ?? (esCustomKey(key) ? shape.sintetizar?.(key) ?? null : null);
    if (def) content.push(def);
  }

  return { type: shape.type, sections: [...hero, ...content, ...tail] };
}

/**
 * `data` de una sección para el motor: bloque CARD → su `data` tipada; si no hay
 * CARD → `{__legacyMd}` con el markdown de los bloques TEXT viejos (fallback
 * read-only). Quién lo RINDE: `LandingView` lo hace de forma genérica (si la data
 * tipada de la sección está vacía, pinta el markdown) — antes solo lo leían tres
 * componentes puntuales y el resto dejaba la sección en blanco. Para el hero, inyecta
 * titleOverride/eyebrowOverride como
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
