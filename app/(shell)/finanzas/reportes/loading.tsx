/**
 * Loading de /finanzas/reportes.
 *
 * FORMA REAL: PageHeader sin acción · pestañas subrayadas (Proyección · Reportes · Corte quincenal) · la Proyección, que
 * es la que abre: una fila de tarjetas de cifra y un gráfico de barras.
 */
import { PageHeaderSkeleton, SkeletonPanel, SkeletonTabs, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ReportesCobranzaLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-4`}>
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-[28rem] max-w-full" />
      <SkeletonTabs count={3} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonPanel key={i} minH="min-h-[88px]" bodyClassName="p-3 space-y-2">
            <Skeleton className="h-3 w-24" delay={i * 40} />
            <Skeleton className="h-5 w-28" delay={i * 40 + 20} />
          </SkeletonPanel>
        ))}
      </div>
      {/* El gráfico de barras por quincena: el eje y las barras, no un bloque macizo. */}
      <SkeletonPanel minH="min-h-[280px]" bodyClassName="p-4 flex items-end gap-3 h-[260px]">
        {["h-[40%]", "h-[65%]", "h-[50%]", "h-[80%]", "h-[35%]", "h-[55%]"].map((h, i) => (
          <Skeleton key={i} className={`w-full ${h}`} delay={200 + i * 40} />
        ))}
      </SkeletonPanel>
    </div>
  );
}
