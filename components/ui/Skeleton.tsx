import { cn } from "@/lib/cn";

// ── Radios ─────────────────────────────────────────────────────────────────────

const ROUNDED = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

// ── Skeleton ───────────────────────────────────────────────────────────────────

export interface SkeletonProps {
  className?: string;
  rounded?: keyof typeof ROUNDED;
  /** Retraso de la animación en ms — útil para escalonar listas. */
  delay?: number;
}

/**
 * Bloque de carga — usa siempre la animación `skeleton-shimmer` definida en
 * globals.css. Única técnica de skeleton del proyecto (reemplaza `animate-pulse`).
 */
export function Skeleton({ className, rounded = "md", delay }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton-shimmer", ROUNDED[rounded], className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

// ── SkeletonText ───────────────────────────────────────────────────────────────

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Varias líneas de skeleton; la última más corta para simular un párrafo. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 && lines > 1 && "w-2/3")}
          delay={i * 80}
        />
      ))}
    </div>
  );
}
