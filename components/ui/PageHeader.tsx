import { cn } from "@/lib/cn";
import { BackLink } from "./BackLink";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Chips blancos junto al título (una versión, un estado), como los de la cabecera de una ficha. */
  badges?: React.ReactNode;
  /** Detalle a profundidad 1: "← {backLabel}" arriba del título (excluyente con crumbs). */
  backHref?: string;
  backLabel?: string;
  /** Profundidad 2+: migas arriba del título (excluyente con backHref). */
  crumbs?: Crumb[];
  className?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Encabezado de página estandarizado — título + descripción + acción opcional,
 * con el modelo de "dónde estoy" integrado: `backHref` (profundidad 1) o
 * `crumbs` (profundidad 2+), nunca ambos (regla §1-UI).
 */
export function PageHeader({
  title,
  description,
  action,
  badges,
  backHref,
  backLabel,
  crumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {crumbs && crumbs.length > 0 ? (
        <Breadcrumbs crumbs={crumbs} className="mb-2" />
      ) : backHref ? (
        <BackLink href={backHref} className="mb-2">
          {backLabel ?? "Volver"}
        </BackLink>
      ) : null}
      {/* En un celular, las acciones bajan debajo del título en vez de salirse de la pantalla: el título
          se reparte desde 240 px, así en escritorio todo sigue en una fila. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          {badges ? (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-fg">{title}</h1>
              {badges}
            </div>
          ) : (
            <h1 className="text-xl font-semibold text-fg">{title}</h1>
          )}
          {description && <p className="text-sm text-fg-secondary mt-0.5">{description}</p>}
        </div>
        {action && <div className="max-w-full flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
