import { cn } from "@/lib/cn";
import { forwardRef } from "react";

// ── Input ──────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "ghost";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full text-sm transition-colors focus:outline-none placeholder:text-gray-600",
          variant === "default" && [
            "px-3 py-2 rounded-lg",
            "bg-gray-800 border border-gray-700 text-white",
            "focus:border-brand/50",
          ],
          variant === "ghost" && [
            "bg-transparent border-b border-gray-700 text-gray-100 pb-1.5",
            "focus:border-brand-light",
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
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full text-sm transition-colors focus:outline-none placeholder:text-gray-600 resize-none",
          variant === "default" && [
            "px-3 py-2.5 rounded-xl",
            "bg-gray-900 border border-gray-800 text-gray-100",
            "focus:border-gray-700 focus:ring-1 focus:ring-gray-700/50",
          ],
          variant === "ghost" && [
            "bg-transparent text-gray-400",
            "focus:text-gray-200",
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

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none",
          "bg-gray-800 border border-gray-700 text-gray-300",
          "focus:border-brand/50",
          className
        )}
        {...props}
      />
    );
  }
);

Select.displayName = "Select";
