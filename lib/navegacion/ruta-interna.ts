/**
 * lib/navegacion/ruta-interna.ts — ¿esta dirección es una pantalla de Nexus? PURO y CLIENT-SAFE.
 *
 * La usan todos los enlaces que Nexus guarda para abrirlos después (el «dónde estabas» del feedback,
 * el enlace de un aviso de «Para ti»): si alguien logra guardar una dirección de afuera, el botón
 * lleva a otro sitio con la cara de Nexus. Una sola regla para todos (antes había dos copias, y las dos
 * dejaban pasar `/\otro.com`).
 *
 * Es interna si:
 * · empieza con UNA barra (`/clients/x`, sí; `clients`, `https://…`, `javascript:…`, no);
 * · no empieza con dos (`//otro.com` es «el mismo esquema, OTRO sitio»);
 * · no lleva barras invertidas: el navegador lee `/\otro.com` igual que `//otro.com`. Ninguna pantalla
 *   de Nexus las usa, así que se rechazan en cualquier parte y no hay que pensar en qué posición engañan;
 * · no lleva caracteres de control (saltos, tabulaciones, nulos): el navegador los BORRA antes de leer
 *   la dirección, así que `/\t/otro.com` termina siendo `//otro.com`.
 */
// eslint-disable-next-line no-control-regex -- justamente buscamos los caracteres de control
const CONTROL = /[\u0000-\u001f\u007f]/;

export function esRutaInterna(href: string): boolean {
  if (typeof href !== "string") return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (href.includes("\\")) return false;
  if (CONTROL.test(href)) return false;
  return true;
}
