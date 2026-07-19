import { cn } from "@/lib/cn";
import { Input } from "./Input";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface SearchFilterBarProps {
  /** Configuración del campo de búsqueda de texto (opcional). */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Slot para filtros adicionales — selects, tabs de rol, etc. */
  children?: React.ReactNode;
  /** Acción alineada a la derecha — normalmente el botón primario. */
  action?: React.ReactNode;
  className?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Barra de búsqueda y filtros — toolbar componible. Estandariza el patrón de
 * búsqueda que antes solo existía en la vista de Conocimiento.
 */
export function SearchFilterBar({
  search,
  children,
  action,
  className,
}: SearchFilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 mb-5", className)}>
      {search && (
        <div className="relative w-full sm:w-72">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Buscar…"}
            className="pl-9"
            aria-label="Buscar"
          />
        </div>
      )}

      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}

      {action && <div>{action}</div>}
    </div>
  );
}
