/**
 * Loading de /finanzas/costos/comisiones-vendedor — encabezado, la tabla de lo
 * devengado y la de reglas. Dos bloques, que es la forma real de la pantalla.
 */
import { PageHeaderSkeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ComisionesVendedorLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <SkeletonPanel minH="min-h-[56px]" />
        <TableSkeleton columns={5} rows={5} />
        <TableSkeleton columns={4} rows={3} />
      </div>
    </div>
  );
}
