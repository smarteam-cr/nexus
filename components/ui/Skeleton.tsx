import { cn } from "@/lib/cn";

/**
 * VOCABULARIO DE SKELETONS — el set mínimo de la app.
 *
 * REGLA MEDULAR: el átomo `Skeleton` es una LÍNEA (o un chip, o un avatar), NUNCA un panel.
 * Una región de layout se reserva con `SkeletonPanel`: cáscara DELINEADA (border-line) con el
 * shimmer en las líneas de adentro. Un rectángulo relleno de más de `h-12` es un "slab opaco":
 * ocupa el espacio pero no comunica qué viene, y se lee peor que un vacío.
 * Referencia de oro del patrón estructural: components/clients/ProjectGPS.tsx.
 *
 * El set: Skeleton · SkeletonText · SkeletonPanel · CardsSkeleton · ListSkeleton ·
 *         TableSkeleton · SkeletonTabs · SkeletonChart · PageHeaderSkeleton.
 * Si necesitás una forma que no está acá, componela con SkeletonPanel — no escribas un slab.
 */

// ── Radios ─────────────────────────────────────────────────────────────────────

const ROUNDED = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

// ── Skeleton (átomo) ───────────────────────────────────────────────────────────

export interface SkeletonProps {
  className?: string;
  rounded?: keyof typeof ROUNDED;
  /** Retraso de la animación en ms — útil para escalonar listas. */
  delay?: number;
}

/**
 * Bloque de carga — usa siempre la animación `skeleton-shimmer` definida en
 * globals.css. Única técnica de skeleton del proyecto (reemplaza `animate-pulse`).
 *
 * SOLO para líneas, chips, avatares y botones: alto máximo `h-12`. Para reservar un
 * panel usá `SkeletonPanel` (si estás por escribir `h-72` acá, estás haciendo un slab).
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
  /** Pinta una línea de etiqueta corta encima del párrafo. */
  label?: boolean;
  className?: string;
}

