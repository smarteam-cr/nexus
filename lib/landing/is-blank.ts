/**
 * lib/landing/is-blank.ts — "¿esta sección tiene algo que mostrar?".
 *
 * En modo lectura (la vista del cliente y el PDF) una sección en blanco se OMITE: mostrar
 * el encabezado de una sección vacía es peor que no mostrarla. Vivía dentro de
 * `LandingView.tsx` sin un solo test; salió a `lib/` porque tiene una trampa que costó cara
 * y conviene poder ejercitarla.
 *
 * ── LA TRAMPA ────────────────────────────────────────────────────────────────
 * El chequeo NO corre sobre lo que se guardó, sino sobre el merge con el `empty` de la
 * definición. Y cualquier valor que no sea string/array/objeto —un número, un booleano—
 * cae al `false` final. Combinando las dos cosas: **un solo campo de presentación con
 * default vuelve la sección permanentemente NO-vacía**, y se imprime entera con todos sus
 * textos en blanco.
 *
 * Pasó en tres lugares a la vez:
 *   · `anchoRecurrente: "normal"` — un flag de LAYOUT en el `empty` de la sección de
 *     inversión de la propuesta web → esa sección no se omitía nunca.
 *   · `logoScale` — un NÚMERO en la portada: alcanzaba con que alguien ajustara el tamaño
 *     del logo para que una portada sin escribir reapareciera con el titular vacío.
 *   · `__lang` — metadato del idioma, mismo efecto.
 *
 * Y el vector real por el que eso llega al cliente: el botón "Limpiar" escribe ese mismo
 * `empty` y le dice al CSE *"Sección vaciada (el cliente no la verá)"*. Para esas secciones
 * el mensaje era FALSO — el CSE creía haberla borrado y salía igual.
 *
 * Por eso `NO_CONTENIDO`: son claves de presentación y metadatos, nunca contenido. Que
 * tengan valor no significa que la sección tenga algo que decir.
 */

/**
 * Claves que NO cuentan como contenido. Agregar una acá es decir "esto describe CÓMO se
 * ve la sección, no QUÉ dice" — si la duda existe, no va.
 */
export const NO_CONTENIDO = new Set([
  "logoScale", // tamaño del logo del cliente (número)
  "anchoRecurrente", // ancho del bloque recurrente en la propuesta web
  "buttonTarget", // en qué pestaña abre el CTA
  "__lang", // idioma del documento
  // Moneda de la sección de inversión. El `<select>` la escribe apenas el CSE lo toca, así
  // que una sección donde SOLO eligió la moneda quedaría no-blank y se publicaría diciendo
  // "Montos en CRC" y nada más. Describe CÓMO se muestran los montos, no QUÉ dice.
  "moneda",
  // Slug del Hub de una línea de licencia (sección de Inversión). Es IDENTIDAD de la línea
  // —de dónde sale su ícono—, no algo que el cliente lea: una línea cuyo concepto, monto y
  // detalle quedaron vacíos no puede mantener viva a la sección solo porque conserva su slug.
  // Es la misma trampa de `anchoRecurrente`, con la que "Limpiar" mentía.
  "hub",
  // Alto del iframe de una sección personalizada. Está acá porque el CSE puede ajustarlo
  // en una sección cuyo HTML nunca pegó (o después de "Limpiar"): sin esta entrada, esa
  // sección vacía se publicaría y el cliente vería un hueco con título.
  "altoEmbed",
]);

/** Una sección está "en blanco" si todos sus strings y arrays lo están. */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(isBlank);
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).every(
      ([k, val]) => NO_CONTENIDO.has(k) || isBlank(val),
    );
  }
  // Números y booleanos NO son contenido por sí solos, pero tampoco se puede decir que una
  // sección con un número real (una métrica, un precio) esté vacía. Se conserva el criterio
  // histórico —no vacío— y la excepción se declara por CLAVE arriba, que es lo que se puede
  // razonar leyendo la definición de la sección.
  return false;
}
