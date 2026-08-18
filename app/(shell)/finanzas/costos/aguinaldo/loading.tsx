/**
 * Loading de /finanzas/costos/aguinaldo — encabezado, la línea de ventana y la
 * tabla de personas.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function AguinaldoLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <SkeletonPanel minH="min-h-[52px]" bodyClassName="px-3 py-2">
          <Skeleton className="h-3 w-72 max-w-full" />
        </SkeletonPanel>
        <TableSkeleton columns={5} rows={8} />
      </div>
    </div>
  );
}
