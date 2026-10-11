/**
 * Loading de /tareas/equipo (la Semana del equipo).
 *
 * FORMA REAL: PageHeader con dos acciones · la fila de los selectores · una columna por persona (nombre, horas, barra y
 * sus filas) · a la derecha, el mismo PanelLateral con «Por asignar», lo pedido a otros equipos y los proyectos.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import PanelLateral from "@/components/ui/PanelLateral";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Columna({ delay }: { delay: number }) {
  return (
    <SkeletonPanel minH="min-h-[260px]" bodyClassName="p-0">
      <div className="space-y-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-36" delay={delay} />
          <Skeleton className="ml-auto h-3 w-20" delay={delay + 20} />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" delay={delay + 40} />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
            <Skeleton className="mt-[3px] h-[18px] w-[18px] rounded-full" delay={delay + i * 40} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-56 max-w-full" delay={delay + i * 40} />
              <Skeleton className="h-3 w-32 max-w-full" delay={delay + i * 40 + 20} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPanel>
  );
}

export default function SemanaDelEquipoLoading() {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <div className={cn(SHELL_DEFAULT, "min-w-0 flex-1 space-y-5 pb-12")}>
        <PageHeaderSkeleton titleWidth="w-48" descWidth="w-72" action />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-3 w-32" delay={40} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <Columna delay={0} />
          <Columna delay={120} />
        </div>
      </div>
      <PanelLateral etiqueta="El equipo" ancho="lg:w-[340px]">
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <SkeletonPanel minH="min-h-[88px]" bodyClassName="space-y-2 p-3">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3.5 w-40" delay={40} />
            </SkeletonPanel>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-12 w-full rounded-lg" delay={40} />
          </div>
        </div>
      </PanelLateral>
    </div>
  );
}
