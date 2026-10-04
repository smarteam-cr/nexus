/**
 * Loading de /finanzas/integraciones.
 *
 * FORMA REAL: PageHeader CON acción («Actualizar todo») · tres tarjetas en fila (Odoo, Mercury, HubSpot), cada una con
 * título y chip, una línea de copia, filas de dato y un recuadro de lo pendiente · una franja de leyenda.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function IntegracionesFinanzasLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[28rem] max-w-full" action />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonPanel key={i} minH="min-h-[320px]" bodyClassName="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" delay={i * 60} />
              <Skeleton className="h-5 w-20 rounded-full" delay={i * 60} />
            </div>
            <Skeleton className="h-3 w-56 max-w-full" delay={i * 60 + 20} />
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="flex justify-between border-t border-line pt-2">
                <Skeleton className="h-3 w-36" delay={i * 60 + j * 20} />
                <Skeleton className="h-3 w-12" delay={i * 60 + j * 20} />
              </div>
            ))}
            <SkeletonPanel minH="min-h-[64px]" bodyClassName="px-3 py-2.5 space-y-1.5">
              <Skeleton className="h-3 w-32" delay={i * 60 + 80} />
              <Skeleton className="h-4 w-40" delay={i * 60 + 100} />
            </SkeletonPanel>
          </SkeletonPanel>
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-xl" delay={200} />
    </div>
  );
}
