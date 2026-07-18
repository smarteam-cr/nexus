/** Loading skeleton de /team — mismo ancho que la página (max-w-3xl). */
import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui";

export default function TeamLoading() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-64" />
      <TableSkeleton columns={3} rows={6} />
    </div>
  );
}
