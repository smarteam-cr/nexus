"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

// ── IconButton ─────────────────────────────────────────────────────────────────
//
// Botón-ícono con nombre accesible OBLIGATORIO POR TIPO: el prop `aria-label` es
// requerido y no compila sin él. Por qué así: la app llegó a tener ~600 <button>
// a mano con ~28 aria-label — las X de cerrar, kebabs y toggles eran anónimos
// para un lector de pantalla. La accesibilidad que depende de una auditoría se
// pierde; la que no compila sin cumplirse, no.
//
// `title` (tooltip nativo) se deriva del aria-label si no se pasa. El ícono lo
// dimensiona el caller (ej. <svg className="w-4 h-4">…</svg> o un ícono de
// lucide-react con className).

const SIZE = {
  xs: "w-6 h-6 rounded-md",
  sm: "w-7 h-7 rounded-md",
  md: "w-[34px] h-[34px] rounded-lg",
} as const;

const VARIANT = {
  /** Transparente; aparece al hover — el default para X de cerrar y toolbars. */
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-hover",
  /** Apoyado con borde — para toolbars donde el botón debe verse sin hover. */
  subtle:
    "bg-surface-hover text-fg-secondary border border-line hover:bg-surface-active hover:text-fg",
  /** Acción de peligro sutil (eliminar en una fila). */
  destructive: "text-fg-muted hover:text-red-400 hover:bg-red-500/10",
} as const;

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Nombre accesible del botón ("Cerrar", "Eliminar fase") — obligatorio. */
  "aria-label": string;
  /** El ícono, ya dimensionado por el caller. */
  icon: React.ReactNode;
  size?: keyof typeof SIZE;
  variant?: keyof typeof VARIANT;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = "sm", variant = "ghost", loading, disabled, className, title, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        title={title ?? props["aria-label"]}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center flex-shrink-0 transition-colors select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
          "disabled:opacity-50 disabled:pointer-events-none",
          SIZE[size],
          VARIANT[variant],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon
        )}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
