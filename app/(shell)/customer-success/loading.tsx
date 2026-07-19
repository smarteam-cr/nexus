/**
 * Loading skeleton de /customer-success — loadPortfolio es la query más cara del
 * sistema; sin esto la navegación quedaba congelada. Replica el panel real:
 * header, bloque de alertas, grilla 2×2 del dashboard y la tabla del panel.
 */
import { PageHeaderSkeleton, Skeleton, CardsSkeleton, ListSkeleton } from "@/components/ui";

export default function CustomerSuccessLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-80" />

      {/* Alertas del watchdog */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-24" />
        <ListSkeleton rows={3} lines={1} />
      </div>

      {/* Dashboard 2×2 */}
      <CardsSkeleton count={4} columns={2} minH="min-h-[192px]" className="mb-6" />

      {/* Panel / tabla de cartera */}
      <Skeleton className="h-72 w-full" rounded="xl" />
    </div>
  );
}
