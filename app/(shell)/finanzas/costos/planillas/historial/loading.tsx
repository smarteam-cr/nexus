/**
 * Loading de /finanzas/costos/planillas/historial — reserva la cáscara real:
 * encabezado, la barra de cobertura y dos grupos de mes con sus filas.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function LibroPlanillaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <SkeletonPanel minH="min-h-[52px]" bodyClassName="px-3 py-2">
          <Skeleton className="h-3 w-64 max-w-full" />
        </SkeletonPanel>
        {[0, 1].map((g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <SkeletonPanel minH="min-h-[38px]" bodyClassName="px-3 py-2">
              <Skeleton className="h-3 w-full" />
            </SkeletonPanel>
            <SkeletonPanel minH="min-h-[38px]" bodyClassName="px-3 py-2">
              <Skeleton className="h-3 w-full" />
            </SkeletonPanel>
            <SkeletonPanel minH="min-h-[38px]" bodyClassName="px-3 py-2">
              <Skeleton className="h-3 w-full" />
            </SkeletonPanel>
          </div>
        ))}
      </div>
    </div>
  );
}
