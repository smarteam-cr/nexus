/**
 * Loading de /finanzas/recurrentes.
 *
 * FORMA REAL: PageHeader CON acción («Agregar costo») · un bloque por categoría (Herramientas, Fijos de operación), cada
 * uno con su encabezado y sus filas.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function RecurrentesLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-5`}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[28rem] max-w-full" action />
      {Array.from({ length: 2 }, (_, b) => (
        <SkeletonPanel key={b} minH="min-h-[240px]" bodyClassName="p-0">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-4 w-32" delay={b * 80} />
            <Skeleton className="ml-auto h-3 w-24" delay={b * 80} />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-2.5">
              <Skeleton className="h-3.5 w-56 max-w-full" delay={b * 80 + i * 30} />
              <Skeleton className="ml-auto h-3.5 w-24" delay={b * 80 + i * 30} />
              <Skeleton className="h-6 w-20 rounded-lg" delay={b * 80 + i * 30} />
            </div>
          ))}
        </SkeletonPanel>
      ))}
    </div>
  );
}
