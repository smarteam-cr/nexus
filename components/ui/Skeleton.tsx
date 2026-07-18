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

// ── PageHeaderSkeleton ─────────────────────────────────────────────────────────

export interface PageHeaderSkeletonProps {
  /** Ancho del título (clase Tailwind). */
  titleWidth?: string;
  /** Ancho de la descripción; null omite la línea. */
  descWidth?: string | null;
  /** Reserva el botón de acción a la derecha (evita reflow al llegar el real). */
  action?: boolean;
  className?: string;
}

/** Esqueleto de un PageHeader (título + descripción + acción opcional). */
export function PageHeaderSkeleton({
  titleWidth = "w-40",
  descWidth = "w-72",
  action = false,
  className,
}: PageHeaderSkeletonProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div className="space-y-2">
        <Skeleton className={cn("h-6", titleWidth)} />
        {descWidth && <Skeleton className={cn("h-3", descWidth)} />}
      </div>
      {action && <Skeleton className="h-9 w-36 flex-shrink-0" rounded="lg" />}
    </div>
  );
}

// ── CardsSkeleton ──────────────────────────────────────────────────────────────

const CARD_COLS = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

export interface CardsSkeletonProps {
  count?: number;
  columns?: keyof typeof CARD_COLS;
  /** Clases de cada card — fija la altura para reservar el espacio real. */
  cardClassName?: string;
  className?: string;
}

/** Grilla de cards en carga — reserva la altura del grid final. */
export function CardsSkeleton({
  count = 3,
  columns = 3,
  cardClassName = "h-24",
  className,
}: CardsSkeletonProps) {
  return (
    <div className={cn("grid gap-4", CARD_COLS[columns], className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cardClassName} rounded="xl" delay={i * 60} />
      ))}
    </div>
  );
}

// ── ListSkeleton ───────────────────────────────────────────────────────────────

export interface ListSkeletonProps {
  rows?: number;
  /** Clases de cada fila — fija la altura de la fila real (ej. "h-16"). */
  rowClassName?: string;
  className?: string;
}

/**
 * Filas apiladas en carga — para listas client-fetch (patrón estructural: replica
 * la cáscara del estado cargado y reserva su altura; ver ProjectGPS.tsx).
 */
export function ListSkeleton({ rows = 5, rowClassName = "h-14", className }: ListSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} rounded="xl" delay={i * 60} />
      ))}
    </div>
  );
}
