/**
 * Loading skeleton de /escala/tests.
 *
 * FORMA REAL (page.tsx → PantallaDeLosTests): `px-6 py-8` (SHELL_DEFAULT) > `gap-6` con el encabezado (título, chip de
 * la versión de la escala y un botón a la derecha), la fila de tres pestañas y la lista de las tres áreas, cada una con
 * su título y sus tarjetas de bancos.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function TestsLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="flex flex-col gap-6">
        <PageHeaderSkeleton titleWidth="w-64" descWidth="w-[36rem] max-w-full" action className="mb-0" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" rounded="lg" />
          <Skeleton className="h-8 w-28" rounded="lg" delay={30} />
          <Skeleton className="h-8 w-28" rounded="lg" delay={60} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" delay={i * 40} />
            <SkeletonPanel minH="min-h-[5rem]" bodyClassName="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-72" delay={i * 40 + 20} />
              <Skeleton className="h-3 w-[28rem] max-w-full" delay={i * 40 + 40} />
            </SkeletonPanel>
          </div>
        ))}
      </div>
    </div>
  );
}
