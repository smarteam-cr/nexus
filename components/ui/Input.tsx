"use client";

import { cn } from "@/lib/cn";
import { forwardRef } from "react";
import { useFieldContext } from "./Field";

// Los tres controles leen el contexto de <Field> (si existe) y se auto-asignan
// id / aria-describedby / aria-invalid — el consumidor no cablea nada. Props
// explícitas del caller siempre ganan. Fuera de un Field: comportamiento de
// siempre. El borde de error lo pinta la variante aria-invalid:border-red-400.

// ── Input ──────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "ghost";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const field = useFieldContext();
    return (
      <input
        ref={ref}
        id={props.id ?? field?.id}
        aria-describedby={props["aria-describedby"] ?? field?.describedBy}
        aria-invalid={props["aria-invalid"] ?? (field?.invalid || undefined)}
        className={cn(
          "w-full text-sm transition-colors focus:outline-none placeholder:text-fg-muted",
          variant === "default" && [
            "px-3 py-2 rounded-lg",
            "bg-surface-hover border border-line text-fg",
            "focus:border-brand/50 aria-invalid:border-red-400",
          ],
          variant === "ghost" && [
            "bg-transparent border-b border-line text-fg pb-1.5",
            "focus:border-brand-light aria-invalid:border-red-400",
          ],
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

// ── Textarea ───────────────────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "ghost";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const field = useFieldContext();
    return (
      <textarea
        ref={ref}
        id={props.id ?? field?.id}
        aria-describedby={props["aria-describedby"] ?? field?.describedBy}
        aria-invalid={props["aria-invalid"] ?? (field?.invalid || undefined)}
        className={cn(
          "w-full text-sm transition-colors focus:outline-none placeholder:text-fg-muted resize-none",
          variant === "default" && [
            "px-3 py-2.5 rounded-xl",
            "bg-surface border border-line text-fg",
            "focus:border-brand/50 aria-invalid:border-red-400",
          ],
          variant === "ghost" && [
            "bg-transparent text-fg-muted",
            "focus:text-fg-secondary",
          ],
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

// ── Select ─────────────────────────────────────────────────────────────────────

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    const field = useFieldContext();
    return (
      <select
        ref={ref}
        id={props.id ?? field?.id}
        aria-describedby={props["aria-describedby"] ?? field?.describedBy}
        aria-invalid={props["aria-invalid"] ?? (field?.invalid || undefined)}
        className={cn(
          "w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none",
          "bg-surface-hover border border-line text-fg-secondary",
          "focus:border-brand/50 aria-invalid:border-red-400",
          className
        )}
        {...props}
      />
    );
  }
);

Select.displayName = "Select";
