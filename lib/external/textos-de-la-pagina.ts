/**
 * lib/external/textos-de-la-pagina.ts — los textos FIJOS de la página de la escala que ve el cliente, cambiados por
 * empresa (16 nov; Elías: «toda la info de las páginas de resultados, del resumen y del departamento se pueda editar»).
 * Puro: lo usan el servidor (la operación `textoDeLaPagina`), la página pública y la interna.
 *
 * Lo que la página arma sola (los títulos, «Por dónde empezar», lo que cuesta quedarse así, los casos, los riesgos, «Ver
 * detalles», la bajada y los números de «Lo que hicimos» del Resumen) se queda como está, salvo que una persona lo cambie:
 * `contenido.textosDeLaPagina[clave]` lo reemplaza. Texto vacío = el cliente no ve esa pieza (un caso o un riesgo).
 *
 * Dos clases de clave:
 *   · la de algo que no cambia de sentido (un título, un caso por su id, un paso): se nombra por su lugar;
 *   · la de un texto que la escala calcula con los niveles (la razón de «Por dónde empezar», un riesgo, lo que priorizar):
 *     lleva la HUELLA del texto que reemplaza (`huella`). Si los niveles cambian y el texto de la escala es otro, lo escrito
 *     para el de antes deja de aplicarse: hablaba de otra parte o de otro nivel.
 * Lo que ve el cliente es la foto publicada (lib/exploraciones/escala-publicada.ts): estos textos entran a la foto al publicar.
 */

/** Una clave: letras, números y separadores. La arman las funciones de abajo; el servidor no acepta otra forma. */
export const CLAVE_DE_LA_PAGINA = /^[A-Za-z0-9._:|-]{1,160}$/;
/** El tope de un texto cambiado (la razón de «Por dónde empezar» o lo que priorizar son los más largos). */
export const MAX_TEXTO_DE_LA_PAGINA = 700;
/** Cuántos textos cambiados guarda una exploración: lejos de lo que tiene una página, cerca de un descuido. */
export const MAX_TEXTOS_DE_LA_PAGINA = 400;

export type TextosDeLaPagina = Readonly<Record<string, string>>;

/** La huella de un texto: FNV-1a de 32 bits en base 36. Ata lo escrito al texto que reemplaza. */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  const t = texto.replace(/\s+/g, " ").trim();
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** El texto que se ve: el cambiado, o el de siempre. */
export function textoDeLaPagina(textos: TextosDeLaPagina | null | undefined, clave: string, original: string): string {
  const t = textos?.[clave];
  return t === undefined ? original : t;
}

/** Si una pieza se quitó para el cliente (texto vacío). */
export function quitadaDeLaPagina(textos: TextosDeLaPagina | null | undefined, clave: string): boolean {
  return textos?.[clave] === "";
}

/** Las claves, en un solo lugar: la página pública y la interna las arman igual. */
export const CLAVES = {
  /** Un texto fijo de la página (un título, la bajada, el pie): por su nombre. */
  fijo: (nombre: string) => `fijo.${nombre}`,
  /** Un texto fijo de la página de un área. */
  delArea: (areaId: string, nombre: string) => `area.${areaId}.${nombre}`,
  /** Un texto que la escala calcula: el área, qué es y la huella del texto que reemplaza. */
  calculado: (areaId: string, que: string, original: string) => `area.${areaId}.${que}.${huella(original)}`,
  /**
   * Un caso de «Lo que haríamos contigo», por su id (`campo` vacío: el caso entero, para quitarlo). Lo que sube («↗ Sube
   * Datos a Funcional») lo calcula la escala con los niveles: va con `calculado`.
   */
  caso: (areaId: string, casoId: string, campo?: "titulo" | "promesa") => `area.${areaId}.caso.${casoId}${campo ? `.${campo}` : ""}`,
  /** Lo que priorizar en «Ver detalles» de una parte, atado al texto que reemplaza. */
  detalle: (dimensionId: string, original: string) => `detalle.${dimensionId}.${huella(original)}`,
  /** Algo del Resumen que no guarda el agente: por su lugar. */
  delResumen: (nombre: string) => `resumen.${nombre}`,
} as const;
