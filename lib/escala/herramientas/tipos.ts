/**
 * lib/escala/herramientas/tipos.ts — la forma del MAPA DE HERRAMIENTAS. PURO.
 *
 * El mapa dice, criterio por criterio, dónde ayuda cada herramienta (Insider One, HubSpot…) y dónde
 * entra el trabajo de Smarteam. Vive AL LADO de la escala, nunca adentro: la escala no nombra
 * herramientas, y el mapa nombra criterios de la escala por su identificador. Pedido de Elías
 * (2026-10-01): «no ponerlo explícitamente, sino en qué criterios… aplica una herramienta u otra».
 *
 * Es interno: lo lee solo la sección de la escala y nunca llega a un documento que ve el cliente
 * (lo cuida `lib/escala/guardas.test.ts`).
 *
 * Todo lo que tiene contenido sale del documento publicado (`docs/escala/mapa_de_herramientas.md`);
 * acá solo hay forma, más la paleta: los colores que el documento puede elegir para cada herramienta.
 */
import type { Letra } from "../documento/tipos";

/**
 * Los colores que admite el documento. Ninguno reemplaza el color de una celda de la rueda, que es
 * siempre el de su nivel: la herramienta va como una marca encima (un punto con su sigla).
 */
export type ColorDeHerramienta = "celeste" | "naranja" | "fucsia" | "turquesa" | "lima";
export const COLORES_DE_HERRAMIENTA: readonly ColorDeHerramienta[] = ["celeste", "naranja", "fucsia", "turquesa", "lima"];

/** Solo se mapean criterios de Funcional para arriba: Deficiente e Inicial describen lo que falta. */
export const LETRAS_QUE_SE_MAPEAN: readonly Letra[] = ["F", "E", "O"];

export interface Herramienta {
  /** `insider`: lo que viaja en la URL (`?h=insider,hubspot`). */
  clave: string;
  /** «Insider One». */
  nombre: string;
  /** La letra de su marca en la rueda («I»). Por defecto, la inicial del nombre. */
  sigla: string;
  color: ColorDeHerramienta;
  queEs: string;
  cuandoConviene: string | null;
  /** Fecha de la última revisión, tal como la escribe el documento. */
  revisado: string | null;
  responsable: string | null;
  /** Id de criterio → qué aporta la herramienta ahí, en una línea. */
  aportes: Record<string, string>;
}

export interface EntradaDelHistorialDelMapa {
  version: string;
  fecha: string;
  texto: string;
}

export interface MapaDeHerramientas {
  version: string;
  /** Con qué versión de la escala se armó. Al publicar, se valida contra la que se publica. */
  escala: string | null;
  fecha: string | null;
  estado: string | null;
  /** Los párrafos que explican el mapa, antes de la primera herramienta (con sus negritas de markdown). */
  intro: string[];
  herramientas: Herramienta[];
  historial: EntradaDelHistorialDelMapa[];
}
