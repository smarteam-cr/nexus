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

/**
 * Key nueva, con el TIPO adentro: `custom:<tipo>:<uuid>`.
 *
 * El uuid se CONSERVA al regenerar (ver el carry-forward de `createBusinessCaseCanvas`): todo lo
 * que se indexa por key —el ojo, el orden, el brief— sigue matcheando en la versión nueva porque
 * la key es la misma.
 *
 * ── ⭐ POR QUÉ EL TIPO VA EN LA KEY Y NO EN OTRO LADO ─────────────────────────
 * Es el mismo argumento que eligió el prefijo (ver el encabezado), y suma dos:
 *
 *   · **Una columna** costaría una migración COORDINADA entre las dos PCs que comparten esta
 *     base, para guardar un dato que la key codifica sola.
 *   · **Adentro del `data`** parece gratis y es la trampa: vaciar la sección escribe el `empty` y
 *     **borraría el tipo**, dejando una sección cuya def no resuelve → `toSectionDef` devuelve
 *     `null` → desaparece del editor, del PDF y de la propuesta del cliente, sin un solo error.
 *   · **En la entry del Json** también es gratis, pero `parseSectionEntries` descarta filas
 *     malformadas A PROPÓSITO: una entry perdida dejaría la sección sin tipo. Con la key, el tipo
 *     no se puede separar de la sección.
 */
export function nuevaCustomKey(tipo?: string | null): string {
  const t = (tipo ?? "").trim();
  return t ? `${CUSTOM_PREFIX}${t}:${crypto.randomUUID()}` : `${CUSTOM_PREFIX}${crypto.randomUUID()}`;
}

/**
 * El tipo declarado en la key, o `null` si no trae.
 *
 * ⚠ `null` NO es un error: las secciones creadas antes del 2026-08-21 son `custom:<uuid>` —dos
 * segmentos, sin tipo— y son embebidos de HTML. Exigirles tres las dejaría sin def, o sea las
 * borraría de propuestas que ya se enviaron. Un uuid lleva guiones pero nunca `:`, así que partir
 * por `:` es inequívoco.
 */
export function tipoDeCustomKey(key: string): string | null {
  if (!esCustomKey(key)) return null;
  const partes = key.split(":");
  if (partes.length < 3) return null;
  const tipo = partes[1].trim();
  return tipo && /^[a-z_]+$/.test(tipo) ? tipo : null;
}

/**
 * ⚠ `customDef` SE MUDÓ a `lib/landing/catalogo-de-secciones.ts` el 2026-08-21.
 *
 * Antes fabricaba siempre un embebido de HTML, que era el único tipo creable. Ahora la def sale
 * del TIPO que declara la key, y ese catálogo vive allá — traerlo acá haría un ciclo de imports
 * (el catálogo necesita las constantes de este archivo). La dirección correcta es: la gramática de
 * la key vive acá; qué significa cada tipo, allá.
 */
