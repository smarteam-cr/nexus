/**
 * Loading skeleton de /escala/borrador.
 *
 * FORMA REAL (page.tsx → PantallaDelBorrador): `px-6 py-8` (SHELL_DEFAULT) > `gap-6` con el
 * encabezado (título, chip de la versión y un botón a la derecha), la tarjeta del borrador (una línea
 * de datos, la ayuda y la fila de cuatro botones) y la bitácora: su título y tarjetas de cambios.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function BorradorLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="flex flex-col gap-6">
        <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[36rem] max-w-full" action className="mb-0" />
        <SkeletonPanel minH="min-h-[10rem]" bodyClassName="flex flex-col gap-4 p-5">
          <Skeleton className="h-4 w-[28rem] max-w-full" />
          <Skeleton className="h-3 w-[32rem] max-w-full" delay={30} />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-[38px] w-32" rounded="lg" delay={60} />
            <Skeleton className="h-[38px] w-52" rounded="lg" delay={90} />
            <Skeleton className="h-[38px] w-40" rounded="lg" delay={120} />
            <Skeleton className="h-[38px] w-44" rounded="lg" delay={150} />
          </div>
        </SkeletonPanel>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-64" />
          {[0, 1, 2].map((i) => (
            <SkeletonPanel key={i} minH="min-h-[6rem]" bodyClassName="flex flex-col gap-2 p-4">
              <Skeleton className="h-3 w-72" delay={i * 40} />
              <Skeleton className="h-4 w-full" delay={i * 40 + 20} />
              <Skeleton className="h-4 w-5/6" delay={i * 40 + 40} />
            </SkeletonPanel>
          ))}
        </div>
      </div>
    </div>
  );
}
