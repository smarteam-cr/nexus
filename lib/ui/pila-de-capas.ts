/**
 * lib/ui/pila-de-capas.ts — qué capa (Modal, Drawer) está ARRIBA de todo, para que Escape cierre solo esa.
 *
 * Cada Modal y cada Drawer escuchaba Escape en `document` por su cuenta: con un diálogo abierto encima de un
 * cajón (Finanzas › cuenta › «Compartir estado de cuenta», 2026-11-17), una sola tecla cerraba los dos. Ahora
 * cada capa abierta se apila acá y solo la de arriba atiende la tecla.
 */

const pila: symbol[] = [];

/** Apila una capa recién abierta. Devuelve con qué sacarla al cerrarse. */
export function apilarCapa(capa: symbol): () => void {
  pila.push(capa);
  return () => {
    const i = pila.lastIndexOf(capa);
    if (i >= 0) pila.splice(i, 1);
  };
}

/** Si esta capa es la de arriba (la única que atiende Escape). */
export function esLaDeArriba(capa: symbol): boolean {
  return pila.length > 0 && pila[pila.length - 1] === capa;
}
