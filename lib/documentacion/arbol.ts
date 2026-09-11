/**
 * lib/documentacion/arbol.ts — dónde está cada página de Documentación. PURO (sin Prisma ni React).
 *
 * Todo lo que decide la posición de una página vive acá, para probarlo sin base:
 *   · armar el árbol a partir de filas planas (padre → hijas, en su orden);
 *   · la ruta de páginas (las migas) hasta una página;
 *   · la rama entera de una página (para archivarla con todo lo que cuelga);
 *   · si se puede mover a otro padre SIN crear un ciclo;
 *   · el orden denso de las hermanas después de mover o crear;
 *   · el slug de una página nueva.
 *
 * ⚠ Las funciones reciben SIEMPRE la lista completa de páginas vivas. El árbol es chico (decenas
 * de páginas, no miles), y cargarlo entero dentro de la transacción es lo que hace imposible un
 * ciclo por carrera: dos movimientos cruzados no pueden validarse cada uno contra una foto vieja.
 */
import type { NodoDePagina, NodoDelArbol } from "./tipos";

type Enlace = Pick<NodoDePagina, "id" | "parentId">;

function porOrden(a: NodoDePagina, b: NodoDePagina): number {
  return a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es");
}

/**
 * Arma el árbol. Una página cuyo padre no está en la lista (archivado) sube a la raíz, y un
 * ciclo en los datos se corta en vez de perder las páginas: mejor visibles en el lugar
 * equivocado que desaparecidas del árbol.
 */
export function armarArbol(nodos: readonly NodoDePagina[]): NodoDelArbol[] {
  const porId = new Map<string, NodoDelArbol>();
  for (const n of nodos) porId.set(n.id, { ...n, hijas: [] });

  const raices: NodoDelArbol[] = [];
  for (const n of porId.values()) {
    const padre = n.parentId && n.parentId !== n.id ? porId.get(n.parentId) : undefined;
    if (padre) padre.hijas.push(n);
    else raices.push(n);
  }

  // Lo que no se alcanza desde una raíz está en un ciclo: se suelta de su padre y sube.
  const alcanzados = new Set<string>();
  const marcar = (n: NodoDelArbol) => {
    if (alcanzados.has(n.id)) return;
    alcanzados.add(n.id);
    n.hijas.forEach(marcar);
  };
  raices.forEach(marcar);
  for (const n of porId.values()) {
    if (alcanzados.has(n.id)) continue;
    const padre = n.parentId ? porId.get(n.parentId) : undefined;
    if (padre) padre.hijas = padre.hijas.filter((h) => h.id !== n.id);
    raices.push(n);
    marcar(n);
  }

  const ordenar = (lista: NodoDelArbol[]) => {
    lista.sort(porOrden);
    lista.forEach((h) => ordenar(h.hijas));
  };
  ordenar(raices);
  return raices;
}

/** La ruta desde la raíz hasta la página, incluida. Se corta ante un ciclo en vez de colgarse. */
export function rutaDe<T extends Enlace>(id: string, nodos: readonly T[]): T[] {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const ruta: T[] = [];
  const vistos = new Set<string>();
  let actual = porId.get(id);
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    ruta.unshift(actual);
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }
  return ruta;
}

/** Los ids de la página y de todo lo que cuelga de ella, a cualquier profundidad. */
export function ramaDe(id: string, nodos: readonly Enlace[]): string[] {
  const hijasDe = new Map<string, string[]>();
  for (const n of nodos) {
    if (!n.parentId) continue;
    const lista = hijasDe.get(n.parentId) ?? [];
    lista.push(n.id);
    hijasDe.set(n.parentId, lista);
  }
  const rama: string[] = [];
  const pila = [id];
  const vistos = new Set<string>();
  while (pila.length > 0) {
    const actual = pila.pop() as string;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    rama.push(actual);
    pila.push(...(hijasDe.get(actual) ?? []));
  }
  return rama;
}

export type ResultadoDeMover = { ok: true } | { ok: false; motivo: string };

/** ¿Se puede colgar `id` de `nuevoPadreId` (null = a la raíz) sin crear un ciclo? */
export function puedeMover(
  id: string,
  nuevoPadreId: string | null,
  nodos: readonly Enlace[],
): ResultadoDeMover {
  if (!nodos.some((n) => n.id === id)) {
    return { ok: false, motivo: "La página no existe o está archivada." };
  }
  if (nuevoPadreId === null) return { ok: true };
  if (nuevoPadreId === id) {
    return { ok: false, motivo: "Una página no puede quedar adentro de sí misma." };
  }
  if (!nodos.some((n) => n.id === nuevoPadreId)) {
    return { ok: false, motivo: "La página de destino no existe o está archivada." };
  }
  if (ramaDe(id, nodos).includes(nuevoPadreId)) {
    return {
      ok: false,
      motivo: "No se puede mover una página adentro de una de sus propias subpáginas.",
    };
  }
  return { ok: true };
}

/**
 * El orden denso (0..n-1) de las hermanas, con `idMovido` insertado en la posición `indice`
 * (se recorta al rango válido; un índice enorme la manda al final). `hermanas` son las del
 * DESTINO y pueden incluir o no a la página que se mueve.
 */
export function reordenar(
  hermanas: readonly { id: string; orden: number }[],
  idMovido: string,
  indice: number,
): { id: string; orden: number }[] {
  const resto = hermanas.filter((h) => h.id !== idMovido).sort((a, b) => a.orden - b.orden);
  const i = Math.max(0, Math.min(Math.trunc(indice), resto.length));
  const ids = [...resto.slice(0, i).map((h) => h.id), idMovido, ...resto.slice(i).map((h) => h.id)];
  return ids.map((id, orden) => ({ id, orden }));
}

/** El slug de una página nueva: minúsculas, sin tildes, palabras unidas por guiones. */
export function slugDesdeTitulo(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "pagina";
}

/** El primer slug libre a partir de `base`: `base`, `base-2`, `base-3`… */
export function slugLibre(base: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}-${n}`;
    if (!ocupados.has(candidato)) return candidato;
  }
}
