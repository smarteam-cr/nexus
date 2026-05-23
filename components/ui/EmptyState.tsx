import { cn } from "@/lib/cn";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** "default" = contenido centrado sin caja | "dashed" = caja con borde punteado */
  variant?: "default" | "dashed";
  className?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Estado vacío estandarizado — ícono opcional + título + descripción + acción.
 * Reemplaza las múltiples variantes de "no hay nada aquí" del proyecto.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-16",
        variant === "dashed" && "rounded-xl border border-dashed border-gray-800",
        className
      )}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-600 mb-4">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {description && (
        <p className="text-xs text-gray-600 mt-1 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
