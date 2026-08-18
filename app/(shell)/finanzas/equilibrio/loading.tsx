/**
 * Loading skeleton de /finanzas/equilibrio.
 *
 * FORMA REAL (page.tsx → EquilibrioClient): PageHeader · línea de declaración de la
 * tasa · **7** indicadores en `grid-cols-2 md:grid-cols-4 xl:grid-cols-7` · el panel de
 * la curva (título + chart de 320px + pie con el piso) · el desglose apilado (260px) ·
 * la tabla de 12 meses × 10 columnas · y dos paneles lado a lado (estructura de costos
 * y confiabilidad del dato).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonChart, CardsSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

const MESES = 12;

export default function EquilibrioLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-[32rem] max-w-full" />

      <div className="space-y-4">
        {/* Declaración del tipo de cambio */}
        <Skeleton className="h-2.5 w-80 max-w-full" />

        {/* 7 indicadores del año */}
        <CardsSkeleton count={7} columns={4} breakpoint="md" variant="tile" minH="min-h-[76px]" className="gap-2" />

        {/* La curva: título + chart + pie con el piso */}
        <SkeletonPanel minH="min-h-[400px]" bodyClassName="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-60" />
            <Skeleton className="h-6 w-32 ml-auto flex-shrink-0" />
          </div>
          <div className="h-[320px]">
            <SkeletonChart bars={MESES} />
          </div>
          <Skeleton className="h-2.5 w-full max-w-2xl" delay={60} />
        </SkeletonPanel>

        {/* Desglose apilado + su toggle */}
        <SkeletonPanel minH="min-h-[320px]" bodyClassName="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-6 w-48 ml-auto flex-shrink-0" />
          </div>
          <div className="h-[260px]">
            <SkeletonChart bars={MESES} />
          </div>
        </SkeletonPanel>

        {/* La tabla mes a mes: 10 columnas, con el input de escenario */}
        <SkeletonPanel
          minH="min-h-[420px]"
          bodyClassName="p-0"
          header={
            <div className="flex items-center gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <Skeleton key={i} className="h-2.5 flex-1" delay={i * 30} />
              ))}
            </div>
          }
        >
          {Array.from({ length: MESES }).map((_, r) => (
            <div key={r} className="flex items-center gap-3 px-3 py-2 border-b border-line last:border-0">
              {Array.from({ length: 10 }).map((_, c) => (
                <Skeleton key={c} className="h-3.5 flex-1" delay={r * 30 + c * 15} />
              ))}
            </div>
          ))}
        </SkeletonPanel>

        {/* Estructura de costos + confiabilidad del dato */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonPanel minH="min-h-[240px]" bodyClassName="px-4 py-4 space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-3 w-28" delay={i * 50} />
                  <Skeleton className="h-3 w-24" delay={i * 50 + 20} />
                </div>
                <Skeleton className="h-2 w-full" delay={i * 50 + 40} />
              </div>
            ))}
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[240px]" bodyClassName="p-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-3 border-b border-line last:border-0 space-y-1.5">
                <Skeleton className="h-3 w-full" delay={i * 60} />
                <Skeleton className="h-3 w-3/4" delay={i * 60 + 30} />
              </div>
            ))}
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
