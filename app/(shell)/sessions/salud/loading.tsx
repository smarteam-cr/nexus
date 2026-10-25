/**
 * Loading de /sessions/salud («Salud de las reuniones», T1).
 *
 * FORMA REAL: PageHeader con «← Sesiones» y el periodo · la fila de números (el porcentaje con su barra y cinco
 * números) · las cuatro pestañas · la tabla por persona (una fila por persona: nombre, siete números y la barra).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function SaludDeLasReunionesLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[28rem] max-w-full" />
      <SkeletonPanel minH="min-h-[120px]" bodyClassName="flex flex-wrap gap-7 p-5">
        <div className="flex-[1.6_1_280px] space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-24" delay={20} />
          <Skeleton className="h-2 w-full" delay={40} />
          <Skeleton className="h-3 w-56" delay={60} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-[1_1_120px] space-y-2">
            <Skeleton className="h-3 w-24" delay={i * 30} />
            <Skeleton className="h-7 w-12" delay={i * 30 + 15} />
            <Skeleton className="h-3 w-28" delay={i * 30 + 30} />
          </div>
        ))}
      </SkeletonPanel>
      <div className="flex gap-6 border-b border-line pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" delay={40} />
        <Skeleton className="h-4 w-32" delay={80} />
        <Skeleton className="h-4 w-24" delay={120} />
      </div>
      <SkeletonPanel minH="min-h-[420px]" bodyClassName="p-5 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full" delay={i * 30} />
            <Skeleton className="h-3.5 w-40" delay={i * 30 + 10} />
            <Skeleton className="h-3 flex-1" delay={i * 30 + 20} />
            <Skeleton className="h-2 w-40" delay={i * 30 + 30} />
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
