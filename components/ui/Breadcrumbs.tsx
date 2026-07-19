import Link from "next/link";
import { cn } from "@/lib/cn";

// ── Breadcrumbs ────────────────────────────────────────────────────────────────
//
// Migas para navegación a profundidad 2+ (ej. Clientes › Acme › Cronograma) — el
// modelo de "dónde estoy" que la app no tenía. El crumb de MÓDULO se deriva del
// nav-config (lib/ui/breadcrumbs.ts → moduleCrumb); los crumbs profundos (nombre
// del cliente, título del documento) los pasa la página, que ya tiene el dato en
// el server. El último crumb va sin href (es la página actual, aria-current).
//
// Regla de profundidad (§1-UI): profundidad 1 → <BackLink>; 2+ → esto.

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-xs", className)}>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <svg className="w-3 h-3 flex-shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {c.href && !last ? (
              <Link href={c.href} className="text-fg-muted hover:text-fg transition-colors truncate">
                {c.label}
              </Link>
            ) : (
              <span aria-current={last ? "page" : undefined} className={cn("truncate", last ? "text-fg-secondary" : "text-fg-muted")}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
