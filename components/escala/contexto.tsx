"use client";

/**
 * components/escala/contexto.tsx — lo que comparten las tres vistas de la escala.
 *
 * Si quien mira revisa el feedback (super admin), cuántos reportes de feedback tiene cada ancla (solo lo
 * ve quien revisa) y «dar feedback sobre esto». Las vistas solo piden `darFeedback(ancla)`: lo resuelve la
 * sección, que abre el panel de Feedback de siempre con ese criterio, nivel o dimensión puesto
 * (2026-10-05: la escala ya no tiene un sistema de comentarios propio).
 */
import { createContext, useContext } from "react";
import type { Conteo, ConteosPorClave } from "@/lib/feedback/escala";

export interface ContextoDeLaEscala {
  /** Revisa el feedback (super admin): ve los contadores y la capa del mapa. */
  esRevisor: boolean;
  /** Por ancla (`1.7.F1`), del área que se mira. Vacío para quien no revisa. */
  conteos: ConteosPorClave;
  darFeedback: (ancla: string) => void;
}

const Contexto = createContext<ContextoDeLaEscala | null>(null);

export const ProveedorDeLaEscala = Contexto.Provider;

export function useEscala(): ContextoDeLaEscala {
  const c = useContext(Contexto);
  if (!c) throw new Error("useEscala fuera de ProveedorDeLaEscala");
  return c;
}

const VACIO: Conteo = { total: 0, abiertos: 0 };

/** Los reportes de un ancla exacta. */
export function conteoDe(conteos: ConteosPorClave, ancla: string): Conteo {
  return conteos[ancla] ?? VACIO;
}

/** Los de una celda: el nivel entero (`1.7.F`) más sus criterios (`1.7.F1`, `1.7.F2`…). */
export function conteoDeCelda(conteos: ConteosPorClave, dimension: string, letra: string): Conteo {
  const celda = `${dimension}.${letra}`;
  let total = 0;
  let abiertos = 0;
  for (const [ancla, c] of Object.entries(conteos)) {
    if (ancla === celda || (ancla.startsWith(celda) && /^\d+$/.test(ancla.slice(celda.length)))) {
      total += c.total;
      abiertos += c.abiertos;
    }
  }
  return { total, abiertos };
}

/** Los de toda una dimensión: la dimensión, sus niveles y sus criterios. */
export function conteoDeDimension(conteos: ConteosPorClave, dimension: string): Conteo {
  let total = 0;
  let abiertos = 0;
  for (const [ancla, c] of Object.entries(conteos)) {
    if (ancla === dimension || ancla.startsWith(`${dimension}.`)) {
      total += c.total;
      abiertos += c.abiertos;
    }
  }
  return { total, abiertos };
}
