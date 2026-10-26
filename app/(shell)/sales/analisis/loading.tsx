/**
 * Loading de /sales/analisis («Análisis de la venta», S7).
 *
 * FORMA REAL: PageHeader con migas (Ventas › Preventa) · las dos pestañas · una tarjeta por vendedor: su nombre y una tabla
 * corta mes a mes.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function AnalisisDeLaVentaLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-[30rem] max-w-full" />
      <div className="flex gap-6 border-b border-line pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" delay={20} />
      </div>
      {[0, 1].map((v) => (
        <SkeletonPanel key={v} minH="min-h-[160px]" bodyClassName="divide-y divide-line">
          <div className="px-4 py-3">
            <Skeleton className="h-4 w-40" delay={v * 40} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-2.5">
              <Skeleton className="h-3 w-16" delay={v * 40 + i * 20} />
              <Skeleton className="h-3 w-[60%]" delay={v * 40 + i * 20 + 10} />
            </div>
          ))}
        </SkeletonPanel>
      ))}
    </div>
  );
}
