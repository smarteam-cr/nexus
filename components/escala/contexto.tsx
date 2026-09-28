"use client";

/**
 * components/escala/contexto.tsx — lo que comparten las tres vistas y el panel de comentarios.
 *
 * Quién soy, si soy el responsable de la escala, el almacén de comentarios, cuántos comentarios
 * tiene cada ancla y «abrir los comentarios de este criterio». Las vistas solo piden
 * `abrirComentarios(ancla)`; el panel vive una sola vez, arriba.
 */
import { createContext, useContext } from "react";
import type { Autor, Conteo, ConteosPorClave } from "@/lib/escala/comentarios/reglas";
import type { AlmacenDeLaEscala } from "./comentarios/almacen";

export interface ContextoDeLaEscala {
  yo: Autor;
  esResponsable: boolean;
  almacen: AlmacenDeLaEscala;
  /** Por ancla (`1.7.F1`), del área que se mira. */
  conteos: ConteosPorClave;
  /** ¿Están las tablas de comentarios? (sin el SQL, se lee la escala pero no se comenta). */
  comentariosDisponibles: boolean;
  abrirComentarios: (ancla: string) => void;
}

const Contexto = createContext<ContextoDeLaEscala | null>(null);

export const ProveedorDeLaEscala = Contexto.Provider;

export function useEscala(): ContextoDeLaEscala {
  const c = useContext(Contexto);
  if (!c) throw new Error("useEscala fuera de ProveedorDeLaEscala");
  return c;
}

const VACIO: Conteo = { total: 0, abiertos: 0 };

/** Los comentarios de un ancla exacta. */
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
