/** Loading skeleton de /finanzas/costos — sub-nav + tiles de burn + tabla. */
import { PageHeaderSkeleton, Skeleton, CardsSkeleton, TableSkeleton } from "@/components/ui";

export default function CostosLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-64" action />

      {/* Sub-nav Costos fijos / Gastos / Movimientos */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-7 w-28" rounded="lg" />
        <Skeleton className="h-7 w-20" rounded="lg" delay={60} />
        <Skeleton className="h-7 w-28" rounded="lg" delay={120} />
      </div>

      {/* Tiles de burn mensual (CRC / USD) */}
      <CardsSkeleton count={2} columns={2} variant="tile" minH="min-h-[80px]" className="mb-6 max-w-xl" />

      <TableSkeleton columns={5} rows={8} />
    </div>
  );
}
