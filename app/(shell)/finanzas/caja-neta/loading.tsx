/** Loading skeleton de /finanzas/caja-neta — tiles + tabla de buckets. */
import { PageHeaderSkeleton, CardsSkeleton, TableSkeleton } from "@/components/ui";

export default function CajaNetaLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-72" />
      <CardsSkeleton count={3} columns={3} cardClassName="h-20" className="mb-6" />
      <TableSkeleton columns={4} rows={8} />
    </div>
  );
}
