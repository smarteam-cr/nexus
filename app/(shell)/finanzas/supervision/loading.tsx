/**
 * Loading de /finanzas/supervision.
 *
 * FORMA REAL: PageHeader sin acción · tres tarjetas de cifra · a la izquierda «Necesitan tu decisión» (renglones) y la
 * revisión del equipo (tabla); a la derecha dos recuadros de renglones.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function SupervisionLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[30rem] max-w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonPanel key={i} minH="min-h-[96px]" bodyClassName="p-4 space-y-2">
            <Skeleton className="h-3 w-24" delay={i * 40} />
            <Skeleton className="h-6 w-12" delay={i * 40 + 20} />
            <Skeleton className="h-3 w-40" delay={i * 40 + 40} />
          </SkeletonPanel>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_600px] flex-col gap-5">
          <SkeletonPanel minH="min-h-[220px]" bodyClassName="p-4 space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-full" delay={i * 40} />
                <Skeleton className="h-4 flex-1" delay={i * 40 + 20} />
                <Skeleton className="h-7 w-20 rounded-lg" delay={i * 40 + 40} />
              </div>
            ))}
          </SkeletonPanel>
          <TableSkeleton columns={5} rows={5} />
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {Array.from({ length: 2 }, (_, i) => (
            <SkeletonPanel key={i} minH="min-h-[160px]" bodyClassName="p-4 space-y-3">
              <Skeleton className="h-3 w-36" delay={i * 60} />
              <Skeleton className="h-4 w-full" delay={i * 60 + 20} />
              <Skeleton className="h-4 w-full" delay={i * 60 + 40} />
              <Skeleton className="h-4 w-2/3" delay={i * 60 + 60} />
            </SkeletonPanel>
          ))}
        </div>
      </div>
    </div>
  );
}
