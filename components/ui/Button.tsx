"use client";

import { cn } from "@/lib/cn";
import { forwardRef } from "react";
/**
 * ⚠ Las variantes viven en un módulo SIN "use client" y se importan: son un helper
 * de clases, no un componente, y un Server Component tiene que poder llamarlas.
 * Tenerlas acá adentro rompió /finanzas/costos/planillas entera — ver el comentario
 * de `button-variants.ts`. NO re-exportarlas desde este archivo: pasar por un módulo
 * de cliente vuelve a marcar la referencia y el defecto regresa.
 */
import { buttonVariants, type ButtonVariantProps } from "./button-variants";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {
  loading?: boolean;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
