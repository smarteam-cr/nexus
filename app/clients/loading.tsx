/**
 * Loading skeleton para /clients — tabla de clientes.
 */

import { Skeleton, TableSkeleton } from "@/components/ui";

export default function ClientsLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* PageHeader */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>

      <TableSkeleton columns={7} rows={9} toolbar />
    </div>
  );
}
