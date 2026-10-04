/**
 * Loading de /finanzas/cierre.
 *
 * FORMA REAL: PageHeader CON acción («Cerrar <mes>») · la tira del año (doce casillas) · a la izquierda la lista de lo
 * que falta (renglones con marca, texto, chip y enlace) · a la derecha dos recuadros (tipo de cambio, qué sigue).
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CierreLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-72" descWidth="w-[30rem] max-w-full" action />
      <SkeletonPanel minH="min-h-[120px]" bodyClassName="p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-[52px] rounded-lg" delay={i * 20} />
          ))}
        </div>
      </SkeletonPanel>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[2_1_560px]">
          <SkeletonPanel minH="min-h-[320px]" bodyClassName="p-4 space-y-4">
            <Skeleton className="h-5 w-48" />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded-full" delay={i * 40} />
                <Skeleton className="h-4 flex-1" delay={i * 40 + 20} />
                <Skeleton className="h-5 w-16 rounded-full" delay={i * 40 + 40} />
              </div>
            ))}
          </SkeletonPanel>
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {Array.from({ length: 2 }, (_, i) => (
            <SkeletonPanel key={i} minH="min-h-[140px]" bodyClassName="p-4 space-y-3">
              <Skeleton className="h-3 w-36" delay={i * 60} />
              <Skeleton className="h-6 w-44" delay={i * 60 + 20} />
              <Skeleton className="h-4 w-full" delay={i * 60 + 40} />
            </SkeletonPanel>
          ))}
        </div>
      </div>
    </div>
  );
}
