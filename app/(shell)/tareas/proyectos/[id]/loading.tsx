/**
 * Loading de /tareas/proyectos/[id].
 *
 * FORMA REAL: PageHeader con migas · la franja de datos (responsable, fechas, avance, para quién) · los segmentados de la
 * vista · la lista de tareas (o el tablero, del mismo alto).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ProyectoDeTareasLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-5 pb-12">
        <PageHeaderSkeleton titleWidth="w-72" descWidth="w-80" />
        <SkeletonPanel minH="min-h-[64px]" bodyClassName="grid gap-4 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" delay={i * 30} />
              <Skeleton className="h-3.5 w-32" delay={i * 30 + 20} />
            </div>
          ))}
        </SkeletonPanel>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-8 w-48 rounded-lg" delay={40} />
        </div>
        <SkeletonPanel minH="min-h-[320px]" bodyClassName="divide-y divide-line p-0">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5">
              <Skeleton className="mt-[3px] h-[18px] w-[18px] rounded-full" delay={i * 40} />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-72 max-w-full" delay={i * 40} />
                <Skeleton className="h-3 w-40 max-w-full" delay={i * 40 + 20} />
              </div>
            </div>
          ))}
        </SkeletonPanel>
      </div>
    </div>
  );
}
