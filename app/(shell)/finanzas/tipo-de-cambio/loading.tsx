/**
 * Loading skeleton de /finanzas/tipo-de-cambio.
 *
 * FORMA REAL (page.tsx → TipoDeCambioClient): PageHeader con «Actualizar» · **4** tiles en `sm:grid-cols-2
 * lg:grid-cols-4` (venta de hoy, promedio del mes, en 30 días, lo que se usaba) · el panel «Día por día» con leyenda,
 * selector de rango y el gráfico de 260px · y la tabla «Mes a mes» de 7 columnas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, CardsSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

const MESES = 8;

export default function TipoDeCambioLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[36rem] max-w-full" />

      <div className="flex flex-col gap-6">
        <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[104px]" className="gap-3" />

        {/* «Día por día»: título + leyenda a la izquierda, selector de rango a la derecha, gráfico de 260px */}
        <SkeletonPanel minH="min-h-[340px]" bodyClassName="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-2.5 w-72 max-w-full" delay={40} />
            </div>
            <Skeleton className="h-8 w-56 flex-shrink-0" />
          </div>
          <Skeleton className="h-[260px] w-full" delay={80} />
        </SkeletonPanel>

        {/* «Mes a mes»: 7 columnas numéricas */}
        <SkeletonPanel
          minH="min-h-[320px]"
          bodyClassName="p-0"
          header={
            <div className="flex items-center gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 flex-1" delay={i * 30} />
              ))}
            </div>
          }
        >
          {Array.from({ length: MESES }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-2.5 last:border-0">
              {Array.from({ length: 7 }).map((_, c) => (
                <Skeleton key={c} className="h-3.5 flex-1" delay={r * 40 + c * 15} />
              ))}
            </div>
          ))}
        </SkeletonPanel>
      </div>
    </div>
  );
}
