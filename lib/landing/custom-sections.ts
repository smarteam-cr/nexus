/**
 * lib/landing/custom-sections.ts — secciones que crea el VENDEDOR, no la plantilla.
 *
 * Ventas arma aparte un HTML (una animación, unos tabs, una explicación interactiva) y
 * lo pega en la propuesta con un nombre suyo. Nada de eso está en `BC_TEMPLATES`, así
 * que la sección necesita una identidad que el motor entienda sin conocerla de antemano.
 *
 * ── POR QUÉ UN PREFIJO EN LA KEY Y NO UNA COLUMNA ────────────────────────────
 * `CanvasSection.key` es un String libre (sin FK ni enum) con `@@unique([canvasId,key])`,
 * o sea que la base ya acepta una key fuera de la plantilla y ya garantiza que no se
 * repita. Una columna `sectionType` en `CanvasSection` guardaría un dato que la key puede
 * codificar sola, y cobraría el precio caro: DDL aditivo a mano + `prisma generate` +
 * reiniciar el dev server EN LAS DOS PCs que comparten esta base (CLAUDE.md, invariante 3).
 * Mientras la otra PC no tenga el schema nuevo, cualquier `select` de esa columna le
 * revienta en runtime. El prefijo cuesta cero migración.
 *
 * El `:` es imposible en una key de plantilla —todas son snake_case— así que la colisión
 * es estructuralmente imposible, no una convención que alguien pueda pisar por descuido.
 * `custom-sections.test.ts` lo congela recorriendo TODOS los templates del motor.
 *
 * ── POR QUÉ VIVE EN lib/ Y NO ADENTRO DEL COMPONENTE ─────────────────────────
 * Mismo motivo que `is-blank.ts`, `hero-title.ts` y `hubs-solucion.ts`: el project `unit`
 * de vitest solo incluye `lib/**`, y esto lo tienen que poder importar a la vez el server
 * (rutas API), el cliente (el motor) y el test. La def sintetizada es DATO puro — sin
 * React, sin Prisma.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";

/** Marcador de "esta sección la creó el vendedor". Ver el encabezado: el `:` es lo que
 *  hace imposible la colisión con una key de plantilla. */
export const CUSTOM_PREFIX = "custom:";

/** `sectionType` del renderer. Ningún template lo declara —la sección nace en runtime—,
 *  así que `registry.test.ts` lo trata aparte de los huérfanos. */
export const HTML_EMBED_TYPE = "html_embed";

/** Tope de secciones personalizadas por canvas. No es una preferencia estética: el GET de
 *  `canvas-sections` devuelve TODOS los bloques con su `data`, y el hook los serializa
 *  enteros en cada refetch. Sin techo, 20 secciones de 200 KB arrastran el editor y
 *  engordan el `publishedSnapshot` (Json) que la página del prospecto lee en cada visita. */
export const MAX_CUSTOM_SECTIONS = 10;

/** Tope de HTML por sección, en caracteres. Ver `MAX_CUSTOM_SECTIONS`. */
export const MAX_EMBED_CHARS = 200_000;

/** Nombre por defecto de una sección recién creada (y el que ve el PDF si alguien vacía el
 *  título). Es un placeholder: el nombre real viaja por `titleOverride`, que es la única
 *  vía que cruza a la impresión — `PrintRow` no lleva `label`. */
export const CUSTOM_SECTION_LABEL = "Sección personalizada";

/** La data de una sección personalizada. Todo string: `coerceToSchema` aplana cualquier
 *  hoja que no lo sea, y aunque acá el agente no escribe nunca, el resto del motor
 *  (merge con `empty`, isBlank, publish) asume esta forma. */
export interface HtmlEmbedData {
  /** El markup que pegó Ventas. CONTENIDO. */
  html: string;
  /** Lo que se imprime en el PDF en lugar del iframe. CONTENIDO — una sección con solo
   *  esto es legítima para imprimir. */
  notaPdf: string;
  /** Alto del iframe en px, como texto. PRESENTACIÓN → va en `NO_CONTENIDO` (is-blank.ts):
   *  ajustar el alto de una sección cuyo HTML nunca se pegó no puede volverla publicable. */
  altoEmbed: string;
}

export const CUSTOM_SECTION_EMPTY: HtmlEmbedData = { html: "", notaPdf: "", altoEmbed: "" };

/** Alto por defecto del embebido, en px. Vive en el RENDER y no en el `empty` para no
 *  sumar otra clave con valor a la trampa de `is-blank`. */
export const EMBED_ALTO_DEFAULT = 520;
export const EMBED_ALTO_MIN = 200;
export const EMBED_ALTO_MAX = 2000;

/** El alto efectivo, saneado. Un texto vacío o basura cae al default. */
export function altoEmbedPx(data: { altoEmbed?: string } | null | undefined): number {
  const n = Number((data?.altoEmbed ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return EMBED_ALTO_DEFAULT;
  return Math.min(EMBED_ALTO_MAX, Math.max(EMBED_ALTO_MIN, Math.round(n)));
}

export function esCustomKey(key: string): boolean {
  return key.startsWith(CUSTOM_PREFIX) && key.length > CUSTOM_PREFIX.length;
}

/** Key nueva. El uuid se CONSERVA al regenerar (ver el carry-forward de
 *  `createBusinessCaseCanvas`): todo lo que se indexa por key —`hidden`, el orden, el
 *  brief— sigue matcheando en la versión nueva porque la key es la misma. */
export function nuevaCustomKey(): string {
  return `${CUSTOM_PREFIX}${crypto.randomUUID()}`;
}

/**
 * La def sintetizada de una sección personalizada. Mismo contrato que las de la plantilla,
 * pero fabricada desde la key en vez de leída de `BC_TEMPLATES`.
 *
 * `agentGenerated:false` + `schema.properties` VACÍO es cinturón y tiradores: el flag hace
 * que el agente la saltee, que la píldora ✨IA no se ofrezca y que regenerar responda 400;
 * el schema vacío hace que, si algún camino se filtrara, `coerceToSchema` no tenga ninguna
 * clave que escribir. ⚠ Ojo con la asimetría: `coerceToSchema` con `properties` vacío
 * devuelve `{}` — o sea que un gate que falte no degrada la sección, la VACÍA.
 */
export function customDef(key: string, label?: string | null): BCSectionDef {
  const nombre = (label ?? "").trim() || CUSTOM_SECTION_LABEL;
  return {
    key,
    label: nombre,
    canvasLabel: nombre,
    theme: "light",
    sectionType: HTML_EMBED_TYPE,
    agentGenerated: false,
    empty: { ...CUSTOM_SECTION_EMPTY },
    schema: { type: "object", properties: {} },
    agentHint: "(No la genera el agente: la escribe Ventas.)",
    brief:
      "Sección personalizada: el HTML lo pega Ventas a mano (una animación, unos tabs, una explicación interactiva). El agente NO la escribe. En el PDF no se imprime el contenido interactivo, sale el texto de reemplazo.",
  };
}