/** Varias líneas de skeleton; la última más corta para simular un párrafo. */
export function SkeletonText({ lines = 3, label = false, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && <Skeleton className="h-2.5 w-24 mb-3" />}
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

// ── SkeletonPanel ──────────────────────────────────────────────────────────────

export interface SkeletonPanelProps {
  /**
   * Altura mínima reservada — OBLIGATORIA a propósito: no se reserva una región sin
   * declarar cuánto ocupa el contenido real. Ej. "min-h-[170px]".
   */
  minH: string;
  /** Barra de cabecera (como la del widget GPS). `true` usa una línea genérica. */
  header?: boolean | React.ReactNode;
  /** Contenido interno del panel (líneas, celdas, filas). Sin hijos queda vacío pero delineado. */
  children?: React.ReactNode;
  className?: string;
  /** Padding del cuerpo. Alinealo con el del panel real. */
  bodyClassName?: string;
}

/**
 * La cáscara DELINEADA que reemplaza al slab opaco. Misma estructura que un panel real
 * de la app: contenedor con borde + cabecera opcional + cuerpo. El shimmer va en los
 * hijos, nunca en el contenedor.
 */
export function SkeletonPanel({
  minH,
  header,
  children,
  className,
  bodyClassName = "p-4",
}: SkeletonPanelProps) {
  return (
    <div className={cn("bg-surface border border-line rounded-xl overflow-hidden", className)}>
      {header && (
        <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
          {header === true ? <Skeleton className="h-4 w-48 max-w-full" /> : header}
        </div>
      )}
      <div className={cn(minH, bodyClassName)}>{children}</div>
    </div>
  );
}

// ── CardsSkeleton ──────────────────────────────────────────────────────────────

const CARD_COLS = {
  1: { sm: "grid-cols-1", md: "grid-cols-1", lg: "grid-cols-1" },
  2: { sm: "grid-cols-1 sm:grid-cols-2", md: "grid-cols-1 md:grid-cols-2", lg: "grid-cols-1 lg:grid-cols-2" },
  3: { sm: "grid-cols-1 sm:grid-cols-3", md: "grid-cols-1 md:grid-cols-3", lg: "grid-cols-1 lg:grid-cols-3" },
  4: { sm: "grid-cols-2 sm:grid-cols-4", md: "grid-cols-2 md:grid-cols-4", lg: "grid-cols-2 lg:grid-cols-4" },
} as const;

export interface CardsSkeletonProps {
  count?: number;
  columns?: keyof typeof CARD_COLS;
  /** Breakpoint en el que la grilla se abre — igualalo al del grid real o salta en tablet. */
  breakpoint?: "sm" | "md" | "lg";
  /** `tile` = métrica compacta (etiqueta + número). `card` = título + párrafo. */
  variant?: "card" | "tile";
  /** Altura mínima de cada celda. */
  minH?: string;
  className?: string;
}

/**
 * Grilla de cards en carga. Cada celda es una cáscara DELINEADA con contenido interno
 * (no un rectángulo relleno) — así se lee como "acá viene una card", no como una lápida.
 */
export function CardsSkeleton({
  count = 3,
  columns = 3,
  breakpoint = "md",
  variant = "card",
  minH,
  className,
}: CardsSkeletonProps) {
  const alto = minH ?? (variant === "tile" ? "min-h-[68px]" : "min-h-[104px]");
  return (
    <div className={cn("grid gap-4", CARD_COLS[columns][breakpoint], className)}>
      {Array.from({ length: count }).map((_, i) =>
        variant === "tile" ? (
          <SkeletonPanel key={i} minH={alto} bodyClassName="px-4 py-3 space-y-2">
            <Skeleton className="h-2.5 w-20" delay={i * 60} />
            <Skeleton className="h-5 w-24" delay={i * 60 + 40} />
          </SkeletonPanel>
        ) : (
          <SkeletonPanel key={i} minH={alto} bodyClassName="p-4 space-y-2.5">
            <Skeleton className="h-3.5 w-2/3" delay={i * 60} />
            <Skeleton className="h-2.5 w-full" delay={i * 60 + 40} />
            <Skeleton className="h-2.5 w-4/5" delay={i * 60 + 80} />
          </SkeletonPanel>
        )
      )}
    </div>
  );
}

// ── ListSkeleton ───────────────────────────────────────────────────────────────

export interface ListSkeletonProps {
  rows?: number;
  /** 1 = solo título; 2 = título + subtítulo (la altura sale de acá + los paddings). */
  lines?: 1 | 2;
  /** Reserva un chip/acción a la derecha de cada fila. */
  trailing?: boolean;
  /** Padding reducido, para listas dentro de columnas angostas. */
  compact?: boolean;
  /** Encabezados de grupo (ej. Vencidos / Esta quincena / Más adelante). */
  groups?: number;
  className?: string;
}

/**
 * Filas apiladas en carga — cada fila es una cáscara DELINEADA con sus líneas dentro,
 * igual que una fila real de lista. La altura sale de `lines` + los paddings: no hace
 * falta un número mágico por call site.
 */
export function ListSkeleton({
  rows = 5,
  lines = 2,
  trailing = false,
  compact = false,
  groups,
  className,
}: ListSkeletonProps) {
  const fila = (i: number) => (
    <div
      key={i}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-line bg-surface",
        compact ? "px-2.5 py-1.5" : "px-4 py-3"
      )}
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className={cn(compact ? "h-2.5 w-28" : "h-3.5 w-40")} delay={i * 60} />
        {lines === 2 && (
          <Skeleton className={cn(compact ? "h-2 w-20" : "h-2.5 w-24")} delay={i * 60 + 40} />
        )}
      </div>
      {trailing && <Skeleton className="h-5 w-16 flex-shrink-0" rounded="full" delay={i * 60} />}
    </div>
  );

  if (groups) {
    const porGrupo = Math.max(1, Math.ceil(rows / groups));
    return (
      <div className={cn("space-y-5", className)}>
        {Array.from({ length: groups }).map((_, g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-2.5 w-32" delay={g * 80} />
            {Array.from({ length: porGrupo }).map((_, i) => fila(g * porGrupo + i))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => fila(i))}
    </div>
  );
}

// ── TableSkeleton ──────────────────────────────────────────────────────────────

export interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  /** Dibuja una fila de toolbar (búsqueda + acciones) sobre la tabla. */
  toolbar?: boolean;
  /** Cuántos botones de acción reserva el toolbar (ej. /clients tiene 2). */
  toolbarActions?: number;
  className?: string;
}

/**
 * Esqueleto con forma de tabla. Vivía escondido en Table.tsx — se mudó acá para que sea
 * visible como parte del vocabulario (Table.tsx lo re-exporta por compatibilidad).
 */
export function TableSkeleton({
  columns = 5,
  rows = 8,
  toolbar = false,
  toolbarActions = 1,
  className,
}: TableSkeletonProps) {
  return (
    <div className={className}>
      {toolbar && (
        // h-[38px] = la altura real del Input (py-2 + text-sm + border) y de los botones.
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-[38px] w-full sm:w-72" rounded="lg" />
          <div className="flex items-center gap-2 ml-auto">
            {Array.from({ length: toolbarActions }).map((_, i) => (
              <Skeleton key={i} className="h-[38px] w-36" rounded="lg" delay={i * 50} />
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-line bg-surface-muted">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 flex-1" />
          ))}
        </div>
        {/* Filas */}
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 px-4 py-3 border-b border-line last:border-0"
          >
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="w-8 h-8 flex-shrink-0" rounded="full" delay={r * 40} />
              <Skeleton className="h-3 flex-1 max-w-[160px]" delay={r * 40} />
            </div>
            {Array.from({ length: Math.max(0, columns - 1) }).map((_, c) => (
              <Skeleton key={c} className="h-3 flex-1" delay={r * 40} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SkeletonTabs ───────────────────────────────────────────────────────────────

export interface SkeletonTabsProps {
  count?: number;
  /** `underline` = tabs con línea inferior (el patrón de la app). `pill` = píldoras. */
  variant?: "underline" | "pill";
  className?: string;
}

/** Barra de pestañas en carga. Reemplaza las 5 implementaciones a mano del mismo widget. */
export function SkeletonTabs({ count = 3, variant = "underline", className }: SkeletonTabsProps) {
  if (variant === "pill") {
    // h-[30px] = la pill real (py-1.5 + text-xs + border).
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-[30px] w-24" rounded="lg" delay={i * 50} />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-6 border-b border-line", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="py-2.5">
          <Skeleton className="h-3.5 w-24" delay={i * 50} />
        </div>
      ))}
    </div>
  );
}

// ── SkeletonChart ──────────────────────────────────────────────────────────────

export interface SkeletonChartProps {
  bars?: number;
  className?: string;
}

/**
 * Área de gráfico en carga: eje Y + barras de altura variable. Va DENTRO de un
 * contenedor que ya fija la altura (SkeletonPanel o un div con h-*).
 */
export function SkeletonChart({ bars = 6, className }: SkeletonChartProps) {
  // Alturas fijas (nada de random: el render debe ser estable entre server y cliente).
  const alturas = ["h-1/3", "h-2/3", "h-1/2", "h-5/6", "h-2/5", "h-3/4", "h-1/2", "h-4/5"];
  return (
    <div className={cn("flex gap-3 h-full", className)}>
      <div className="flex flex-col justify-between py-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-2 w-8" delay={i * 50} />
        ))}
      </div>
      <div className="flex-1 flex items-end gap-2">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full">
            <Skeleton className={alturas[i % alturas.length]} rounded="sm" delay={i * 60} />
          </div>
        ))}
      </div>
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

/**
 * Esqueleto de un PageHeader (título + descripción + acción opcional).
 * Las alturas CALZAN con el PageHeader real: `h1 text-xl` = line-box de 28px (h-7),
 * `mt-0.5` y `p text-sm` = line-box de 20px (la barra fina va centrada adentro).
 * Bloque total: 50px — medido contra components/ui/PageHeader.tsx; si ese cambia,
 * cambiá esto con él.
 */
export function PageHeaderSkeleton({
  titleWidth = "w-40",
  descWidth = "w-72",
  action = false,
  className,
}: PageHeaderSkeletonProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div>
        <Skeleton className={cn("h-7", titleWidth)} />
        {descWidth && (
          <div className="mt-0.5 flex h-5 items-center">
            <Skeleton className={cn("h-3", descWidth)} />
          </div>
        )}
      </div>
      {action && <Skeleton className="h-[38px] w-36 flex-shrink-0" rounded="lg" />}
    </div>
  );
}
