/**
 * Loading skeleton de /escala/comentarios (la bandeja).
 *
 * FORMA REAL (page.tsx → Bandeja): `px-6 py-8` > `space-y-4` con el encabezado (migas, título,
 * texto y el botón de exportar), la fila de filtros y, en dos columnas, la lista y el detalle.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function BandejaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-4">
        <PageHeaderSkeleton titleWidth="w-72" descWidth="w-[34rem] max-w-full" action className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-[30px] w-[28rem] max-w-full" rounded="lg" />
          <Skeleton className="h-[30px] w-28" rounded="lg" delay={40} />
          <Skeleton className="h-[30px] w-28" rounded="lg" delay={80} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <SkeletonPanel minH="min-h-[24rem]" bodyClassName="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" delay={i * 40} />
            ))}
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[18rem]" bodyClassName="space-y-3 p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" delay={40} />
            <Skeleton className="h-3 w-5/6" delay={60} />
            <Skeleton className="h-3 w-2/3" delay={80} />
            <Skeleton className="h-10 w-full" delay={100} />
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
