/**
 * Loading skeleton de /integrations/gasto-ia.
 *
 * FORMA REAL (page.tsx, «Por mes», que es la pestaña de entrada; contenedor SHELL_DEFAULT): header + la fila de
 * pestañas + cuatro tarjetas de número + el panel del tope + el gráfico de meses + la tabla mes a mes.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function FilaDeTabla({ delay }: { delay: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-line px-5 py-2.5 last:border-0">
      <Skeleton className="h-3 flex-1 max-w-[140px]" delay={delay} />
      <Skeleton className="h-3 w-16 ml-auto flex-shrink-0" delay={delay + 20} />
      <Skeleton className="h-3 w-12 flex-shrink-0" delay={delay + 40} />
      <Skeleton className="h-3 w-16 flex-shrink-0" delay={delay + 60} />
    </div>
  );
}

export default function GastoDeIaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-96" />
      <div className="space-y-6">
        {/* Las pestañas */}
        <div className="flex gap-4 border-b border-line pb-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-3.5 w-20" delay={i * 30} />
          ))}
        </div>

        {/* Los cuatro números */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonPanel key={i} minH="min-h-[112px]" bodyClassName="p-5 space-y-2">
              <Skeleton className="h-2.5 w-24" delay={i * 40} />
              <Skeleton className="h-7 w-24" delay={i * 40 + 40} />
              <Skeleton className="h-3 w-32" delay={i * 40 + 80} />
            </SkeletonPanel>
          ))}
        </div>

        {/* El tope diario */}
        <SkeletonPanel minH="min-h-[104px]" bodyClassName="p-5 space-y-3">
          <Skeleton className="h-3.5 w-32" delay={200} />
          <Skeleton className="h-3 w-full max-w-xl" delay={240} />
          <Skeleton className="h-2.5 w-full max-w-lg" delay={280} />
        </SkeletonPanel>

        {/* El gráfico de meses */}
        <SkeletonPanel minH="min-h-[260px]" bodyClassName="p-5 space-y-3">
          <Skeleton className="h-3 w-40" delay={320} />
        </SkeletonPanel>

        {/* La tabla mes a mes */}
        <SkeletonPanel minH="min-h-[160px]" bodyClassName="">
          {[0, 1, 2, 3].map((f) => (
            <FilaDeTabla key={f} delay={360 + f * 40} />
          ))}
        </SkeletonPanel>
      </div>
    </div>
  );
}
