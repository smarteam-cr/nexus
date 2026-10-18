/**
 * Loading de /tareas/planificar («Planifica tu semana»).
 *
 * FORMA REAL: PageHeader con «← Mis tareas» · una línea de números · filas por cuenta con su cabecera (empresa y última
 * reunión) y dos columnas (la acción y la reunión), cada una con su rótulo y su caja.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Fila({ delay }: { delay: number }) {
  return (
    <SkeletonPanel minH="min-h-[190px]" bodyClassName="p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <Skeleton className="h-3.5 w-48" delay={delay} />
        <Skeleton className="h-3 w-28" delay={delay + 20} />
      </div>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-32" delay={delay + 40 + i * 20} />
            <Skeleton className="h-3.5 w-full max-w-[320px]" delay={delay + 60 + i * 20} />
            <Skeleton className="h-3 w-40" delay={delay + 80 + i * 20} />
          </div>
        ))}
      </div>
    </SkeletonPanel>
  );
}

export default function PlanificaTuSemanaLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6 pb-12")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-96" />
      <Skeleton className="h-3 w-80" />
      <div className="flex flex-col gap-3">
        <Fila delay={0} />
        <Fila delay={120} />
        <Fila delay={240} />
      </div>
    </div>
  );
}
