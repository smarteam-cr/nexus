/**
 * Loading skeleton de /finanzas/modelo-de-comisiones.
 *
 * FORMA REAL (page.tsx → ModeloDeComisiones): PageHeader con un chip y un enlace · dos pestañas · la pestaña que abre
 * por defecto, «Cómo funciona»: cuatro tarjetas de resumen y las secciones de dos columnas (texto + calculadora).
 */
import { CardsSkeleton, PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonTabs } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ComisionesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton titleWidth="w-32" descWidth="w-[24rem] max-w-full" />
        <SkeletonTabs count={2} />
        <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[110px]" className="gap-3" />
        {[0, 1, 2].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[300px]" bodyClassName="p-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" delay={i * 60} />
              <Skeleton className="h-3 w-full" delay={i * 60 + 40} />
              <Skeleton className="h-3 w-5/6" delay={i * 60 + 80} />
              <Skeleton className="h-3 w-2/3" delay={i * 60 + 120} />
            </div>
            <div className="min-h-[240px] rounded-[10px] border border-line bg-surface-muted" />
          </SkeletonPanel>
        ))}
      </div>
    </div>
  );
}
