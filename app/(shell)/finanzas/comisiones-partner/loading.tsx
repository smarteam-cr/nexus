/**
 * Loading de /finanzas/comisiones-partner — encabezado, la fila de totales por
 * partner y la tabla de comisiones.
 */
import { PageHeaderSkeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ComisionesPartnerLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SkeletonPanel minH="min-h-[72px]" />
          <SkeletonPanel minH="min-h-[72px]" />
          <SkeletonPanel minH="min-h-[72px]" />
          <SkeletonPanel minH="min-h-[72px]" />
        </div>
        <TableSkeleton columns={5} rows={6} />
      </div>
    </div>
  );
}
