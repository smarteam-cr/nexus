/**
 * Loading skeleton de /customer-success — la cartera se arma con varias consultas por lote
 * (loadPortfolio es la más cara del sistema); sin esto la navegación quedaba congelada.
 *
 * FORMA REAL (page.tsx → CsPanel, rediseño 2026-10-04), en dos columnas:
 *   · contenido: cabecera · aviso de datos viejos · «La cartera en una línea» (4 casillas) ·
 *     «Entrega de proyectos» (4 botones) · pestañas · tabla de «A quién llamar»
 *   · panel derecho (360 px): «Qué sigue» · de dónde salen los datos · qué es cada marca
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonTabs, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CustomerSuccessLoading() {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(SHELL_DEFAULT, "min-w-0 flex-1")}>
        <PageHeaderSkeleton titleWidth="w-48" descWidth="w-80" />

        <section className="mb-3">
          <Skeleton className="h-3 w-40" />
          <div className="mt-2 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[96px]" bodyClassName="px-4 py-3.5 space-y-2">
                <Skeleton className="h-6 w-28" delay={i * 50} />
                <Skeleton className="h-3 w-36" delay={i * 50} />
                <Skeleton className="h-3 w-44" delay={i * 50} />
              </SkeletonPanel>
            ))}
          </div>
        </section>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-36" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[30px] w-32" rounded="lg" delay={i * 40} />
          ))}
        </div>

        <SkeletonTabs count={6} className="mb-4" />
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-[34px] w-96 max-w-full" rounded="lg" />
        </div>
        <TableSkeleton columns={6} rows={8} />
      </main>

      <aside className="flex flex-col gap-6 border-t border-line bg-surface-muted px-5 py-8 lg:w-[360px] lg:flex-shrink-0 lg:border-l lg:border-t-0">
        <div className="space-y-2 rounded-xl border border-info-line bg-info-surface p-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-7 w-32" rounded="md" />
        </div>
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-44" />
          <SkeletonPanel minH="min-h-[300px]" bodyClassName="divide-y divide-line">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between gap-3 px-3 py-2.5">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" delay={i * 40} />
                  <Skeleton className="h-3 w-44" delay={i * 40} />
                </div>
                <Skeleton className="h-3 w-16" delay={i * 40} />
              </div>
            ))}
          </SkeletonPanel>
        </div>
      </aside>
    </div>
  );
}
