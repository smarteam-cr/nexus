"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { forwardRef } from "react";

// ── Variantes ──────────────────────────────────────────────────────────────────

export const buttonVariants = cva(
  // Base
  "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 select-none",
  {
    variants: {
      variant: {
        // Acción principal — par sólido de intención (primary + su texto declarado)
        primary:
          "bg-primary text-primary-fg hover:bg-primary-hover",
        // Acción secundaria — superficie apoyada; el hover sube un escalón (surface-active)
        secondary:
          "bg-surface-hover text-fg-secondary border border-line hover:bg-surface-active hover:text-fg",
        // Acción sutil — brand translúcido
        ghost:
          "bg-brand/10 text-brand-light border border-brand/20 hover:bg-brand/20 hover:border-brand/40",
        // Peligro — rojo sutil
        destructive:
          "bg-transparent text-fg-muted hover:text-red-400 hover:bg-red-500/10",
        // Peligro sólido — par de intención (mismos valores que el viejo red-600/white)
        "destructive-solid":
          "bg-destructive text-destructive-fg hover:bg-destructive-hover",
        // Link / texto plano
        link:
          "bg-transparent text-brand-light hover:text-brand underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "text-xs px-2.5 py-1 rounded-md",
        sm: "text-xs px-3 py-1.5 rounded-lg",
        md: "text-sm px-3 py-2 rounded-lg",
        lg: "text-sm px-4 py-2.5 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
