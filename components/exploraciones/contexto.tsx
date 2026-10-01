"use client";

/**
 * components/exploraciones/contexto.tsx — lo que comparten todas las piezas del lienzo.
 *
 * `cambiar` es la ÚNICA forma de escribir: manda operaciones (lib/exploraciones/contenido.ts) al
 * servidor. Las aplica primero en pantalla —con la misma función pura que usa el servidor— para que
 * elegir un nivel en plena reunión no espere la red, y después se queda con lo que devolvió el
 * servidor. Los pedidos salen EN FILA, cada uno con la versión que dejó el anterior: dos clics
 * seguidos no se pisan entre sí ni se toman por un conflicto con otra persona.
 */
import { createContext, useContext } from "react";
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import type { DestinoDePropuesta, ItemPropuesto, Operacion } from "@/lib/exploraciones/contenido";
import type { EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import type { ReunionSinLeer } from "@/lib/exploraciones/lectura";
import type { ExploracionParaLaPantalla } from "@/lib/exploraciones/servidor";

export interface OpcionesDeCambio {
  /** El cambio mueve lo que la escala muestra (la edición, el perfil): se vuelve a pedir la página. */
  refrescar?: boolean;
  /** Aviso al terminar bien. */
  exito?: string;
}

export interface Lienzo {
  exp: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  chequeo: ResultadoDelChequeo;
  /** Lo que propuso el agente y sigue sin usar ni descartar. */
  pendientes: ItemPropuesto[];
  /** Las reuniones que el agente todavía no leyó (al abrir y al recargar). */
  sinLeer: ReunionSinLeer[];
  /** Los proyectos cuyo handoff ya recibe la exploración (al abrir y al recargar). */
  proyectos: NonNullable<ExploracionParaLaPantalla["proyectos"]>;
  puedeEditar: boolean;
  guardando: boolean;
  cambiar: (ops: Operacion[], opciones?: OpcionesDeCambio) => Promise<boolean>;
  /** Vuelve a pedir la exploración (el agente terminó y dejó propuestas nuevas). Sale en la misma
   *  fila que los cambios: no pisa uno que todavía no volvió. */
  recargar: () => Promise<void>;
  /** Espera a que salgan los cambios en fila. */
  alDia: () => Promise<void>;
  nombreDeNivel: (l: Letra) => string;
  /** Lo pendiente para un destino (o para todos los de un tipo). */
  pendientesPara: (filtro: (d: DestinoDePropuesta) => boolean) => ItemPropuesto[];
}

export const LienzoContexto = createContext<Lienzo | null>(null);

export function useLienzo(): Lienzo {
  const ctx = useContext(LienzoContexto);
  if (!ctx) throw new Error("useLienzo fuera del lienzo de la exploración");
  return ctx;
}
