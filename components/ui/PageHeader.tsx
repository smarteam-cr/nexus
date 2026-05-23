import { cn } from "@/lib/cn";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Encabezado de página estandarizado — título + descripción + acción opcional.
 * Unifica el encabezado que cada página de listado construía a mano.
 */
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
