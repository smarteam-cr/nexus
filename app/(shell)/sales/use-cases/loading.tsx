/**
 * Loading de /sales/use-cases (el catálogo de casos de uso).
 *
 * FORMA REAL (page.tsx → CatalogoDeCasos, la lista): `SHELL_DEFAULT` con una columna de 1180 px · encabezado con
 * el selector de vista y la acción · las cinco pestañas de tipo · el buscador y los cuatro filtros · y los grupos de tarjetas en una grilla de 420 px.
 * La espera es la lectura de la escala publicada (una fila, parseada una vez por versión): casi nunca se ve.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonTabs } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CasosDeUsoLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[32rem]" action className="mb-0" />
        <SkeletonTabs count={5} />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-[280px] flex-1" rounded="lg" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-40" rounded="lg" delay={i * 40} />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-6 max-sm:grid-cols-1">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[260px]" className="rounded-xl p-6">
                <Skeleton className="h-5 w-56" rounded="full" />
                <Skeleton className="mt-4 h-5 w-3/4" />
                <Skeleton className="mt-4 h-3.5 w-full" />
                <Skeleton className="mt-2 h-3.5 w-5/6" />
              </SkeletonPanel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
