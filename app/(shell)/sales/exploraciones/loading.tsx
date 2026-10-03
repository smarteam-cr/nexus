/**
 * Loading skeleton de /sales/exploraciones (Preventa).
 *
 * FORMA REAL (page.tsx): dos columnas. A la izquierda, con `SHELL_DEFAULT`: migas «Ventas › Preventa»
 * arriba del título (por eso la línea fina extra: PageHeaderSkeleton no las dibuja) · «En curso»: el
 * título con sus filtros y el buscador, y la lista en un recuadro · «Planificar con una empresa»: el
 * buscador de HubSpot y su lista. A la derecha, el panel gris de «Llegaron por el test».
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ExploracionesLoading() {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <div className={cn(SHELL_DEFAULT, "min-w-0 flex-1")}>
        <Skeleton className="mb-2 h-2.5 w-36" />
        <PageHeaderSkeleton titleWidth="w-32" descWidth="w-[28rem]" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-72" rounded="lg" />
          </div>
          <Skeleton className="h-9 w-[260px]" rounded="lg" />
        </div>
        <div className="mb-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <div className="bg-surface-muted px-4 py-2.5">
            <Skeleton className="h-3 w-2/3" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5 px-4 py-3.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ))}
        </div>
        <SkeletonPanel minH="min-h-[22rem]">
          <div className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[38px] w-full" rounded="lg" />
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </SkeletonPanel>
      </div>
      <div className="border-t border-line bg-surface-muted px-5 py-8 lg:w-[360px] lg:flex-shrink-0 lg:border-l lg:border-t-0">
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-info-line bg-info-surface p-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-3 w-40" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
              <Skeleton className="h-5 w-32" rounded="full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
