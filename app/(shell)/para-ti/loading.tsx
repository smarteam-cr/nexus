/**
 * Loading de /para-ti.
 *
 * FORMA REAL: PageHeader sin acción · la línea de qué se mide · columna ancha con la franja de
 * lo que dejó el agente y los bloques «Para hoy» y «Esta semana» (encabezado + filas con botón a la derecha) · columna
 * angosta con los avisos y lo que está al día.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Filas({ n, delay = 0 }: { n: number; delay?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-2 w-2 rounded-full" delay={delay + i * 40} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-72 max-w-full" delay={delay + i * 40} />
            <Skeleton className="h-3 w-96 max-w-full" delay={delay + i * 40 + 20} />
          </div>
          <Skeleton className="h-7 w-24 rounded-md" delay={delay + i * 40} />
        </div>
      ))}
    </div>
  );
}

export default function ParaTiLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-28" descWidth="w-96 max-w-full" />
      <Skeleton className="h-3 w-96 max-w-full" delay={40} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          <SkeletonPanel minH="min-h-[150px]" bodyClassName="p-3 space-y-2">
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-11 w-full rounded-lg" delay={40} />
            <Skeleton className="h-11 w-full rounded-lg" delay={80} />
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[230px]" bodyClassName="p-0">
            <div className="px-4 pb-2.5 pt-3.5">
              <Skeleton className="h-4 w-24" />
            </div>
            <Filas n={3} />
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[160px]" bodyClassName="p-0">
            <div className="px-4 pb-2.5 pt-3.5">
              <Skeleton className="h-4 w-28" delay={120} />
            </div>
            <Filas n={2} delay={160} />
          </SkeletonPanel>
        </div>
        <div className="flex min-w-0 max-w-[380px] flex-[1_1_300px] flex-col gap-4">
          <SkeletonPanel minH="min-h-[300px]" bodyClassName="p-4 space-y-3">
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" delay={i * 40} />
                <Skeleton className="h-3 w-24" delay={i * 40 + 20} />
              </div>
            ))}
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[110px]" bodyClassName="p-4 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-full" delay={40} />
            <Skeleton className="h-3 w-3/4" delay={80} />
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
