/**
 * Loading de /para-ti/uso («Uso de Nexus»).
 *
 * FORMA REAL: PageHeader con «← Para ti» · las pestañas · tres números · el calendario de días con uso (una fila por
 * persona, agrupadas por equipo).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function UsoDeNexusLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-96 max-w-full" />
      <div className="flex gap-4 border-b border-line pb-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-28" delay={40} />
        <Skeleton className="h-4 w-24" delay={80} />
        <Skeleton className="h-4 w-28" delay={120} />
        <Skeleton className="h-4 w-24" delay={160} />
        <Skeleton className="h-4 w-36" delay={200} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[84px]" bodyClassName="px-4 py-3 space-y-2">
            <Skeleton className="h-3 w-32" delay={i * 40} />
            <Skeleton className="h-5 w-16" delay={i * 40 + 20} />
          </SkeletonPanel>
        ))}
      </div>
      <SkeletonPanel minH="min-h-[420px]" bodyClassName="p-4 space-y-2">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-40" delay={i * 30} />
            <Skeleton className="h-3 flex-1" delay={i * 30 + 15} />
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
