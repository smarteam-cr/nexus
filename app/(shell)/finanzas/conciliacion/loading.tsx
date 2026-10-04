/**
 * Loading de /finanzas/conciliacion.
 *
 * FORMA REAL: PageHeader CON acción («Actualizar desde Odoo y Mercury» + línea de copias) · pestañas subrayadas (3) ·
 * dos segmentados de filtro · recuadro de resumen · tarjetas de línea, una debajo de otra.
 */
import { PageHeaderSkeleton, SkeletonPanel, SkeletonTabs, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ConciliacionLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-4`}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[28rem] max-w-full" action />
      <SkeletonTabs count={3} />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-8 w-80 max-w-full rounded-[10px]" />
        <Skeleton className="h-8 w-64 max-w-full rounded-[10px]" delay={40} />
      </div>
      <SkeletonPanel minH="min-h-[76px]" bodyClassName="px-4 py-3 space-y-1.5">
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-3 w-96 max-w-full" delay={40} />
      </SkeletonPanel>
      {Array.from({ length: 4 }, (_, i) => (
        <SkeletonPanel key={i} minH="min-h-[132px]" bodyClassName="p-4 space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" delay={i * 60} />
            <Skeleton className="h-5 w-32 rounded-full" delay={i * 60} />
          </div>
          <Skeleton className="h-4 w-96 max-w-full" delay={i * 60 + 20} />
          <Skeleton className="h-3 w-full max-w-[640px]" delay={i * 60 + 40} />
        </SkeletonPanel>
      ))}
    </div>
  );
}
