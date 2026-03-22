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
        // Acción principal — brand suave
        primary:
          "bg-brand-soft text-white hover:bg-brand-light",
        // Acción secundaria — gris oscuro
        secondary:
          "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white",
        // Acción sutil — brand translúcido
        ghost:
          "bg-brand/10 text-brand-light border border-brand/20 hover:bg-brand/20 hover:border-brand/40",
        // Peligro — rojo sutil
        destructive:
          "bg-transparent text-gray-500 hover:text-red-400 hover:bg-red-500/10",
        // Peligro sólido
        "destructive-solid":
          "bg-red-600 text-white hover:bg-red-500",
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
