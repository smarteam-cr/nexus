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

// ── Las COPIAS de una sección (2026-11-12) ────────────────────────────────────────────────────

/**
 * El segmento de tipo de una COPIA: `custom:copia:<key de la original>:<uuid>`.
 *
 * Elías pidió «Duplicar» en el menú de cada sección del documento (12 nov): una copia justo debajo, con su contenido,
 * para cambiarle la información. La copia se pinta con el MISMO renderer que la original (la tabla de Acciones sigue
 * siendo esa tabla), así que la key tiene que decir de qué sección es copia. Va bajo `custom:` a propósito, porque una
 * copia ES una sección de la persona, y con el prefijo hereda todo lo que ya la protege sin una línea más:
 *   · regenerar no la escribe (el agente solo escribe las keys de su plantilla) ni la borra (`ajustarALaPlantilla` y sus
 *     pares miran solo las keys del canon);
 *   · se puede borrar (el DELETE solo borra `custom:*`), cuenta en el tope de `MAX_CUSTOM_SECTIONS`, viaja al duplicar
 *     el documento y al enlace.
 * La original es una key de plantilla (snake_case, sin `:`), así que partir por `:` sigue siendo inequívoco.
 * ⚠ Quien resuelve la def de una copia es `defDeLaCopia`: `customDef` no conoce el documento y la pintaría como un HTML.
 */
export const TIPO_COPIA = "copia";

/** Key nueva para una copia de la sección `original` (una key de plantilla, sin `:`). */
export function nuevaKeyDeCopia(original: string): string {
  if (!/^[a-z0-9_]+$/.test(original)) throw new Error(`«${original}» no es una sección de plantilla.`);
  return `${CUSTOM_PREFIX}${TIPO_COPIA}:${original}:${crypto.randomUUID()}`;
}

/** La key de la sección de la que es copia, o `null` si la key no es de una copia. */
export function originalDeLaCopia(key: string): string | null {
  if (!esCustomKey(key)) return null;
  const partes = key.split(":");
  if (partes.length !== 4 || partes[1] !== TIPO_COPIA) return null;
  return /^[a-z0-9_]+$/.test(partes[2]) ? partes[2] : null;
}

/**
 * La def de una copia, a partir de las defs del documento: la de la original con la key de la copia. Nunca fija (las
 * pinneadas son la portada y el cierre, que no se duplican), así que se puede arrastrar. `null` si no es una copia o si
 * su original no es de este documento: quien llama la omite, como a toda key sin def.
 */
export function defDeLaCopia<D extends object>(key: string, defDe: (key: string) => D | null | undefined): (D & { key: string; pinned?: boolean }) | null {
  const original = originalDeLaCopia(key);
  const base = original ? defDe(original) : null;
  return base ? { ...base, key, pinned: false } : null;
}

/** Tope del nombre de una sección (el mismo del POST que la crea). */
export const TOPE_DEL_NOMBRE_DE_SECCION = 60;

/** El nombre de una copia: el de la original con «(copia)», dentro del tope. Se edita como cualquier título. */
export function nombreDeLaCopia(titulo: string): string {
  const sufijo = " (copia)";
  const base = titulo.trim() || "Sección";
  return `${base.slice(0, TOPE_DEL_NOMBRE_DE_SECCION - sufijo.length).trim()}${sufijo}`;
}

/**
 * La key de la copia de una sección: una sección de plantilla se copia como `custom:copia:…`; una creada por una persona
 * (o una copia) se copia como otra sección propia de su mismo tipo, o como copia de la misma original.
 */
export function keyParaDuplicar(key: string): string {
  const original = originalDeLaCopia(key);
  if (original) return nuevaKeyDeCopia(original);
  if (esCustomKey(key)) return nuevaCustomKey(tipoDeCustomKey(key) ?? "html");
  return nuevaKeyDeCopia(key);
}
