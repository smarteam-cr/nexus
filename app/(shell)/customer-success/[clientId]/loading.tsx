/**
 * Loading skeleton del detalle de cuenta en Customer Success.
 *
 * FORMA REAL (page.tsx → AccountView, space-y-7): breadcrumb · PageHeader ·
 * barra de la cuenta (CSM/Growth/CSL + chips de fuente) · 🧭 Resumen (panel) ·
 * 📁 Proyectos activos (filas) · 📝 Últimas sesiones (filas).
 * NO hay grilla de 2 cards: eso era invento del skeleton viejo.
 */
import {
  PageHeaderSkeleton,
  Skeleton,
  SkeletonPanel,
  SkeletonText,
  ListSkeleton,
} from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CsClientLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      {/* "← Éxito del cliente" */}
      <div className="mb-1">
        <Skeleton className="h-2.5 w-32" />
      </div>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-64" />

      <div className="space-y-7">
        {/* Barra de la cuenta: una sola fila de metadatos + chips a la derecha. */}
        <SkeletonPanel
          minH="min-h-[46px]"
          bodyClassName="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5"
        >
          <Skeleton className="h-2.5 w-40" />
          <Skeleton className="h-2.5 w-32" delay={60} />
          <Skeleton className="h-2.5 w-24" delay={120} />
          <Skeleton className="h-4 w-28 ml-auto" rounded="full" delay={180} />
        </SkeletonPanel>

        {/* 🧭 Resumen de la cuenta — brief citado dentro de un panel p-4. */}
        <section>
          <Skeleton className="h-3.5 w-56 mb-2" />
          <SkeletonPanel minH="min-h-[148px]" bodyClassName="p-4">
            <SkeletonText lines={4} />
          </SkeletonPanel>
        </section>

        {/* 📁 Proyectos activos */}
        <section>
          <Skeleton className="h-3.5 w-40 mb-2" />
          <ListSkeleton rows={2} lines={2} trailing />
        </section>

        {/* 📝 Últimas sesiones */}
        <section>
          <Skeleton className="h-3.5 w-40 mb-2" />
          <ListSkeleton rows={3} lines={2} />
        </section>
      </div>
    </div>
  );
}
