/**
 * Loading de /finanzas/pendientes.
 *
 * FORMA REAL: PageHeader CON acción («Registrar pago») · columna ancha con el bloque «Para hoy» (encabezado + filas de
 * tarea con botón a la derecha) y el bloque «Esta semana» · columna angosta con un recuadro de contexto.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function FilasDeTarea({ n, delay = 0 }: { n: number; delay?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-3 w-3 rounded-full" delay={delay + i * 40} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-72 max-w-full" delay={delay + i * 40} />
            <Skeleton className="h-3 w-96 max-w-full" delay={delay + i * 40 + 20} />
          </div>
          <Skeleton className="h-7 w-20 rounded-lg" delay={delay + i * 40} />
        </div>
      ))}
    </div>
  );
}

export default function PendientesLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-96 max-w-full" action />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          <SkeletonPanel minH="min-h-[260px]" bodyClassName="p-0">
            <div className="px-4 pb-2.5 pt-3.5">
              <Skeleton className="h-4 w-24" />
            </div>
            <FilasDeTarea n={4} />
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[200px]" bodyClassName="p-0">
            <div className="px-4 pb-2.5 pt-3.5">
              <Skeleton className="h-4 w-28" delay={120} />
            </div>
            <FilasDeTarea n={3} delay={160} />
          </SkeletonPanel>
        </div>
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <SkeletonPanel minH="min-h-[120px]" bodyClassName="p-4 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full" delay={40} />
            <Skeleton className="h-3 w-3/4" delay={80} />
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
