import { cn } from "@/lib/cn";

// ── Sizes ──────────────────────────────────────────────────────────────────────

const SIZE = {
  xs: "w-2.5 h-2.5 border-[1.5px]",
  sm: "w-3.5 h-3.5 border-2",
  md: "w-4 h-4 border-2",
  lg: "w-5 h-5 border-2",
} as const;

// ── Componente ─────────────────────────────────────────────────────────────────

interface SpinnerProps {
  size?: keyof typeof SIZE;
  /** Clase de color del borde, ej. "border-brand". Por defecto hereda `border-current`. */
  color?: string;
  className?: string;
}

export function Spinner({ size = "sm", color = "border-current", className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border-t-transparent animate-spin flex-shrink-0",
        SIZE[size],
        color,
        className
      )}
      aria-label="Cargando"
    />
  );
}
