/**
 * Loading skeleton de /finanzas/equilibrio.
 *
 * FORMA REAL (page.tsx → PuntoDeEquilibrio, rediseño 2026-10-05): PageHeader con acción · la franja de «preliminar» ·
 * la respuesta (la barra contra el piso a la izquierda; el margen y lo que viene a la derecha) · el gráfico mes a mes
 * (leyenda de chips + 300 px + la tira de meses) · de la venta a la caja (tres pasos y tres filas; por servicio al lado)
 * · tres tarjetas de firmeza · la agenda para decidir.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonChart } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function EquilibrioLoading() {
  return (
    <div className={`${SHELL_DEFAULT} flex flex-col gap-6`}>
      <PageHeaderSkeleton titleWidth="w-60" descWidth="w-[36rem] max-w-full" action />
      <Skeleton className="h-10 w-full rounded-[10px]" />

      {/* La respuesta */}
      <div className="flex flex-wrap gap-3">
        <SkeletonPanel minH="min-h-[260px]" className="min-w-0 flex-[2_1_560px]" bodyClassName="p-5 space-y-4">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-8 w-full rounded-md" delay={40} />
          <Skeleton className="h-3 w-3/4" delay={80} />
          <Skeleton className="h-3 w-2/3" delay={120} />
        </SkeletonPanel>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          {[0, 1].map((i) => (
            <SkeletonPanel key={i} minH="min-h-[124px]" bodyClassName="p-4 space-y-2">
              <Skeleton className="h-3 w-36" delay={i * 60} />
              <Skeleton className="h-6 w-28" delay={i * 60 + 20} />
              <Skeleton className="h-3 w-full" delay={i * 60 + 40} />
            </SkeletonPanel>
          ))}
        </div>
      </div>

      {/* Mes a mes */}
      <SkeletonPanel minH="min-h-[460px]" bodyClassName="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="ml-auto h-7 w-48 flex-shrink-0 rounded-[10px]" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" delay={i * 20} />
          ))}
        </div>
        <div className="h-[300px]">
          <SkeletonChart bars={12} />
        </div>
      </SkeletonPanel>

      {/* De la venta a la caja */}
      <div className="flex flex-wrap gap-3">
        <SkeletonPanel minH="min-h-[300px]" className="min-w-0 flex-[2_1_600px]" bodyClassName="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 rounded-[10px] border border-line p-3.5">
                <Skeleton className="h-3 w-16" delay={i * 40} />
                <Skeleton className="h-6 w-28" delay={i * 40 + 20} />
                <Skeleton className="h-3 w-full" delay={i * 40 + 40} />
              </div>
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" delay={120 + i * 40} />
          ))}
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[300px]" className="min-w-0 flex-[1_1_300px]" bodyClassName="p-5 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" delay={i * 30} />
          ))}
        </SkeletonPanel>
      </div>

      {/* Firmeza */}
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[200px]" bodyClassName="p-5 space-y-3">
            <Skeleton className="h-4 w-48" delay={i * 50} />
            <Skeleton className="h-3 w-full" delay={i * 50 + 20} />
            <Skeleton className="h-3 w-5/6" delay={i * 50 + 40} />
            <Skeleton className="h-3 w-2/3" delay={i * 50 + 60} />
          </SkeletonPanel>
        ))}
      </div>

      {/* Para decidir */}
      <SkeletonPanel minH="min-h-[320px]" bodyClassName="p-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
            <Skeleton className="h-5 w-14 rounded-full" delay={i * 40} />
            <Skeleton className="h-4 flex-1" delay={i * 40 + 20} />
            <Skeleton className="h-7 w-24 rounded-lg" delay={i * 40 + 40} />
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
