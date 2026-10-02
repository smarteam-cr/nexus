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
import type { PosicionEnElMapa } from "@/lib/exploraciones/mapa";
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
  /** El chequeo de lo confirmado CON EVIDENCIA: lo que leen la propuesta, el handoff y «lista para proponer». */
  chequeo: ResultadoDelChequeo;
  /**
   * El mapa de la escala: dónde parece estar cada dimensión (lo confirmado y, si no hay, lo que
   * propone el agente, con su clase: evidencia o hipótesis) y el chequeo que sale de ahí.
   */
  mapa: { posiciones: Record<string, PosicionEnElMapa>; chequeo: ResultadoDelChequeo };
  /** Lo que propuso el agente y sigue sin usar ni descartar (con las hipótesis de nivel). */
  pendientes: ItemPropuesto[];
  /** Lo pendiente que hay que revisar: sin las hipótesis de nivel, que son la capa del mapa. */
  revisables: ItemPropuesto[];
  /** Las reuniones que el agente todavía no leyó (al abrir y al recargar). */
  sinLeer: ReunionSinLeer[];
  /** Los proyectos cuyo handoff ya recibe la exploración (al abrir y al recargar). */
  proyectos: NonNullable<ExploracionParaLaPantalla["proyectos"]>;
  /** Las sesiones y los documentos sumados a mano (al abrir y al recargar). */
  documentos: NonNullable<ExploracionParaLaPantalla["documentos"]>;
  /** Las propuestas comerciales que nacieron de esta exploración (al abrir y al recargar). */
  propuestas: NonNullable<ExploracionParaLaPantalla["propuestas"]>;
  puedeEditar: boolean;
  guardando: boolean;
  cambiar: (ops: Operacion[], opciones?: OpcionesDeCambio) => Promise<boolean>;
  /** Vuelve a pedir la exploración (el agente terminó y dejó propuestas nuevas). Sale en la misma
   *  fila que los cambios: no pisa uno que todavía no volvió. */
  recargar: () => Promise<void>;
  /** Espera a que salgan los cambios en fila. */
  alDia: () => Promise<void>;
  nombreDeNivel: (l: Letra) => string;
  /** Lo pendiente para revisar de un destino (o de todos los de un tipo). Sin las hipótesis de nivel. */
  pendientesPara: (filtro: (d: DestinoDePropuesta) => boolean) => ItemPropuesto[];
  /** Lleva a una pieza del lienzo (desde «Qué sigue» o un enlace). */
  irA: (paso: PasoDelLienzoUI) => void;
}

/**
 * Las piezas del lienzo, en el desplegable de arriba (el mismo caparazón que el proyecto). El
 * «Traspaso» se retiró el 2026-10-01: era la explicación de qué recibe el CSE, no algo que hacer; en
 * su lugar está la Propuesta, que es el paso que sigue.
 */
export type PasoDelLienzoUI = "resumen" | "exploracion" | "escala" | "casos" | "propuesta";

export const LienzoContexto = createContext<Lienzo | null>(null);

export function useLienzo(): Lienzo {
  const ctx = useContext(LienzoContexto);
  if (!ctx) throw new Error("useLienzo fuera del lienzo de la exploración");
  return ctx;
}
