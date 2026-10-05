/**
 * lib/para-ti/avisos.ts — las reglas de los AVISOS de «Para ti» (2026-10-04). PURO y CLIENT-SAFE.
 *
 * Un aviso es algo que PASÓ y que una persona debería saber. Tres reglas que no se negocian:
 * 1. Nunca le llega a quien hizo la acción (`destinatarios` lo saca; la base también lo frena con un CHECK).
 * 2. El mismo hecho le avisa UNA vez a cada persona (`dedupeKey`, único por destinatario).
 * 3. Lleva a una pantalla de Nexus: el enlace es una ruta interna, nunca una dirección afuera.
 *
 * El catálogo de TIPOS dice cuáles son buenas noticias (llevan ✓ en verde). Un tipo que no está acá se muestra igual.
 */

/** Los tipos que hoy escribe Nexus. Texto con punto: `<módulo>.<qué pasó>`. */
export const TIPOS_DE_AVISO = {
  "finanzas.devuelto": { bueno: false },
  "finanzas.mes-cerrado": { bueno: true },
  "roles.compartido": { bueno: false },
  "documentacion.comentario": { bueno: false },
  "documentacion.respuesta": { bueno: false },
  "cliente.aprobo-documento": { bueno: true },
  "cliente.aprobo-propuesta": { bueno: true },
  "proyecto.encargado": { bueno: false },
  "preventa.responsable": { bueno: false },
  "feedback.nuevo": { bueno: false },
  "feedback.respuesta": { bueno: false },
  "feedback.estado": { bueno: false },
} as const satisfies Record<string, { bueno: boolean }>;

export type TipoDeAviso = keyof typeof TIPOS_DE_AVISO;

export function esBuenaNoticia(tipo: string): boolean {
  return (TIPOS_DE_AVISO as Record<string, { bueno: boolean } | undefined>)[tipo]?.bueno === true;
}

/**
 * ¿Es una ruta interna de Nexus? (`/clients/x`, sí; `//otro.com`, `/\otro.com`, `https://…`, no).
 * La regla es una sola para todo Nexus: vive en lib/navegacion/ruta-interna.ts.
 */
export { esRutaInterna } from "@/lib/navegacion/ruta-interna";

const normal = (e: string) => e.trim().toLowerCase();

/**
 * A quiénes les llega: los pedidos directos más los que llevan el frente, sin repetir y SIN quien hizo la acción.
 * Puro para poder probarlo; la búsqueda de quiénes llevan el frente la hace el servidor.
 */
export function destinatarios(
  directos: readonly (string | null | undefined)[],
  porFrente: readonly string[],
  actorEmail: string | null | undefined,
): string[] {
  const actor = actorEmail ? normal(actorEmail) : null;
  const out = new Set<string>();
  for (const e of [...directos, ...porFrente]) {
    if (!e || !e.includes("@")) continue;
    const n = normal(e);
    if (n === actor) continue;
    out.add(n);
  }
  return [...out];
}

/** Un título o detalle de aviso, sin saltos y con tope (la base no tiene uno, la pantalla sí). */
export function textoDeAviso(t: string, max = 200): string {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
}
