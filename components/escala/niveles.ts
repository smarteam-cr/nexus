/**
 * components/escala/niveles.ts — el color de cada nivel. Solo presentación.
 *
 * Los cinco niveles se distinguen por color Y por posición (y siempre llevan su nombre al lado):
 * el color ayuda a ubicarse, no carga significado solo. Son los colores de nivel del sistema
 * «Nexus · interfaz interna» (`--color-nivel-*` en globals.css): la identidad del nivel, no un
 * estado, así que no se mueven si cambia el rojo de «peligro» o el verde de «confirmado».
 * Funcional es «la base» (la escala la llama así): se marca con un chip blanco «La base» y, en el
 * mapa, con el círculo punteado, el mismo anillo del radar del diagnóstico.
 */
import type { Letra } from "@/lib/escala/documento/tipos";

/** El punto de color (clase de fondo). */
export const PUNTO_DE_NIVEL: Record<Letra, string> = {
  D: "bg-nivel-deficiente",
  I: "bg-nivel-inicial",
  F: "bg-nivel-funcional",
  E: "bg-nivel-eficiente",
  O: "bg-nivel-optimo",
};

/** El mismo color como variable CSS, para el SVG del mapa. */
export const COLOR_DE_NIVEL: Record<Letra, string> = {
  D: "var(--color-nivel-deficiente)",
  I: "var(--color-nivel-inicial)",
  F: "var(--color-nivel-funcional)",
  E: "var(--color-nivel-eficiente)",
  O: "var(--color-nivel-optimo)",
};

export function nombreDe(niveles: { letra: Letra; nombre: string }[], letra: Letra): string {
  return niveles.find((n) => n.letra === letra)?.nombre ?? letra;
}
