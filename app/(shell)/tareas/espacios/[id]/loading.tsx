/**
 * Loading de /tareas/espacios/[id].
 *
 * FORMA REAL: PageHeader con migas y «Miembros» · las tarjetas de los proyectos (nombre, barra de avance, quién) · la
 * franja de «Nuevo proyecto».
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function EspacioDeTareasLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-5 pb-12">
        <PageHeaderSkeleton titleWidth="w-64" descWidth="w-80" action />
        <Skeleton className="h-3 w-28" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonPanel key={i} minH="min-h-[104px]" bodyClassName="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-48" delay={i * 60} />
              <Skeleton className="h-1.5 w-full rounded-full" delay={i * 60 + 20} />
              <Skeleton className="h-3 w-40" delay={i * 60 + 40} />
            </SkeletonPanel>
          ))}
        </div>
        <SkeletonPanel minH="min-h-[76px]" bodyClassName="space-y-2 px-4 py-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-full rounded-lg" delay={40} />
        </SkeletonPanel>
      </div>
    </div>
  );
}
