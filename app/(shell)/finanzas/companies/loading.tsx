/**
 * Loading de /finanzas/companies.
 *
 * FORMA REAL: PageHeader CON acción («Actualizar») · las pestañas · una fila de tarjetas de saldos entre sociedades ·
 * una lista de movimientos (fecha, de quién a quién, monto, referencia).
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function SociedadesLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[30rem] max-w-full" action />
      <Skeleton className="h-9 w-80 rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonPanel key={i} minH="min-h-[110px]" bodyClassName="p-4 space-y-3">
            <Skeleton className="h-3 w-40" delay={i * 40} />
            <Skeleton className="h-6 w-32" delay={i * 40 + 20} />
            <Skeleton className="h-3 w-24" delay={i * 40 + 40} />
          </SkeletonPanel>
        ))}
      </div>
      <SkeletonPanel minH="min-h-[320px]" bodyClassName="p-4 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" delay={i * 30} />
            <Skeleton className="h-4 flex-1" delay={i * 30 + 15} />
            <Skeleton className="h-4 w-24" delay={i * 30 + 30} />
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
