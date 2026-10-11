/**
 * Loading de /tareas/delegadas (Lo que delegaste).
 *
 * FORMA REAL: PageHeader con dos acciones · la fila de filtros (segmentado, persona, cuántas abiertas) · grupos con
 * borde (Atrasadas, Todavía no deciden, En curso, Pendientes), cada uno con su rótulo y sus filas de dos o tres líneas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Grupo({ filas, delay }: { filas: number; delay: number }) {
  return (
    <SkeletonPanel minH={filas > 2 ? "min-h-[220px]" : "min-h-[150px]"} bodyClassName="p-0">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Skeleton className="h-3 w-28" delay={delay} />
        <Skeleton className="h-3 w-5" delay={delay + 20} />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="space-y-1.5 px-4 py-3">
            <Skeleton className="h-3.5 w-72 max-w-full" delay={delay + i * 40} />
            <Skeleton className="h-3 w-56 max-w-full" delay={delay + i * 40 + 20} />
            <Skeleton className="h-3 w-80 max-w-full" delay={delay + i * 40 + 40} />
          </div>
        ))}
      </div>
    </SkeletonPanel>
  );
}

export default function LoQueDelegasteLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-5 pb-12")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-96" action />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-72 rounded-lg" />
        <Skeleton className="h-8 w-56 rounded-md" delay={40} />
        <Skeleton className="h-3 w-24" delay={80} />
      </div>
      <Grupo filas={2} delay={0} />
      <Grupo filas={3} delay={120} />
    </div>
  );
}
