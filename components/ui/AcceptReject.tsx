"use client";

/**
 * components/ui/AcceptReject.tsx — EL PAR ACEPTAR / DESCARTAR, Y LOS ✓ ✗ DE TODO NEXUS.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Hasta 2026-08-11 los "aceptar/descartar" del repo eran los CARACTERES `✓` y `✗`
 * escritos a mano dentro de un <button> (62 apariciones en 33 archivos). Tres problemas
 * reales, no cosméticos:
 *   1. Un glifo de texto lo dibuja la FUENTE DEL SISTEMA — cambia de forma, grosor y
 *      alineación vertical entre Windows, macOS y Linux. Nunca se ven igual dos veces.
 *   2. No tienen área de click propia: el target real era el ancho del carácter (~8px),
 *      abajo del mínimo táctil de 24px.
 *   3. Sin nombre accesible: un lector de pantalla leía "marca de verificación".
 * Acá se resuelven de una vez, con SVG (lucide, la librería que el repo ya usa) dentro de
 * un botón de verdad, con foco visible y `aria-label` OBLIGATORIO POR TIPO — mismo
 * criterio que `IconButton.tsx`: la accesibilidad que depende de acordarse se pierde.
 *
 * ── LA JERARQUÍA, QUE ES UNA DECISIÓN DE DISEÑO ──────────────────────────────
 * Aceptar y descartar NO pesan igual y no se pintan igual: aceptar es la acción que el
 * usuario vino a hacer (verde, con fondo tenue, siempre visible); descartar es la salida
 * (neutra en reposo, roja recién al hover). Dos botones igual de gritones compiten entre
 * sí y obligan a leer el tooltip antes de cada click.
 *
 * `emerald-*` y `red-*` son colores de SIGNIFICADO (éxito / peligro), no neutros de
 * relleno — por eso no los toca el ratchet de tokens (lib/ui/token-vocab.test.ts, que
 * cuenta grises crudos). El resto del componente sí usa tokens semánticos.
 */

import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

const CAJA = {
  xs: "w-5 h-5 rounded",
  sm: "w-6 h-6 rounded-md",
  md: "w-7 h-7 rounded-md",
} as const;

const GLIFO = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
} as const;

export interface AccionProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Nombre accesible ("Aceptar la sugerencia") — obligatorio, no compila sin él. */
  "aria-label": string;
  size?: keyof typeof CAJA;
}

const BASE =
  "inline-flex items-center justify-center flex-shrink-0 border transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 " +
  "disabled:opacity-40 disabled:pointer-events-none";

/** ACEPTAR — la acción afirmativa. Verde tenue en reposo (se ve sin buscarla). */
export function AcceptButton({ size = "sm", className, title, ...props }: AccionProps) {
  return (
    <button
      type="button"
      title={title ?? props["aria-label"]}
      className={cn(
        BASE,
        "border-emerald-600/40 bg-emerald-500/10 text-emerald-400",
        "hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:text-emerald-300",
        "focus-visible:ring-emerald-500/60",
        CAJA[size],
        className,
      )}
      {...props}
    >
      <Check className={GLIFO[size]} strokeWidth={2.75} aria-hidden />
    </button>
  );
}

/** DESCARTAR — la salida. Neutra en reposo; se vuelve roja recién al apuntarla. */
export function RejectButton({ size = "sm", className, title, ...props }: AccionProps) {
  return (
    <button
      type="button"
      title={title ?? props["aria-label"]}
      className={cn(
        BASE,
        "border-line bg-surface-hover text-fg-muted",
        "hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400",
        "focus-visible:ring-red-500/50",
        CAJA[size],
        className,
      )}
      {...props}
    >
      <X className={GLIFO[size]} strokeWidth={2.75} aria-hidden />
    </button>
  );
}

/* ── Los decorativos ─────────────────────────────────────────────────────────
   Para el `✓` que NO es un botón sino una marca dentro de una frase ("✓ Al día",
   "✓ Handoff", "Guardado ✓"). Van con `aria-hidden`: el texto de al lado ya dice
   qué pasó, y un lector de pantalla anunciando "marca de verificación" antes de
   cada frase es ruido. Heredan el color por `currentColor` — el caller decide.  */

export function IconCheck({ className }: { className?: string }) {
  return <Check className={cn("inline-block flex-shrink-0 w-3.5 h-3.5", className)} strokeWidth={2.75} aria-hidden />;
}

export function IconX({ className }: { className?: string }) {
  return <X className={cn("inline-block flex-shrink-0 w-3.5 h-3.5", className)} strokeWidth={2.75} aria-hidden />;
}
