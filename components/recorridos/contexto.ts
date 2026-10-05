"use client";

/**
 * El contexto de los recorridos guiados: qué recorridos tiene esta persona, cuáles vio y cómo
 * arrancar uno. Lo monta `RecorridosProvider` en el shell interno; fuera de él (páginas
 * externas, PDF) `useRecorridos()` devuelve null y el botón no se pinta.
 */
import { createContext, useContext, useEffect } from "react";
import type { EstadoDelRecorrido, Recorrido } from "@/lib/recorridos";

export interface ContextoDeRecorridos {
  /** Los recorridos de su rol. */
  recorridos: Recorrido[];
  estado: (id: string) => EstadoDelRecorrido;
  /** Cuántos no vio o cambiaron desde que los vio (el número del menú). */
  sinVer: number;
  /** El que está corriendo ahora, si hay uno. */
  activo: string | null;
  /** La pieza abierta de un lienzo que declaró su recorrido (`usePantallaDelRecorrido`). */
  pantalla: string | null;
  /** Si la pantalla calza, arranca; si no, lleva a su pantalla y arranca al llegar. */
  iniciar: (id: string) => void;
  /** «Ahora no» de la invitación: cuenta como saltado, así el punto se va. */
  descartar: (id: string) => void;
  abrirLista: () => void;
  /** Lo usa `usePantallaDelRecorrido`: declara la pieza y devuelve con qué retirarla. */
  declararPantalla: (id: string) => () => void;
}

export const RecorridosContext = createContext<ContextoDeRecorridos | null>(null);

export function useRecorridos(): ContextoDeRecorridos | null {
  return useContext(RecorridosContext);
}

/**
 * Una pieza de un lienzo (el cronograma dentro de la ficha, «Preparación» dentro de la preventa)
 * declara su recorrido mientras está abierta y a la vista. El botón «Recorrido» de la cabecera
 * pasa a ofrecer ese, y al cerrar la pieza vuelve al de la ficha. `null` = no declara nada.
 */
export function usePantallaDelRecorrido(id: string | null) {
  const declarar = useRecorridos()?.declararPantalla;
  useEffect(() => {
    if (!declarar || !id) return;
    return declarar(id);
  }, [declarar, id]);
}
