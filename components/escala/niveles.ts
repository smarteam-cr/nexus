/**
 * components/escala/niveles.ts — el color de cada nivel. Solo presentación.
 *
 * Los cinco niveles se distinguen por color Y por posición (y siempre llevan su nombre al lado):
 * el color ayuda a ubicarse, no carga significado solo. Tokens del tema, nunca hex sueltos.
 * Funcional es «la base» (la escala la llama así): se marca además con el borde punteado, el mismo
 * anillo punteado del radar del diagnóstico.
 */
import type { Letra } from "@/lib/escala/documento/tipos";

/** El punto de color (clase de fondo). */
export const PUNTO_DE_NIVEL: Record<Letra, string> = {
  D: "bg-destructive",
  I: "bg-warning",
  F: "bg-success",
  E: "bg-info",
  O: "bg-secondary",
};

/** El mismo color como variable CSS, para el SVG del mapa. */
export const COLOR_DE_NIVEL: Record<Letra, string> = {
  D: "var(--color-destructive)",
  I: "var(--color-warning)",
  F: "var(--color-success)",
  E: "var(--color-info)",
  O: "var(--color-secondary)",
};

export function nombreDe(niveles: { letra: Letra; nombre: string }[], letra: Letra): string {
  return niveles.find((n) => n.letra === letra)?.nombre ?? letra;
}
