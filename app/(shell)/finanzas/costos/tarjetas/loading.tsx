/**
 * Loading de /finanzas/costos/tarjetas — reserva la cáscara real: encabezado,
 * la fila de dos tiles de resumen y tres tarjetas. No usa el skeleton de las
 * hojas de categoría: su forma es otra (tarjetas apiladas, no una lista) y
 * heredarlo prometería una pantalla que no llega.
 */
import { PageHeaderSkeleton, SkeletonPanel } from "@/components/ui/Skeleton";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function TarjetasLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SkeletonPanel minH="min-h-[84px]" />
          <SkeletonPanel minH="min-h-[84px]" />
        </div>
        <div className="space-y-3">
          <SkeletonPanel minH="min-h-[132px]" />
          <SkeletonPanel minH="min-h-[132px]" />
          <SkeletonPanel minH="min-h-[132px]" />
        </div>
      </div>
    </div>
  );
}
