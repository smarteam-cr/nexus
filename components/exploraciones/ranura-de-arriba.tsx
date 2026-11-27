"use client";

/**
 * La ranura de la fila de arriba del Diagnóstico de rendimiento (27 nov, Elías: «cómo lo ve el cliente, comparar áreas y
 * acceso, a la par»). La fila la pinta PasoEscala; «✨ Mejorar con IA» e «Historial» son de la página que está a la vista
 * (el Resumen o un área, PaginaDeLaEscala) y se dibujan ahí con un portal. Archivo aparte para que PaginaDeLaEscala no
 * importe PasoEscala (que la importa a ella).
 */
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const RanuraDeArriba = createContext<HTMLElement | null>(null);

/** Lo pone en la fila de arriba si existe; si no (otra pantalla que use la página), donde está. */
export function EnLaFilaDeArriba({ children }: { children: ReactNode }) {
  const ranura = useContext(RanuraDeArriba);
  return ranura ? createPortal(children, ranura) : <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
