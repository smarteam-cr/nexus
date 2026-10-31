/**
 * Loading skeleton de /sales/pipeline.
 *
 * FORMA REAL (page.tsx): SHELL_DEFAULT · PageHeader · tres cifras · las pestañas «Negocios» y «Compromisos» con «Mis
 * negocios / Todos» a la derecha · y la TABLA de seis columnas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonTabs, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function PipelineLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-96" />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonPanel key={i} minH="min-h-20" className="space-y-2 px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
          </SkeletonPanel>
        ))}
      </div>
      <SkeletonTabs count={2} className="mb-4" />
      <TableSkeleton columns={6} rows={8} />
    </div>
  );
}
