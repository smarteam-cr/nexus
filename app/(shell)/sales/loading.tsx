/** Loading skeleton de /sales (Cartera) — header + tabla con toolbar. */
import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui";

export default function SalesLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-72" />
      <TableSkeleton columns={5} rows={8} toolbar />
    </div>
  );
}
