/**
 * Loading de /finanzas/gastos.
 *
 * FORMA REAL: PageHeader CON acción («Registrar gasto») · fila de mes (‹ · mes · › · chip) · tres tarjetas de cifra
 * (recurrentes, gastos puntuales, planilla) · la tabla de gastos puntuales · dos recuadros lado a lado.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function GastosDelMesLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeaderSkeleton titleWidth="w-44" descWidth="w-[28rem] max-w-full" action />
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-16 rounded-lg" />
        <Skeleton className="h-5 w-36" delay={40} />
        <Skeleton className="h-7 w-16 rounded-lg" delay={80} />
        <Skeleton className="h-5 w-28 rounded-full" delay={120} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonPanel key={i} minH="min-h-[96px]" bodyClassName="p-4 space-y-2">
            <Skeleton className="h-3 w-24" delay={i * 40} />
            <Skeleton className="h-6 w-32" delay={i * 40 + 20} />
            <Skeleton className="h-3 w-40" delay={i * 40 + 40} />
          </SkeletonPanel>
        ))}
      </div>
      <TableSkeleton columns={4} rows={5} />
    </div>
  );
}
