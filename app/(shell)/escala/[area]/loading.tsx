/**
 * Loading skeleton de /escala/[área].
 *
 * FORMA REAL (page.tsx → VistaDeLaEscala): `px-6 py-8` (SHELL_DEFAULT) > `space-y-4` con el
 * encabezado (título + chips a la izquierda, tres botones a la derecha), las pestañas de las áreas,
 * la fila de controles (vista + perfil) y la matriz: una caja delineada con su fila de niveles.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonTabs } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function EscalaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-4">
        <PageHeaderSkeleton titleWidth="w-64" descWidth="w-[40rem] max-w-full" action className="mb-0" />
        <SkeletonTabs count={3} />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-[30px] w-64" rounded="lg" />
          <Skeleton className="h-[30px] w-80" rounded="lg" delay={40} />
          <Skeleton className="h-[30px] w-72" rounded="lg" delay={80} />
        </div>
        <SkeletonPanel minH="min-h-[26rem]" bodyClassName="p-0">
          <div className="grid grid-cols-6 gap-px border-b border-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-3 py-3">
                <Skeleton className="h-3 w-24" delay={i * 30} />
              </div>
            ))}
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" delay={i * 50} />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}
