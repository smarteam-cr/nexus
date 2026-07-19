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

/**
 * Indicador de ACCIÓN EN CURSO: un botón guardando, una fila procesándose, un sync
 * de fondo. Es lo único para lo que sirve.
 *
 * NO uses Spinner para reservar una región de layout (un panel, una lista, una página
 * que carga): ahí va un skeleton estructural — `SkeletonPanel`/`ListSkeleton`/etc. Un
 * spinner centrado en un área grande no reserva altura, así que el contenido salta al
 * llegar, que es justo lo que el skeleton evita. Ver components/ui/Skeleton.tsx.
 */
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
