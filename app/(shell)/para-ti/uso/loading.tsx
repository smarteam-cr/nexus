/**
 * Loading de /para-ti/uso («Uso de Nexus»).
 *
 * FORMA REAL: PageHeader con «← Para ti» · las pestañas y el período · la lista de personas por equipo, con dos barras
 * cada una (días que entró y uso de la IA).
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
      <SkeletonPanel minH="min-h-[420px]" bodyClassName="p-4 space-y-2">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-3.5 w-40" delay={i * 30} />
            <Skeleton className="h-3 flex-1" delay={i * 30 + 15} />
            <Skeleton className="h-3 flex-1" delay={i * 30 + 25} />
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
