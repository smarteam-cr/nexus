/**
 * Loading skeleton de /escala/[área].
 *
 * FORMA REAL (page.tsx → VistaDeLaEscala): `px-6 py-8` (SHELL_DEFAULT) > `space-y-4` con el
 * encabezado (título + chips a la izquierda, tres botones a la derecha), las pestañas de las áreas,
 * la fila de controles (vista + industria + perfil) y el MAPA, que es la vista de entrada desde el
 * 2026-10-04: la caja de la rueda (título, «Qué muestran las celdas» y «Recorrer») y, al costado, el
 * panel del detalle de 380 px. La rueda se reserva con su contorno punteado, no con un bloque.
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
          <Skeleton className="h-[30px] w-56" rounded="lg" delay={30} />
          <Skeleton className="h-[30px] w-80" rounded="lg" delay={60} />
          <Skeleton className="h-[30px] w-72" rounded="lg" delay={90} />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <SkeletonPanel minH="min-h-[34rem]" bodyClassName="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-80 max-w-full" delay={30} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-[38px] w-52" rounded="lg" delay={60} />
                <Skeleton className="h-[38px] w-56" rounded="lg" delay={90} />
              </div>
            </div>
            <div className="mx-auto aspect-square w-full max-w-[28rem] rounded-full border border-dashed border-line" aria-hidden />
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[16rem]" bodyClassName="space-y-3 p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" delay={30} />
            <Skeleton className="h-3 w-5/6" delay={60} />
            <Skeleton className="h-3 w-2/3" delay={90} />
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
