/**
 * lib/servicios/tipos.ts — la forma de la GUÍA de un servicio recurrente. PURO y CLIENT-SAFE.
 *
 * Cada servicio recurrente (hoy SmartLoop) declara su guía en un archivo propio, escrito desde su
 * documento de proceso. Las etapas del ciclo son las del método (lib/servicios/ciclo.ts) y la guía dice,
 * por etapa, lo que pide el documento.
 */
import type { EtapaDelCiclo } from "./ciclo";

export type ClaveDeServicio = "smartloop";

/** Algo que tiene que quedar producido en una etapa. */
export interface Producido {
  /** Estable: lo usa Nexus para marcarlo hecho cuando lo puede comprobar (lib/servicios/guia.ts). */
  clave: string;
  texto: string;
}

export interface GuiaDeEtapa {
  /** Qué hace el CSE en esta etapa, en dos o tres líneas. */
  queHaces: string;
  producido: readonly Producido[];
  /** La señal de que la etapa se saltó. */
  senal: string;
}

export interface GuiaDeServicio {
  clave: ClaveDeServicio;
  nombre: string;
  /** El documento de proceso del que sale la guía (para el enlace «Leer el proceso»). */
  documento: string;
  etapas: Record<EtapaDelCiclo, GuiaDeEtapa>;
  /** La regla para cerrar un ciclo. */
  reglaDeCierre: string;
}
