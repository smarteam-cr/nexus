"use client";

/**
 * contexto-del-resumen — lo que el panel del proyecto le pasa al Resumen (el widget y el handoff)
 * desde el rediseño de la ficha en tres columnas (2026-10-04).
 *
 * Va por CONTEXTO y no por props a propósito: los dos se montan con una línea exacta que vigilan
 * guardas estructurales (`<ProjectGPS projectId={projectId} clientId={clientId} />` y la del
 * handoff con `visible={enResumen}`), y esas guardas cuidan cosas que siguen valiendo — que el
 * widget se monte sin condición y que el documento del handoff se desmonte fuera del Resumen.
 *
 * Qué viaja:
 *  · dónde pintar el panel de contexto (null si el Resumen no se ve o el panel está oculto);
 *  · si el «Qué sigue» ya lo ocupa un cartel de la ficha (alta a medio hacer, propuesta);
 *  · las piezas del proyecto, para que el «Qué sigue» pueda proponer la de la etapa;
 *  · si el Resumen está a la vista, que es cuando se generan solos el resumen y «Qué se vendió»,
 *    y si el proyecto se está mirando (con algo de la cuenta en el centro, el panel queda oculto);
 *  · tres avisos de vuelta: la posición de la etapa (para el riel), el «Qué sigue» calculado
 *    (para cuando se mira un documento al día) y la anotación de cada pieza en el riel
 *    («opcional», «sin subir»), que antes eran los chips del widget.
 */
import { createContext, useContext } from "react";
import type { PiezaParaQueSigue, QueSigueDelProyecto } from "@/lib/clients/que-sigue-del-proyecto";

/** La anotación de una pieza en el riel. «atencion» en ámbar; «neutro» en gris. */
export interface AvisoDePieza {
  corto: string;
  largo?: string;
  tono: "atencion" | "neutro";
}

export interface ContextoDelResumen {
  slotDelPanel: HTMLElement | null;
  queSigueOcupado: boolean;
  piezas: PiezaParaQueSigue[];
  abrirPieza: (slug: string) => void;
  aLaVista: boolean;
  /** ¿Se está mirando el proyecto? Falso mientras se mira algo de la cuenta: el documento del
   *  handoff se desmonta, como fuera del Resumen (sus entradas de deshacer no quedan vivas). */
  proyectoVisible: boolean;
  onEtapa: (meta: string | null) => void;
  onQueSigue: (q: QueSigueDelProyecto | null) => void;
  onAvisosDePiezas: (avisos: Record<string, AvisoDePieza>) => void;
}

const VACIO: ContextoDelResumen = {
  slotDelPanel: null,
  queSigueOcupado: false,
  piezas: [],
  abrirPieza: () => {},
  aLaVista: false,
  proyectoVisible: true,
  onEtapa: () => {},
  onQueSigue: () => {},
  onAvisosDePiezas: () => {},
};

const Ctx = createContext<ContextoDelResumen>(VACIO);

export const ProveedorDelResumen = Ctx.Provider;

export function useContextoDelResumen(): ContextoDelResumen {
  return useContext(Ctx);
}
