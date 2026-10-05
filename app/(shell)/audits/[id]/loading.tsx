/**
 * Loading skeleton de /audits/[id] (la ficha de una auditoría).
 *
 * FORMA REAL (page.tsx → FichaDeAuditoria): la cabecera de la ficha a todo el ancho (h-14, con borde
 * abajo) y, debajo, tres columnas: las secciones (14,5rem), el Resumen al centro —su título, la
 * franja de sugerencias y las cifras de a cuatro— y el panel (18,75rem) desde xl.
 */
import { Skeleton, SkeletonPanel } from "@/components/ui";

export default function AuditoriaLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line px-4">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-3 w-44" delay={80} />
      </div>
      <div className="flex-1 bg-surface-muted lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_18.75rem]">
        {/* Las secciones. */}
        <div className="space-y-3 border-b border-line bg-surface px-5 py-5 lg:border-b-0 lg:border-r">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-3 w-28" delay={i * 30} />
          ))}
        </div>
        {/* El Resumen. */}
        <div className="space-y-6 px-6 py-6 xl:px-8">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-2/3" delay={80} />
          </div>
          <SkeletonPanel minH="min-h-[3.25rem]" bodyClassName="p-3">
            <Skeleton className="h-3 w-1/2" />
          </SkeletonPanel>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[6.5rem]" bodyClassName="p-4">
                <Skeleton className="h-3 w-20" delay={i * 30} />
                <Skeleton className="mt-3 h-5 w-24" delay={i * 30 + 60} />
              </SkeletonPanel>
            ))}
          </div>
        </div>
        {/* El panel: qué sigue, lecturas, conexión y análisis. */}
        <div className="hidden space-y-4 border-l border-line px-5 py-6 xl:block">
          <SkeletonPanel minH="min-h-[6rem]">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-3 w-40" delay={80} />
          </SkeletonPanel>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-16" delay={i * 40} />
              <Skeleton className="h-3 w-36" delay={i * 40 + 60} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
