/**
 * Contenedores de página — fuente ÚNICA del padding/ancho de cada pantalla interna.
 *
 * POR QUÉ EXISTE: un `page.tsx` y su `loading.tsx` son dos archivos distintos que
 * describen la MISMA pantalla. Cuando cada uno escribe sus clases a mano, derivan
 * (`px-6` vs `px-8`, `py-6` vs `py-8`, un `max-w-5xl` que el real no tiene) y la página
 * salta de ancho o de posición al resolver. Importando los dos la misma constante, la
 * deriva es imposible.
 *
 * REGLA: todo par (page.tsx, loading.tsx) referencia la MISMA constante de acá.
 */

/** Ancho completo — el default de la app (clientes, cobranza, roles, business cases…). */
export const SHELL_DEFAULT = "px-6 py-8";

/** Columna angosta y centrada — formularios y ajustes (team, settings). */
export const SHELL_NARROW = "max-w-3xl mx-auto px-6 py-8";

/** Contenido acotado pero ancho — lecturas largas (detalle de sesión). */
export const SHELL_WIDE = "max-w-4xl mx-auto px-6 py-6";

/**
 * Pantallas que llenan el viewport y manejan su propio scroll interno (el workspace
 * del cliente, con su tab bar sticky). NO lleva padding: lo ponen las secciones.
 */
export const SHELL_FULL = "flex flex-col";
