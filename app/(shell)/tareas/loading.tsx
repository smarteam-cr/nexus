/**
 * Loading de /tareas (Mis tareas).
 *
 * FORMA REAL: PageHeader con tres acciones · la línea para anotar · la fila del buscador y los filtros · los bloques
 * «Esta semana» y «Más adelante» (encabezado + filas con el círculo, el título y sus chips) · a la derecha, el mismo
 * PanelLateral con «Qué sigue», las horas y los proyectos.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import PanelLateral from "@/components/ui/PanelLateral";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Filas({ n, delay = 0 }: { n: number; delay?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5">
          <Skeleton className="mt-[3px] h-[18px] w-[18px] rounded-full" delay={delay + i * 40} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-72 max-w-full" delay={delay + i * 40} />
            <Skeleton className="h-3 w-48 max-w-full" delay={delay + i * 40 + 20} />
          </div>
          <Skeleton className="h-3 w-8" delay={delay + i * 40} />
        </div>
      ))}
    </div>
  );
}

export default function TareasLoading() {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <div className={cn(SHELL_DEFAULT, "min-w-0 flex-1 space-y-5 pb-12")}>
        <PageHeaderSkeleton titleWidth="w-32" descWidth="w-72" action />
        <SkeletonPanel minH="min-h-[46px]" bodyClassName="flex items-center gap-2 px-3 py-2">
          <Skeleton className="h-4 w-64" />
        </SkeletonPanel>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-full" delay={40} />
          <Skeleton className="h-6 w-24 rounded-full" delay={80} />
        </div>
        <SkeletonPanel minH="min-h-[260px]" bodyClassName="p-0">
          <div className="border-b border-line px-4 py-2.5">
            <Skeleton className="h-4 w-32" />
          </div>
          <Filas n={5} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[140px]" bodyClassName="p-0">
          <div className="border-b border-line px-4 py-2.5">
            <Skeleton className="h-4 w-28" />
          </div>
          <Filas n={2} delay={200} />
        </SkeletonPanel>
      </div>
      <PanelLateral etiqueta="Tu semana" ancho="lg:w-[320px]">
        <div className="space-y-6">
          <SkeletonPanel minH="min-h-[96px]" bodyClassName="space-y-2 p-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-56" delay={40} />
          </SkeletonPanel>
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-7 w-28" delay={40} />
          </div>
        </div>
      </PanelLateral>
    </div>
  );
}
