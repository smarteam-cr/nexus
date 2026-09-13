/**
 * Loading de /finanzas/excel-vs-odoo.
 *
 * FORMA REAL (page.tsx → ExcelVsOdooPanel): PageHeader sin acción · una línea con las fechas del Excel y de
 * Odoo · dos tarjetas de lo pendiente (dólares y colones) en `md:grid-cols-2` · la lista de lo que no
 * coincide (encabezado con el filtro por dueño + renglones) · la nota al pie.
 */
import { CardsSkeleton, PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ExcelVsOdooLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-[28rem] max-w-full" />

      <div className="max-w-4xl space-y-4">
        {/* Fechas del Excel y de Odoo */}
        <Skeleton className="h-3 w-80 max-w-full" />

        {/* Lo pendiente por moneda */}
        <CardsSkeleton count={2} columns={2} breakpoint="md" variant="tile" minH="min-h-[104px]" className="gap-2" />

        {/* Lo que no coincide: encabezado con el filtro + renglones */}
        <SkeletonPanel
          minH="min-h-[320px]"
          bodyClassName="p-0"
          header={
            <div className="flex items-center gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-2.5 w-72 max-w-full" />
              </div>
              <Skeleton className="ml-auto h-6 w-48 flex-shrink-0" rounded="full" />
            </div>
          }
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5 border-b border-line px-4 py-3 last:border-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-10 flex-shrink-0" delay={i * 40} />
                <Skeleton className="h-3.5 w-72 max-w-full" delay={i * 40 + 20} />
                <Skeleton className="ml-auto h-3.5 w-20 flex-shrink-0" delay={i * 40 + 20} />
              </div>
              <Skeleton className="h-3 w-full" delay={i * 40 + 40} />
            </div>
          ))}
        </SkeletonPanel>

        {/* Nota al pie */}
        <Skeleton className="h-2.5 w-full max-w-2xl" />
      </div>
    </div>
  );
}
