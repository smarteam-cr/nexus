"use client";

/**
 * components/documentacion/ContextoDePaginas.tsx — el índice de páginas, al alcance del editor.
 *
 * Lo usan dos cosas que necesitan saber qué páginas existen sin ir a la red:
 *   · el menú «@», para ofrecer a cuál enlazar;
 *   · la mención ya escrita, para mostrar el título ACTUAL de la página enlazada.
 *
 * Ese segundo uso es el que importa: una mención guarda el id, y el título que se ve se resuelve
 * al pintar. Si se guardara el título, renombrar una página dejaría el nombre viejo escrito en
 * todas las páginas que la nombran — que es justo lo que un enlace tiene que evitar.
 */
import { createContext, useContext, useMemo } from "react";

export interface PaginaEnlazable {
  id: string;
  slug: string;
  titulo: string;
  icono: string | null;
}

interface Valor {
  lista: PaginaEnlazable[];
  porId: Map<string, PaginaEnlazable>;
}

const Contexto = createContext<Valor>({ lista: [], porId: new Map() });

export function ProveedorDePaginas({
  paginas,
  children,
}: {
  paginas: PaginaEnlazable[];
  children: React.ReactNode;
}) {
  const valor = useMemo<Valor>(
    () => ({ lista: paginas, porId: new Map(paginas.map((p) => [p.id, p])) }),
    [paginas],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePaginasEnlazables(): Valor {
  return useContext(Contexto);
}
